const fs = require('fs');
const path = require('path');
const config = require('../config');

let isPg = false;
let pgPool = null;
let sqliteDb = null;
let SQL = null;
let inTransaction = false;

const rawDbPath = process.env.DB_PATH || config.DB_PATH || config.DB_FILE_PATH || './data/tavlive_auth.db';
const dbPath = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.join(__dirname, '..', '..', rawDbPath);

function convertPlaceholders(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

function saveSqliteDb() {
  if (!sqliteDb || inTransaction) return;
  try {
    const data = sqliteDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {}
}

async function initDatabase() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();

  if (databaseUrl) {
    // PostgreSQL / Supabase Mode
    isPg = true;
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    });

    console.info('[Database] Conectando a PostgreSQL / Supabase...');

    const pgInitQueries = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        tiktok_username TEXT UNIQUE,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT,
        provider TEXT NOT NULL DEFAULT 'credentials',
        google_id TEXT UNIQUE,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tiktok_username TEXT,
        key TEXT UNIQUE NOT NULL,
        license_key TEXT,
        plan TEXT NOT NULL DEFAULT 'FREE',
        status TEXT NOT NULL DEFAULT 'active',
        max_devices INT DEFAULT 1,
        device_limit INT DEFAULT 1,
        activated_at TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        device_identifier TEXT NOT NULL,
        device_name TEXT,
        os_platform TEXT,
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CONSTRAINT unique_license_device UNIQUE(license_id, device_identifier)
      );`,

      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT,
        refresh_token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );`
    ];

    for (const q of pgInitQueries) {
      await pgPool.query(q).catch(e => console.warn('[PostgreSQL Init]', e.message));
    }

    await pgPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS tiktok_username TEXT;').catch(() => {});
    await pgPool.query('ALTER TABLE licenses ADD COLUMN IF NOT EXISTS tiktok_username TEXT;').catch(() => {});
    await pgPool.query('ALTER TABLE licenses ADD COLUMN IF NOT EXISTS key TEXT;').catch(() => {});
    await pgPool.query('ALTER TABLE licenses ADD COLUMN IF NOT EXISTS license_key TEXT;').catch(() => {});
    await pgPool.query('ALTER TABLE licenses ADD COLUMN IF NOT EXISTS max_devices INT DEFAULT 1;').catch(() => {});
    await pgPool.query('ALTER TABLE licenses ADD COLUMN IF NOT EXISTS device_limit INT DEFAULT 1;').catch(() => {});
    await pgPool.query('UPDATE licenses SET key = license_key WHERE key IS NULL AND license_key IS NOT NULL;').catch(() => {});
    await pgPool.query('UPDATE licenses SET license_key = key WHERE license_key IS NULL AND key IS NOT NULL;').catch(() => {});
    await pgPool.query('UPDATE licenses SET max_devices = device_limit WHERE max_devices IS NULL AND device_limit IS NOT NULL;').catch(() => {});
    await pgPool.query('UPDATE licenses SET device_limit = max_devices WHERE device_limit IS NULL AND max_devices IS NOT NULL;').catch(() => {});

    console.info('[Database] PostgreSQL / Supabase inicializado con éxito.');
    return pgPool;
  } else {
    // SQLite Local Mode
    isPg = false;
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const initSqlJs = require('sql.js');
    SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      try {
        const fileBuffer = fs.readFileSync(dbPath);
        sqliteDb = new SQL.Database(fileBuffer);
      } catch (err) {
        console.warn('[Database] Existing DB file unreadable, creating new clean database instance.');
        sqliteDb = new SQL.Database();
      }
    } else {
      sqliteDb = new SQL.Database();
    }

    sqliteDb.run("PRAGMA foreign_keys = ON;");
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

    try {
      sqliteDb.exec(schemaSql);
    } catch (err) {}

    try {
      sqliteDb.exec("ALTER TABLE users ADD COLUMN tiktok_username TEXT;");
    } catch (e) {}

    try {
      sqliteDb.exec("ALTER TABLE licenses ADD COLUMN tiktok_username TEXT;");
    } catch (e) {}

    try {
      sqliteDb.exec("ALTER TABLE licenses ADD COLUMN license_key TEXT;");
    } catch (e) {}

    try {
      sqliteDb.exec(schemaSql);
    } catch (err) {}

    saveSqliteDb();
    console.info('[Database] SQLite local inicializado con éxito en:', dbPath);
    return sqliteDb;
  }
}

const dbHelper = {
  async init() {
    return await initDatabase();
  },

  getDb() {
    if (isPg) return pgPool;
    if (!sqliteDb) throw new Error("Database not initialized. Call dbHelper.init() first.");
    return sqliteDb;
  },

  query(sql, params = []) {
    if (isPg) {
      const convertedSql = convertPlaceholders(sql);
      return pgPool.query(convertedSql, params).then(res => res.rows || []);
    }

    const stmt = sqliteDb.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  queryOne(sql, params = []) {
    if (isPg) {
      const convertedSql = convertPlaceholders(sql);
      return pgPool.query(convertedSql, params).then(res => (res.rows && res.rows.length > 0 ? res.rows[0] : null));
    }

    const rows = this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  },

  execute(sql, params = []) {
    if (isPg) {
      const convertedSql = convertPlaceholders(sql);
      return pgPool.query(convertedSql, params).then(() => {});
    }

    sqliteDb.run(sql, params);
    saveSqliteDb();
    return Promise.resolve();
  },

  async transaction(fn) {
    if (isPg) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } else {
      try {
        inTransaction = true;
        sqliteDb.exec('BEGIN TRANSACTION;');
        const result = await fn();
        sqliteDb.exec('COMMIT;');
        inTransaction = false;
        saveSqliteDb();
        return result;
      } catch (err) {
        inTransaction = false;
        try { sqliteDb.exec('ROLLBACK;'); } catch (e) {}
        throw err;
      }
    }
  }
};

module.exports = dbHelper;
