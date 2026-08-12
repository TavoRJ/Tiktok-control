const crypto = require('crypto');
const dbHelper = require('../db/database');

const deviceService = {
  registerOrGetDevice({ userId, licenseId = null, deviceIdentifier, deviceName = 'Desktop PC', osPlatform = 'win32' }) {
    if (!userId || !deviceIdentifier) {
      throw new Error('userId and deviceIdentifier are required.');
    }

    let existing = dbHelper.queryOne(
      'SELECT * FROM devices WHERE user_id = ? AND device_identifier = ?',
      [userId, deviceIdentifier]
    );

    const now = new Date().toISOString();

    if (existing) {
      if (existing.status === 'revoked') {
        throw new Error('This device has been revoked by an administrator.');
      }
      dbHelper.execute(
        'UPDATE devices SET last_seen = ?, device_name = ?, os_platform = ? WHERE id = ?',
        [now, deviceName, osPlatform, existing.id]
      );
      return dbHelper.queryOne('SELECT * FROM devices WHERE id = ?', [existing.id]);
    }

    // Lookup active license ID if available
    let effectiveLicenseId = licenseId;
    if (!effectiveLicenseId) {
      const activeLicense = dbHelper.queryOne('SELECT id FROM licenses WHERE user_id = ? AND status = "active"', [userId]);
      if (activeLicense) {
        effectiveLicenseId = activeLicense.id;
      }
    }

    // Subphase 8B: Device count restriction removed! All executables are allowed access as long as user/license is active.
    const id = crypto.randomUUID();
    dbHelper.execute(
      `INSERT INTO devices (id, user_id, license_id, device_identifier, device_name, os_platform, last_seen, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, effectiveLicenseId, deviceIdentifier, deviceName, osPlatform, now, 'authorized', now]
    );

    return dbHelper.queryOne('SELECT * FROM devices WHERE id = ?', [id]);
  },

  revokeDevice(deviceId) {
    dbHelper.execute('UPDATE devices SET status = "revoked" WHERE id = ?', [deviceId]);
    // Revoke active sessions for this device
    dbHelper.execute('UPDATE sessions SET revoked_at = ? WHERE device_id = ?', [new Date().toISOString(), deviceId]);
    return dbHelper.queryOne('SELECT * FROM devices WHERE id = ?', [deviceId]);
  },

  listUserDevices(userId) {
    return dbHelper.query('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }
};

module.exports = deviceService;
