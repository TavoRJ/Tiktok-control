const crypto = require('crypto');
const dbHelper = require('../db/database');

const deviceService = {
  async registerOrGetDevice({ userId, licenseId = null, deviceIdentifier, deviceName = 'Desktop PC', osPlatform = 'win32' }) {
    if (!userId || !deviceIdentifier) {
      throw new Error('userId and deviceIdentifier are required.');
    }

    let existing = await dbHelper.queryOne(
      'SELECT * FROM devices WHERE user_id = ? AND device_identifier = ?',
      [userId, deviceIdentifier]
    );

    const now = new Date().toISOString();

    if (existing) {
      if (existing.status === 'revoked') {
        throw new Error('This device has been revoked by an administrator.');
      }
      await dbHelper.execute(
        'UPDATE devices SET last_seen = ?, device_name = ?, os_platform = ? WHERE id = ?',
        [now, deviceName, osPlatform, existing.id]
      );
      return this.findById(existing.id);
    }

    // Lookup active license ID if available
    let effectiveLicenseId = licenseId;
    if (!effectiveLicenseId) {
      const activeLicense = await dbHelper.queryOne('SELECT id FROM licenses WHERE user_id = ? AND status = ?', [userId, 'active']);
      if (activeLicense) {
        effectiveLicenseId = activeLicense.id;
      }
    }

    const id = crypto.randomUUID();
    await dbHelper.execute(
      `INSERT INTO devices (id, user_id, license_id, device_identifier, device_name, os_platform, last_seen, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, effectiveLicenseId, deviceIdentifier, deviceName, osPlatform, now, 'authorized', now]
    );

    return this.findById(id);
  },

  findById(id) {
    return dbHelper.queryOne('SELECT * FROM devices WHERE id = ?', [id]);
  },

  async revokeDevice(deviceId) {
    await dbHelper.execute('UPDATE devices SET status = ? WHERE id = ?', ['revoked', deviceId]);
    await dbHelper.execute('UPDATE sessions SET revoked_at = ? WHERE device_id = ?', [new Date().toISOString(), deviceId]).catch(() => {});
    return this.findById(deviceId);
  },

  listUserDevices(userId) {
    return dbHelper.query('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }
};

module.exports = deviceService;
