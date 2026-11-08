const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET ||
  (process.env.VERCEL || process.env.NODE_ENV === 'production'
    ? null
    : 'shramic-local-secret');

async function createUser({ name, email, password, role, location, skill }) {
  const hash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare(`
    INSERT INTO users (name, email, password, role, location, skill)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const info = await stmt.run(name, email.toLowerCase(), hash, role, location || '', skill || '');
  return getUserById(info.lastInsertRowid);
}

async function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

async function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

async function validateLogin(email, password) {
  const user = await getUserByEmail(email);
  if (!user) return null;

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return null;

  return user;
}

function signToken(user) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured in production.');
  }
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = {
  createUser,
  getUserById,
  getUserByEmail,
  validateLogin,
  signToken,
  JWT_SECRET
};
