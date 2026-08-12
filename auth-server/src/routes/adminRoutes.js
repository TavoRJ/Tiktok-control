const express = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');
const userService = require('../services/userService');
const licenseService = require('../services/licenseService');
const deviceService = require('../services/deviceService');
const sessionService = require('../services/sessionService');
const dbHelper = require('../db/database');

const router = express.Router();

router.use(requireAdmin);

// Admin: Overview for Web Admin Dashboard (Subphase 8B/8C: TikTok Username focused)
router.get('/overview', async (req, res, next) => {
  try {
    const users = await dbHelper.query(`
      SELECT u.id, u.tiktok_username, u.email, u.name, u.role, u.status, u.provider, u.created_at,
             l.id as license_id, l.key as license_key, l.plan, l.status as license_status,
             l.max_devices, l.expires_at, l.tiktok_username as license_tiktok_username
      FROM users u
      LEFT JOIN licenses l ON l.user_id = u.id AND l.id = (
        SELECT id FROM licenses WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      )
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

// Admin: Create User with TikTok Username & License (Subphase 8B supporting both username & email)
const createUserSchema = z.object({
  tiktokUsername: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['user', 'admin']).default('user'),
  status: z.enum(['active', 'suspended', 'banned']).default('active'),
  plan: z.enum(['FREE', 'PRO', 'VIP']).default('PRO'),
  expiresAt: z.string().nullable().optional()
});

router.post('/users', validate(createUserSchema), async (req, res, next) => {
  try {
    let { tiktokUsername, name, password, email, role, status, plan, expiresAt } = req.body;
    
    if (!tiktokUsername && email) {
      tiktokUsername = email.split('@')[0];
    }
    if (!email && tiktokUsername) {
      email = `${tiktokUsername.replace('@', '')}@tavlive.local`;
    }

    if (!tiktokUsername && !email) {
      return res.status(400).json({ success: false, error: 'Se requiere @tiktok_username o email.' });
    }

    let user = null;
    let license = null;

    try {
      await dbHelper.transaction(async () => {
        user = await userService.createUser({
          tiktokUsername,
          email,
          name,
          password,
          role,
          status
        });

        license = await licenseService.createLicense({
          userId: user.id,
          plan: plan || 'PRO',
          expiresAt: expiresAt || null,
          tiktokUsername: tiktokUsername
        });
      });
    } catch (createErr) {
      if (user && user.id) {
        await userService.deleteUser(user.id).catch(() => {});
      }
      throw createErr;
    }

    res.status(201).json({ success: true, user, license });
  } catch (err) {
    next(err);
  }
});

// Admin: Update User Status
const updateStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'banned'])
});

router.patch('/users/:id/status', validate(updateStatusSchema), async (req, res, next) => {
  try {
    const user = await userService.updateStatus(req.params.id, req.body.status);
    if (req.body.status !== 'active') {
      await sessionService.revokeAllUserSessions(req.params.id);
    }
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// Admin: Reset / Change User Password (Subphase 8C)
const updatePasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters')
});

router.put('/users/:id/password', validate(updatePasswordSchema), async (req, res, next) => {
  try {
    const user = await userService.updatePassword(req.params.id, req.body.password);
    await sessionService.revokeAllUserSessions(req.params.id);
    res.json({ success: true, message: 'Contraseña actualizada con éxito.', user });
  } catch (err) {
    next(err);
  }
});

// Admin: Delete Creator User (Subphase 8C)
router.delete('/users/:id', async (req, res, next) => {
  try {
    await sessionService.revokeAllUserSessions(req.params.id);
    await userService.deleteUser(req.params.id);
    res.json({ success: true, message: 'Creador eliminado exitosamente.' });
  } catch (err) {
    next(err);
  }
});

// Admin: Assign / Create License
const createLicenseSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  plan: z.enum(['FREE', 'PRO', 'VIP']).default('PRO'),
  expiresAt: z.string().nullable().optional(),
  tiktokUsername: z.string().nullable().optional()
});

router.post('/licenses', validate(createLicenseSchema), async (req, res, next) => {
  try {
    const license = await licenseService.createLicense(req.body);
    res.status(201).json({ success: true, license });
  } catch (err) {
    next(err);
  }
});

// Admin: Extend License Expiration (+30 Days or custom) (Subphase 8C)
router.post('/licenses/:id/extend', async (req, res, next) => {
  try {
    const days = (req.body && req.body.days) ? Number(req.body.days) : 30;
    const license = await licenseService.extendLicense(req.params.id, days);
    res.json({ success: true, license });
  } catch (err) {
    next(err);
  }
});

// Admin: Update License
const updateLicenseSchema = z.object({
  plan: z.enum(['FREE', 'PRO', 'VIP']).optional(),
  status: z.enum(['active', 'expired', 'revoked', 'paused']).optional(),
  expiresAt: z.string().nullable().optional(),
  tiktokUsername: z.string().nullable().optional()
});

router.patch('/licenses/:id', validate(updateLicenseSchema), async (req, res, next) => {
  try {
    let license = await licenseService.findById(req.params.id);
    if (!license) {
      return res.status(404).json({ success: false, error: 'License not found.' });
    }

    if (req.body.plan) {
      license = await licenseService.updatePlan(req.params.id, req.body.plan);
    }

    if (req.body.status) {
      license = await licenseService.updateStatus(req.params.id, req.body.status);
    }

    if (req.body.expiresAt !== undefined) {
      license = await licenseService.updateExpiresAt(req.params.id, req.body.expiresAt);
    }

    if (req.body.tiktokUsername !== undefined) {
      license = await licenseService.updateTiktokUsername(req.params.id, req.body.tiktokUsername);
    }

    res.json({ success: true, license });
  } catch (err) {
    next(err);
  }
});

// Admin: List Devices for a User
router.get('/devices/user/:userId', async (req, res, next) => {
  try {
    const devices = await deviceService.listUserDevices(req.params.userId);
    res.json({ success: true, devices });
  } catch (err) {
    next(err);
  }
});

// Admin: Revoke Device
router.post('/devices/:id/revoke', async (req, res, next) => {
  try {
    const device = await deviceService.revokeDevice(req.params.id);
    res.json({ success: true, device });
  } catch (err) {
    next(err);
  }
});

// Admin: Revoke all sessions for a user
router.post('/users/:id/revoke-sessions', async (req, res, next) => {
  try {
    await sessionService.revokeAllUserSessions(req.params.id);
    res.json({ success: true, message: 'All sessions revoked for user.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
