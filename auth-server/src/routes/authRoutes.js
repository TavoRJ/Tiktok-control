const express = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { loginRateLimiter } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth');
const userService = require('../services/userService');
const passwordService = require('../services/passwordService');
const tokenService = require('../services/tokenService');
const sessionService = require('../services/sessionService');
const licenseService = require('../services/licenseService');
const deviceService = require('../services/deviceService');
const googleAuthService = require('../services/googleAuthService');

const router = express.Router();

const loginSchema = z.object({
  tiktokUsername: z.string().optional(),
  email: z.string().optional(),
  identifier: z.string().optional(),
  password: z.string().min(1, 'Password is required'),
  deviceIdentifier: z.string().optional(),
  deviceName: z.string().optional(),
  osPlatform: z.string().optional()
});

router.post('/login', loginRateLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { tiktokUsername, email, identifier, password, deviceIdentifier = `DEV-${Date.now()}`, deviceName = 'Desktop PC', osPlatform = 'win32' } = req.body;

    const targetIdentifier = tiktokUsername || identifier || email;
    if (!targetIdentifier) {
      return res.status(400).json({ success: false, error: 'Se requiere el usuario de TikTok para iniciar sesión.' });
    }

    const user = await userService.findByIdentifier(targetIdentifier);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuario de TikTok o contraseña incorrectos.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Cuenta suspendida. Por favor contacta a administración.' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ success: false, error: 'Cuenta baneada permanentemente.' });
    }

    if (user.provider !== 'credentials' || !user.password_hash) {
      return res.status(400).json({ success: false, error: `Esta cuenta utiliza inicio de sesión por ${user.provider}.` });
    }

    const isValidPassword = await passwordService.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Usuario de TikTok o contraseña incorrectos.' });
    }

    // Verify license status and temporal expiration (expires_at)
    const latestLicense = await licenseService.findLatestByUserId(user.id);
    if (!latestLicense) {
      return res.status(403).json({ success: false, error: 'No se encontró una licencia activa asociada a esta cuenta.' });
    }

    if (latestLicense.status === 'revoked') {
      return res.status(403).json({ success: false, error: 'Licencia revocada por administración.' });
    }
    if (latestLicense.status === 'paused') {
      return res.status(403).json({ success: false, error: 'Licencia en pausa.' });
    }
    if (licenseService.isLicenseExpired(latestLicense)) {
      return res.status(403).json({ success: false, error: 'Licencia expirada. Por favor renueva tu suscripción.' });
    }

    const license = latestLicense;

    // Register or get device (Subphase 8B: Device count restriction removed)
    let device = null;
    try {
      device = await deviceService.registerOrGetDevice({
        userId: user.id,
        licenseId: license ? license.id : null,
        deviceIdentifier,
        deviceName,
        osPlatform
      });
    } catch (deviceErr) {
      if (deviceErr.message && deviceErr.message.includes('revoked')) {
        return res.status(403).json({ success: false, error: deviceErr.message });
      }
    }

    // Issue Refresh Token & Access Token
    const refreshToken = tokenService.generateRefreshToken();
    const session = await sessionService.createSession({
      userId: user.id,
      deviceId: device ? device.id : null,
      refreshToken
    });

    const accessTokenPayload = {
      sub: user.id,
      email: user.email,
      tiktok_username: user.tiktok_username || (license ? license.tiktok_username : null),
      role: user.role,
      sessionId: session.id,
      deviceId: device ? device.id : null
    };

    const accessToken = tokenService.generateAccessToken(accessTokenPayload);

    const effectiveLicense = license ? {
      ...license,
      tiktok_username: license.tiktok_username || user.tiktok_username
    } : null;

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        tiktok_username: user.tiktok_username || (license ? license.tiktok_username : null),
        name: user.name,
        role: user.role,
        provider: user.provider
      },
      license: effectiveLicense,
      device: device ? { id: device.id, deviceIdentifier: device.device_identifier, name: device.device_name } : null
    });
  } catch (err) {
    next(err);
  }
});

// Google OAuth Login / Register
const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
  deviceIdentifier: z.string().optional(),
  deviceName: z.string().optional(),
  osPlatform: z.string().optional()
});

router.post('/google', loginRateLimiter, validate(googleLoginSchema), async (req, res, next) => {
  try {
    const { idToken, deviceIdentifier = `DEV-${Date.now()}`, deviceName = 'Desktop PC', osPlatform = 'win32' } = req.body;

    const payload = await googleAuthService.verifyGoogleIdToken(idToken);
    const googleUser = await userService.findOrCreateGoogleUser({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name
    });

    if (googleUser.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Account is suspended.' });
    }
    if (googleUser.status === 'banned') {
      return res.status(403).json({ success: false, error: 'Account is permanently banned.' });
    }

    let latestLicense = await licenseService.findLatestByUserId(googleUser.id);
    if (!latestLicense) {
      latestLicense = await licenseService.createLicense({ userId: googleUser.id, plan: 'FREE' });
    }

    if (latestLicense.status === 'revoked' || latestLicense.status === 'paused' || licenseService.isLicenseExpired(latestLicense)) {
      return res.status(403).json({ success: false, error: 'License is not active or has expired.' });
    }

    let device = null;
    try {
      device = await deviceService.registerOrGetDevice({
        userId: googleUser.id,
        licenseId: latestLicense.id,
        deviceIdentifier,
        deviceName,
        osPlatform
      });
    } catch (dErr) {}

    const refreshToken = tokenService.generateRefreshToken();
    const session = await sessionService.createSession({
      userId: googleUser.id,
      deviceId: device ? device.id : null,
      refreshToken
    });

    const accessTokenPayload = {
      sub: googleUser.id,
      email: googleUser.email,
      tiktok_username: googleUser.tiktok_username || latestLicense.tiktok_username,
      role: googleUser.role,
      sessionId: session.id,
      deviceId: device ? device.id : null
    };

    const accessToken = tokenService.generateAccessToken(accessTokenPayload);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: googleUser.id,
        email: googleUser.email,
        tiktok_username: googleUser.tiktok_username || latestLicense.tiktok_username,
        name: googleUser.name,
        role: googleUser.role,
        provider: googleUser.provider
      },
      license: latestLicense
    });
  } catch (err) {
    next(err);
  }
});

// Refresh Access Token
const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required')
});

router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const session = await sessionService.findValidSessionByRefreshToken(refreshToken);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
    }

    const user = await userService.findById(session.user_id);
    if (!user || user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Account is not active.' });
    }

    const license = await licenseService.findLatestByUserId(user.id);
    if (licenseService.isLicenseExpired(license)) {
      return res.status(403).json({ success: false, error: 'License expired.' });
    }

    const newAccessTokenPayload = {
      sub: user.id,
      email: user.email,
      tiktok_username: user.tiktok_username || (license ? license.tiktok_username : null),
      role: user.role,
      sessionId: session.id,
      deviceId: session.device_id
    };

    const accessToken = tokenService.generateAccessToken(newAccessTokenPayload);

    res.json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        tiktok_username: user.tiktok_username || (license ? license.tiktok_username : null),
        name: user.name,
        role: user.role
      },
      license
    });
  } catch (err) {
    next(err);
  }
});

// Logout
const logoutSchema = z.object({
  refreshToken: z.string().optional()
});

router.post('/logout', requireAuth, validate(logoutSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await sessionService.revokeSession(refreshToken).catch(() => {});
    } else if (req.user && (req.user.sessionId || req.user.id)) {
      await sessionService.revokeAllUserSessions(req.user.id);
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// Auth Status / Me (Heartbeat)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.sub;
    const user = await userService.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const license = await licenseService.findLatestByUserId(user.id);
    if (licenseService.isLicenseExpired(license)) {
      return res.status(403).json({ success: false, error: 'License expired.' });
    }

    const effectiveLicense = license ? {
      ...license,
      tiktok_username: license.tiktok_username || user.tiktok_username
    } : null;

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        tiktok_username: user.tiktok_username || (license ? license.tiktok_username : null),
        name: user.name,
        role: user.role,
        status: user.status
      },
      license: effectiveLicense
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
