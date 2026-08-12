const crypto = require('crypto');
const dbHelper = require('../db/database');

const ALLOWED_PLANS = ['FREE', 'PRO', 'VIP'];

const PLAN_DEFAULT_MAX_DEVICES = {
  FREE: 1,
  PRO: 2,
  VIP: 5
};

function generateLicenseKey(plan = 'PRO') {
  const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `TAVLIVE-${plan}-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

const licenseService = {
  ALLOWED_PLANS,
  PLAN_DEFAULT_MAX_DEVICES,

  async createLicense({ userId, plan = 'PRO', maxDevices = null, expiresAt = null, tiktokUsername = null }) {
    const upperPlan = plan.toUpperCase().trim();
    if (!ALLOWED_PLANS.includes(upperPlan)) {
      throw new Error(`Invalid plan '${plan}'. Allowed plans: ${ALLOWED_PLANS.join(', ')}`);
    }

    const effectiveMaxDevices = maxDevices !== null && maxDevices !== undefined
      ? maxDevices
      : (PLAN_DEFAULT_MAX_DEVICES[upperPlan] || 2);

    const id = crypto.randomUUID();
    const key = generateLicenseKey(upperPlan);
    const createdAt = new Date().toISOString();
    const cleanTiktok = tiktokUsername ? String(tiktokUsername).replace('@', '').trim() : null;

    await dbHelper.execute(
      `INSERT INTO licenses (id, user_id, key, license_key, plan, status, max_devices, expires_at, tiktok_username, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, key, key, upperPlan, 'active', effectiveMaxDevices, expiresAt, cleanTiktok, createdAt]
    );

    return this.findById(id);
  },

  findById(id) {
    return dbHelper.queryOne('SELECT * FROM licenses WHERE id = ?', [id]);
  },

  findByUserId(userId) {
    return dbHelper.queryOne('SELECT * FROM licenses WHERE user_id = ? AND status = ?', [userId, 'active']);
  },

  findLatestByUserId(userId) {
    return dbHelper.queryOne('SELECT * FROM licenses WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  },

  isLicenseExpired(license) {
    if (!license) return true;
    if (license.status !== 'active') return true;
    if (license.expires_at) {
      const expiresDate = new Date(license.expires_at);
      const now = new Date();
      if (isNaN(expiresDate.getTime()) || expiresDate.getTime() <= now.getTime()) {
        return true;
      }
    }
    return false;
  },

  async updatePlan(id, plan, maxDevices = null) {
    const upperPlan = plan.toUpperCase().trim();
    if (!ALLOWED_PLANS.includes(upperPlan)) {
      throw new Error(`Invalid plan '${plan}'. Allowed plans: ${ALLOWED_PLANS.join(', ')}`);
    }

    const effectiveMaxDevices = maxDevices !== null && maxDevices !== undefined
      ? maxDevices
      : PLAN_DEFAULT_MAX_DEVICES[upperPlan];

    await dbHelper.execute(
      'UPDATE licenses SET plan = ?, max_devices = ? WHERE id = ?',
      [upperPlan, effectiveMaxDevices, id]
    );

    return this.findById(id);
  },

  async updateStatus(id, status) {
    if (!['active', 'expired', 'revoked', 'paused'].includes(status)) {
      throw new Error('Invalid license status.');
    }
    await dbHelper.execute('UPDATE licenses SET status = ? WHERE id = ?', [status, id]);
    return this.findById(id);
  },

  async updateExpiresAt(id, expiresAt) {
    await dbHelper.execute('UPDATE licenses SET expires_at = ? WHERE id = ?', [expiresAt, id]);
    return this.findById(id);
  },

  async updateTiktokUsername(id, tiktokUsername) {
    const cleanTiktok = tiktokUsername ? String(tiktokUsername).replace('@', '').trim() : null;
    await dbHelper.execute('UPDATE licenses SET tiktok_username = ? WHERE id = ?', [cleanTiktok, id]);
    return this.findById(id);
  },

  async extendLicense(id, days = 30) {
    const license = await this.findById(id);
    if (!license) throw new Error('Licencia no encontrada.');

    let baseDate = new Date();
    if (license.expires_at) {
      const currentExpiry = new Date(license.expires_at);
      if (!isNaN(currentExpiry.getTime()) && currentExpiry.getTime() > baseDate.getTime()) {
        baseDate = currentExpiry;
      }
    }

    baseDate.setDate(baseDate.getDate() + Number(days));
    const newExpiresAt = baseDate.toISOString();

    await dbHelper.execute('UPDATE licenses SET expires_at = ?, status = ? WHERE id = ?', [newExpiresAt, 'active', id]);
    return this.findById(id);
  }
};

module.exports = licenseService;
