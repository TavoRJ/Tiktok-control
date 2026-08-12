const { v4: uuidv4 } = require('crypto');
const dbHelper = require('../db/database');
const passwordService = require('./passwordService');

function generateUuid() {
  const crypto = require('crypto');
  return crypto.randomUUID();
}

function cleanHandle(handle) {
  if (!handle) return '';
  return String(handle).replace('@', '').trim().toLowerCase();
}

const userService = {
  async createUser({ tiktokUsername = null, email = null, name = null, password = null, provider = 'credentials', googleId = null, role = 'user', status = 'active' }) {
    const cleanTiktok = cleanHandle(tiktokUsername);
    const finalEmail = email ? email.toLowerCase().trim() : (cleanTiktok ? `${cleanTiktok}@tavlive.local` : null);
    const finalName = name ? name.trim() : (cleanTiktok ? `@${cleanTiktok}` : 'Usuario TavLive');

    if (!finalEmail) {
      throw new Error('Debe proporcionar un @tiktok_username o un correo electrónico.');
    }

    const existingEmail = dbHelper.queryOne('SELECT id FROM users WHERE email = ?', [finalEmail]);
    if (existingEmail) {
      throw new Error('El usuario o email ya se encuentra registrado.');
    }

    if (cleanTiktok) {
      const existingTiktok = dbHelper.queryOne('SELECT id FROM users WHERE tiktok_username = ?', [cleanTiktok]);
      if (existingTiktok) {
        throw new Error(`El usuario de TikTok @${cleanTiktok} ya está registrado.`);
      }
    }

    let passwordHash = null;
    if (provider === 'credentials') {
      if (!password) {
        throw new Error('Password is required for credentials provider.');
      }
      passwordHash = await passwordService.hashPassword(password);
    }

    const id = generateUuid();
    const createdAt = new Date().toISOString();

    dbHelper.execute(
      `INSERT INTO users (id, tiktok_username, email, name, password_hash, provider, google_id, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, cleanTiktok || null, finalEmail, finalName, passwordHash, provider, googleId, role, status, createdAt]
    );

    return this.findById(id);
  },

  findById(id) {
    const user = dbHelper.queryOne('SELECT id, tiktok_username, email, name, provider, google_id, role, status, created_at FROM users WHERE id = ?', [id]);
    return user;
  },

  findByEmail(email) {
    if (!email) return null;
    const user = dbHelper.queryOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    return user;
  },

  findByTiktokUsername(tiktokUsername) {
    const clean = cleanHandle(tiktokUsername);
    if (!clean) return null;

    let user = dbHelper.queryOne('SELECT * FROM users WHERE tiktok_username = ?', [clean]);
    if (user) return user;

    const license = dbHelper.queryOne('SELECT user_id FROM licenses WHERE tiktok_username = ?', [clean]);
    if (license && license.user_id) {
      user = this.findById(license.user_id);
      if (user) return user;
    }

    user = dbHelper.queryOne('SELECT * FROM users WHERE email = ? OR email LIKE ?', [`${clean}@tavlive.local`, `${clean}@%`]);
    return user;
  },

  findByIdentifier(identifier) {
    if (!identifier) return null;
    const clean = cleanHandle(identifier);
    let user = this.findByTiktokUsername(clean);
    if (user) return user;
    user = this.findByEmail(identifier);
    return user;
  },

  findByGoogleId(googleId) {
    return dbHelper.queryOne('SELECT * FROM users WHERE google_id = ?', [googleId]);
  },

  async findOrCreateGoogleUser({ googleId, email, name }) {
    if (!googleId || !email) {
      throw new Error('Google ID (sub) and email are required for Google OAuth.');
    }

    const cleanEmail = email.toLowerCase().trim();

    let user = this.findByGoogleId(googleId);
    if (user) {
      return user;
    }

    user = this.findByEmail(cleanEmail);
    if (user) {
      dbHelper.execute('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
      return this.findById(user.id);
    }

    const id = generateUuid();
    const createdAt = new Date().toISOString();

    dbHelper.execute(
      `INSERT INTO users (id, tiktok_username, email, name, password_hash, provider, google_id, role, status, created_at)
       VALUES (?, NULL, ?, ?, NULL, 'google', ?, 'user', 'active', ?)`,
      [id, cleanEmail, name ? name.trim() : cleanEmail.split('@')[0], googleId, createdAt]
    );

    return this.findById(id);
  },

  updateStatus(id, status) {
    if (!['active', 'suspended', 'banned'].includes(status)) {
      throw new Error('Invalid status. Allowed: active, suspended, banned');
    }
    dbHelper.execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    return this.findById(id);
  },

  updateRole(id, role) {
    if (!['user', 'admin'].includes(role)) {
      throw new Error('Invalid role. Allowed: user, admin');
    }
    dbHelper.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    return this.findById(id);
  },

  async updatePassword(id, newPassword) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }
    const user = this.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado.');
    }
    const passwordHash = await passwordService.hashPassword(newPassword);
    dbHelper.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
    return this.findById(id);
  },

  deleteUser(id) {
    const user = this.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado.');
    }
    // Delete sessions, devices, licenses, and user
    dbHelper.execute('DELETE FROM sessions WHERE user_id = ?', [id]);
    dbHelper.execute('DELETE FROM devices WHERE user_id = ?', [id]);
    dbHelper.execute('DELETE FROM licenses WHERE user_id = ?', [id]);
    dbHelper.execute('DELETE FROM users WHERE id = ?', [id]);
    return true;
  }
};

module.exports = userService;
