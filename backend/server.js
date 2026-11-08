const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { createUser, validateLogin, signToken, getUserById } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const projectRoot = path.join(__dirname, '..');
const frontendDirectory = path.join(projectRoot, 'frontend');

app.use(cors());
app.use(express.json());
app.use(express.static(frontendDirectory, { index: false }));

app.get('/shramic.css', (req, res) => res.sendFile(path.join(projectRoot, 'shramic.css')));
app.get('/shramic.js', (req, res) => res.sendFile(path.join(projectRoot, 'shramic.js')));
app.get('/i18n.js', (req, res) => res.sendFile(path.join(projectRoot, 'i18n.js')));
app.get('/manifest.webmanifest', (req, res) => res.sendFile(path.join(projectRoot, 'manifest.webmanifest')));
app.get('/service-worker.js', (req, res) => {
  res.set('Service-Worker-Allowed', '/');
  res.sendFile(path.join(projectRoot, 'service-worker.js'));
});
app.get('/icons/:iconName', (req, res, next) => {
  if (!['icon-192.png', 'icon-512.png'].includes(req.params.iconName)) return next();
  res.sendFile(path.join(projectRoot, 'icons', req.params.iconName));
});

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const jwt = require('jsonwebtoken');

  let decoded;
  try {
    decoded = jwt.verify(token, require('./auth').JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = await getUserById(decoded.id);
  if (!req.user) return res.status(401).json({ error: 'User not found' });
  next();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDirectory, 'login.html'));
});

app.get('/api/health', async (req, res) => {
  await db.initialize();
  res.json({ message: 'Shramic Local API is running' });
});

app.post('/api/register', async (req, res) => {
  const { name, email, password, role, location, skill } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password and role are required.' });
  }

  if (!['worker', 'contractor'].includes(role)) {
    return res.status(400).json({ error: 'Role must be worker or contractor.' });
  }

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'User already exists.' });
  }

  try {
    const user = await createUser({ name, email, password, role, location, skill });
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await validateLogin(email, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  const { id, name, email, role, location, skill } = req.user;
  res.json({ id, name, email, role, location, skill });
});

app.put('/api/me', requireAuth, async (req, res) => {
  const { name, location, skill } = req.body;

  if (typeof name !== 'string' || !name.trim() ||
      typeof location !== 'string' || !location.trim() ||
      typeof skill !== 'string') {
    return res.status(400).json({ error: 'Name, location and skill are required.' });
  }

  await db.prepare('UPDATE users SET name = ?, location = ?, skill = ? WHERE id = ?')
    .run(name.trim(), location.trim(), skill.trim(), req.user.id);

  const { id, email, role } = await getUserById(req.user.id);
  res.json({ id, name: name.trim(), email, role, location: location.trim(), skill: skill.trim() });
});

app.get('/api/jobs', requireAuth, async (req, res) => {
  const jobs = await db.prepare(`
    SELECT j.*, u.name AS contractor_name
    FROM jobs j
    LEFT JOIN users u ON u.id = j.contractor_id
    ORDER BY j.created_at DESC
  `).all();

  res.json(jobs);
});

app.post('/api/jobs', requireAuth, async (req, res) => {
  if (req.user.role !== 'contractor') {
    return res.status(403).json({ error: 'Only contractors can post jobs.' });
  }

  const { title, location, wage, workers, date, description } = req.body;
  if (!title || !location || !wage || !workers || !date) {
    return res.status(400).json({ error: 'Missing required job details.' });
  }

  const info = await db.prepare(`
    INSERT INTO jobs (title, location, wage, workers, date, description, contractor_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(title, location, Number(wage), Number(workers), date, description || '', req.user.id);

  const job = await db.prepare('SELECT * FROM jobs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(job);
});

app.post('/api/jobs/:jobId/apply', requireAuth, async (req, res) => {
  if (req.user.role !== 'worker') {
    return res.status(403).json({ error: 'Only workers can apply.' });
  }

  const { jobId } = req.params;
  const job = await db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  const alreadyApplied = await db.prepare('SELECT id FROM applications WHERE job_id = ? AND worker_id = ?').get(jobId, req.user.id);
  if (alreadyApplied) {
    return res.status(409).json({ error: 'You already applied.' });
  }

  const info = await db.prepare(`
    INSERT INTO applications (job_id, worker_id, status)
    VALUES (?, ?, 'Applied')
  `).run(jobId, req.user.id);

  res.status(201).json({ id: info.lastInsertRowid, message: 'Application submitted.' });
});

app.get('/api/applications', requireAuth, async (req, res) => {
  if (req.user.role === 'worker') {
    const rows = await db.prepare(`
      SELECT a.*, j.title, j.location, j.wage, j.contractor_id, u.name AS contractor_name
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN users u ON u.id = j.contractor_id
      WHERE a.worker_id = ?
      ORDER BY a.applied_at DESC
    `).all(req.user.id);
    return res.json(rows);
  }

  const rows = await db.prepare(`
    SELECT a.*, j.title, j.location, j.wage, u.name AS worker_name
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN users u ON u.id = a.worker_id
    WHERE j.contractor_id = ?
    ORDER BY a.applied_at DESC
  `).all(req.user.id);

  res.json(rows);
});

app.put('/api/applications/:applicationId', requireAuth, async (req, res) => {
  if (req.user.role !== 'contractor') {
    return res.status(403).json({ error: 'Only contractors can update application status.' });
  }

  const { applicationId } = req.params;
  const { status } = req.body;

  if (!['Selected', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Selected or Rejected.' });
  }

  const app = await db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
  if (!app) return res.status(404).json({ error: 'Application not found.' });

  const job = await db.prepare('SELECT * FROM jobs WHERE id = ?').get(app.job_id);
  if (!job || job.contractor_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only update your own jobs.' });
  }

  await db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, applicationId);
  res.json({ message: 'Application updated.' });
});

app.post('/api/jobs/:jobId/complete', requireAuth, async (req, res) => {
  if (req.user.role !== 'contractor') {
    return res.status(403).json({ error: 'Only contractors can complete jobs.' });
  }

  const { jobId } = req.params;
  const job = await db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job || job.contractor_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only complete your own jobs.' });
  }

  await db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('completed', jobId);
  res.json({ message: 'Job marked completed.' });
});

app.get('/api/payments', requireAuth, async (req, res) => {
  if (req.user.role === 'worker') {
    const rows = await db.prepare(`
      SELECT p.*, j.title AS job_title, u.name AS contractor_name
      FROM payments p
      JOIN jobs j ON j.id = p.job_id
      JOIN users u ON u.id = p.contractor_id
      WHERE p.worker_id = ?
    `).all(req.user.id);
    return res.json(rows);
  }

  const rows = await db.prepare(`
    SELECT p.*, j.title AS job_title, u.name AS worker_name
    FROM payments p
    JOIN jobs j ON j.id = p.job_id
    JOIN users u ON u.id = p.worker_id
    WHERE p.contractor_id = ?
  `).all(req.user.id);

  res.json(rows);
});

app.post('/api/payments', requireAuth, async (req, res) => {
  if (req.user.role !== 'contractor') {
    return res.status(403).json({ error: 'Only contractors can record payments.' });
  }

  const { jobId, workerId, amount } = req.body;
  const job = await db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job || job.contractor_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only record payments for your own jobs.' });
  }

  if (!Number.isInteger(Number(workerId)) ||
      !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'A valid worker and payment amount are required.' });
  }

  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Complete the job before recording payment.' });
  }

  const selectedApplication = await db.prepare(`
    SELECT id FROM applications
    WHERE job_id = ? AND worker_id = ? AND status = 'Selected'
  `).get(jobId, Number(workerId));
  if (!selectedApplication) {
    return res.status(400).json({ error: 'Payments can only be recorded for selected workers.' });
  }

  const exists = await db.prepare('SELECT id FROM payments WHERE job_id = ? AND worker_id = ?').get(jobId, workerId);
  if (exists) {
    return res.status(409).json({ error: 'Payment already recorded.' });
  }

  const info = await db.prepare(`
    INSERT INTO payments (job_id, worker_id, contractor_id, amount)
    VALUES (?, ?, ?, ?)
  `).run(jobId, Number(workerId), req.user.id, Number(amount));

  res.status(201).json({ id: info.lastInsertRowid, message: 'Payment recorded.' });
});

if (require.main === module) {
  db.initialize().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Shramic Local server running on port ${PORT}`);
    });
  }).catch(error => {
    console.error('Could not initialize Shramic Local database:', error);
    process.exitCode = 1;
  });
}

module.exports = app;
