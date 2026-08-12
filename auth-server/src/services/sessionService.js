const crypto = require('crypto');
const dbHelper = require('../db/database');
const tokenService = require('./tokenService');

const sessionService = {
  createSession({ userId, deviceId = null, refreshToken }) {
    const id = crypto.randomUUID();
    const refreshHash = tokenService.hashRefreshToken(refreshToken);
    const createdAt = new Date().toISOString();
    
    // 7 days expiration for refresh tokens
    const expiresAtDate = new Date();
    expiresAtDate.setDate(expiresAtDate.getDate() + 7);
    const expiresAt = expiresAtDate.toISOString();

    dbHelper.execute(
      `INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [id, userId, deviceId, refreshHash, createdAt, expiresAt]
    );

    return this.findById(id);
  },

  findById(id) {
    return dbHelper.queryOne('SELECT * FROM sessions WHERE id = ?', [id]);
  },

  findValidSessionByRefreshToken(rawRefreshToken) {
    const refreshHash = tokenService.hashRefreshToken(rawRefreshToken);
    const session = dbHelper.queryOne(
      'SELECT * FROM sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL',
      [refreshHash]
    );

    if (!session) return null;

    if (new Date(session.expires_at) < new Date()) {
      this.revokeSession(session.id);
      return null;
    }

    // Verify if associated device has been revoked
    if (session.device_id) {
      const device = dbHelper.queryOne('SELECT status FROM devices WHERE id = ?', [session.device_id]);
      if (device && device.status === 'revoked') {
        this.revokeSession(session.id);
        return null;
      }
    }

    return session;
  },

  revokeSession(sessionId) {
    const now = new Date().toISOString();
    dbHelper.execute('UPDATE sessions SET revoked_at = ? WHERE id = ?', [now, sessionId]);
  },

  revokeAllUserSessions(userId) {
    const now = new Date().toISOString();
    dbHelper.execute('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [now, userId]);
  }
};

module.exports = sessionService;
