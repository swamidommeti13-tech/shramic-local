const path = require('path');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (process.env.VERCEL && !connectionString) {
  throw new Error('Configure POSTGRES_URL for the Vercel deployment.');
}
let postgres;
let sqlite;
let initialization;

const postgresSchema = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('worker', 'contractor')),
    location TEXT,
    skill TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `
  CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    wage INTEGER NOT NULL,
    workers INTEGER NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    contractor_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `
  CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id),
    worker_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'Applied',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, worker_id)
  )`,
  `
  CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id),
    worker_id INTEGER NOT NULL REFERENCES users(id),
    contractor_id INTEGER NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
];

if (connectionString) {
  const { neon } = require('@neondatabase/serverless');
  postgres = neon(connectionString);
} else {
  const Database = require('better-sqlite3');
  const dbFile = path.join(__dirname, '..', 'data', 'shramic.db');
  sqlite = new Database(dbFile);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('worker', 'contractor')),
      location TEXT,
      skill TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      wage INTEGER NOT NULL,
      workers INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      contractor_id INTEGER NOT NULL,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contractor_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      worker_id INTEGER NOT NULL,
      status TEXT DEFAULT 'Applied',
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (worker_id) REFERENCES users(id),
      UNIQUE(job_id, worker_id)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      worker_id INTEGER NOT NULL,
      contractor_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (worker_id) REFERENCES users(id),
      FOREIGN KEY (contractor_id) REFERENCES users(id)
    );
  `);
}

function initialize() {
  if (!postgres) return Promise.resolve();
  if (!initialization) {
    initialization = postgresSchema.reduce(
      (pending, statement) => pending.then(() => postgres.query(statement)),
      Promise.resolve()
    ).catch(error => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

function postgresSql(sql) {
  let parameterIndex = 0;
  return sql.replace(/\?/g, () => `$${++parameterIndex}`);
}

function prepare(sql) {
  if (sqlite) {
    const statement = sqlite.prepare(sql);
    return {
      async get(...parameters) { return statement.get(...parameters); },
      async all(...parameters) { return statement.all(...parameters); },
      async run(...parameters) { return statement.run(...parameters); }
    };
  }

  const query = postgresSql(sql);
  return {
    async get(...parameters) {
      await initialize();
      const rows = await postgres.query(query, parameters);
      return rows[0];
    },
    async all(...parameters) {
      await initialize();
      return postgres.query(query, parameters);
    },
    async run(...parameters) {
      await initialize();
      const insertQuery = /^\s*INSERT\b/i.test(query) && !/\bRETURNING\b/i.test(query)
        ? `${query.trim().replace(/;$/, '')} RETURNING id`
        : query;
      const rows = await postgres.query(insertQuery, parameters);
      return {
        changes: rows.length,
        lastInsertRowid: rows[0]?.id
      };
    }
  };
}

module.exports = {
  prepare,
  initialize,
  isPostgres: Boolean(postgres)
};
