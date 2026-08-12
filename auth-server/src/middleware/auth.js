const config = require('../config');
const tokenService = require('../services/tokenService');
const userService = require('../services/userService');
const dbHelper = require('../db/database');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Token missing.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = tokenService.verifyAccessToken(token);

    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Invalid or expired token.' });
    }

    // Verify user still exists and is active
    const user = await userService.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized. User no longer exists.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: `Account is ${user.status}. Access denied.` });
    }

    // Verify if device in token has been revoked by administration
    if (decoded.deviceId) {
      const device = await dbHelper.queryOne('SELECT status FROM devices WHERE id = ?', [decoded.deviceId]);
      if (device && device.status === 'revoked') {
        return res.status(403).json({ success: false, error: 'This device has been revoked by an administrator.' });
      }
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Error processing authorization.' });
  }
}

function requireAdmin(req, res, next) {
  const expectedKey = (process.env.ADMIN_API_KEY || process.env.X_ADMIN_KEY || process.env.ADMIN_KEY || config.ADMIN_API_KEY || 'TavLiveMasterSecretKey2026!').trim();

  // Extract raw admin key from headers, body, query or Bearer token
  const rawKey = req.headers['x-admin-key'] 
    || req.headers['X-Admin-Key'] 
    || req.headers['x_admin_key'] 
    || (req.body && req.body.adminKey) 
    || (req.query && req.query.adminKey) 
    || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (rawKey && String(rawKey).trim() === expectedKey) {
    return next();
  }

  requireAuth(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      return next();
    }
    return res.status(403).json({ success: false, error: 'Forbidden. Admin privileges required.' });
  });
}

module.exports = {
  requireAuth,
  requireAdmin
};
