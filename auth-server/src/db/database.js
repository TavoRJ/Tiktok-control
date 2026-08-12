const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const config = require('../config');

const dbPath = path.isAbsolute(config.DB_FILE_PATH)
  ? config.DB_FILE_PATH
  : path.join(__dirname, '..', '..', config.DB_FILE_PATH);

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } catch (err) {
      console.warn('[Database] Existing DB file unreadable, creating new clean database instance.');
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON;");

  // Read schema SQL
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

  // Safely execute schema tables creation first
  try {
    db.exec(schemaSql);
  } catch (err) {
    // If schemaSql fails due to index or column mismatch on existing DB, run dynamic migrations first
  }

  // Dynamic Migration for Subphase 8B: Ensure tiktok_username column in users and licenses
  try {
    db.exec("ALTER TABLE users ADD COLUMN tiktok_username TEXT;");
  } catch (e) {
    // Column already exists - ignore error
  }

  try {
    db.exec("ALTER TABLE licenses ADD COLUMN tiktok_username TEXT;");
  } catch (e) {
    // Column already exists - ignore error
  }

  // Re-run schema execution to ensure all tables, columns, and indexes exist
  try {
    db.exec(schemaSql);
  } catch (err) {
    // Ignore harmless duplicates if indexes already exist
  }

  saveDb();

  return db;
}

// Database helper functions mirroring standard DB driver interface
const dbHelper = {
  async init() {
    return await initDatabase();
  },

  getDb() {
    if (!db) throw new Error("Database not initialized. Call dbHelper.init() first.");
    return db;
  },

  query(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  queryOne(sql, params = []) {
    const rows = this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  },

  execute(sql, params = []) {
    db.run(sql, params);
    saveDb();
  }
};

module.exports = dbHelper;
