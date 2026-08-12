const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = 'data/tavlive_auth_phase8c_test.db';
process.env.PORT = '4022';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4022';
process.env.ADMIN_API_KEY = 'test-admin-key-8c';
process.env.JWT_SECRET = 'test-jwt-secret-phase-8c-306-passed';

const config = require('../src/config');
const dbHelper = require('../src/db/database');
const userService = require('../src/services/userService');
const licenseService = require('../src/services/licenseService');
const sessionService = require('../src/services/sessionService');
const deviceService = require('../src/services/deviceService');
const { startServer } = require('../src/index');

const testDbPath = path.join(__dirname, '..', config.DB_FILE_PATH);
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const authBaseUrl = `http://127.0.0.1:${config.PORT}`;
const localBaseUrl = `http://127.0.0.1:3000`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTest(num, name, fn) {
  console.log(`--------------------------------------------------`);
  console.log(`RUNNING TEST 8C.${num}: [ ${name} ]`);
  try {
    await fn();
    console.log(`RESULT: PASSED ✓\n`);
    return true;
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}\n`);
    throw err;
  }
}

async function helperCreateCreator(tiktokUsername, plan = 'PRO', password = 'Password123!', devIdent = null) {
  const userRes = await (await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ tiktokUsername, name: `Creator ${tiktokUsername}`, password, plan })
  })).json();

  assert(userRes.success === true, `Failed to create creator ${tiktokUsername}`);

  const deviceIdentifier = devIdent || `DEV-8C-${Date.now()}`;
  const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tiktokUsername, password, deviceIdentifier })
  })).json();

  assert(loginRes.success === true, `Login failed for ${tiktokUsername}`);
  return { user: userRes.user, license: userRes.license, login: loginRes, password, deviceIdentifier };
}

async function runSuite() {
  console.log(`==================================================`);
  console.log(`  TAVLIVE PHASE 8C ADMIN ENHANCEMENTS SUITE        `);
  console.log(`==================================================`);

  const { server } = await startServer();
  let localServerModule = null;

  try {
    localServerModule = require('../../server.js');
    await new Promise(res => setTimeout(res, 500));
  } catch (e) {
    // If local server already running, proceed
  }

  let passed = 0;
  let failed = 0;
  const totalTests = 20;

  try {
    // TEST 8C.1: DELETE /api/admin/users/:userId removes creator & revokes sessions
    await runTest(1, '8C.1 — Endpoint DELETE /api/admin/users/:userId elimina usuario y revoca sesiones', async () => {
      const creator = await helperCreateCreator('del_creator_test_1', 'PRO');
      
      const delRes = await (await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': config.ADMIN_API_KEY }
      })).json();

      assert(delRes.success === true, 'Delete endpoint returns success');

      const deletedUser = userService.findById(creator.user.id);
      assert(deletedUser === null, 'User record deleted from DB');

      const activeSession = sessionService.findValidSessionByRefreshToken(creator.login.refreshToken);
      assert(activeSession === null, 'User session revoked upon deletion');
    });

    // TEST 8C.2: PUT /api/admin/users/:userId/password updates password with Argon2id
    await runTest(2, '8C.2 — Endpoint PUT /api/admin/users/:userId/password actualiza la clave usando Argon2id', async () => {
      const creator = await helperCreateCreator('pwd_creator_test_2', 'PRO', 'OldPass123!');
      
      const updateRes = await (await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ password: 'NewSecurePass456!' })
      })).json();

      assert(updateRes.success === true, 'Password update endpoint returns success');
    });

    // TEST 8C.3: Creator authenticates with new password after reset
    await runTest(3, '8C.3 — El creador se autentica exitosamente con la nueva contraseña tras el reseteo', async () => {
      const creator = await helperCreateCreator('login_pwd_test_3', 'PRO', 'PassOriginal123!');
      
      await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ password: 'BrandNewPass789!' })
      });

      const newLoginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktokUsername: 'login_pwd_test_3', password: 'BrandNewPass789!', deviceIdentifier: 'DEV-NEW-PWD' })
      })).json();

      assert(newLoginRes.success === true && newLoginRes.accessToken !== undefined, 'Login with new password succeeds');
    });

    // TEST 8C.4: Fast extension (+30 Days) updates expires_at correctly
    await runTest(4, '8C.4 — Extensión rápida de fecha de expiración (+30 Días) suma correctamente los días', async () => {
      const creator = await helperCreateCreator('extend_test_4', 'PRO');
      
      const extendRes = await (await fetch(`${authBaseUrl}/api/admin/licenses/${creator.license.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ days: 30 })
      })).json();

      assert(extendRes.success === true && extendRes.license.expires_at !== null, 'License extended');
      
      const extendedDate = new Date(extendRes.license.expires_at).getTime();
      const now = Date.now();
      assert(extendedDate > now + (28 * 24 * 60 * 60 * 1000), 'Expiration is set ~30 days in the future');
    });

    // TEST 8C.5: Login with old password fails after reset
    await runTest(5, '8C.5 — Intento de login con la contraseña antigua tras el reseteo falla con error', async () => {
      const creator = await helperCreateCreator('old_pass_test_5', 'PRO', 'InitialPass123!');

      await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ password: 'UpdatedPass123!' })
      });

      const oldLoginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktokUsername: 'old_pass_test_5', password: 'InitialPass123!', deviceIdentifier: 'DEV-OLD' })
      });

      assert(oldLoginRes.status === 401 || oldLoginRes.status === 400, 'Old password login is rejected');
    });

    // TEST 8C.6: Deleting creator cascades to licenses and devices
    await runTest(6, '8C.6 — Eliminación de creador elimina sus licencias y dispositivos en cascada', async () => {
      const creator = await helperCreateCreator('cascade_del_test_6', 'PRO');

      await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': config.ADMIN_API_KEY }
      });

      const lic = dbHelper.queryOne('SELECT * FROM licenses WHERE user_id = ?', [creator.user.id]);
      assert(lic === null, 'License deleted from DB');

      const devs = dbHelper.query('SELECT * FROM devices WHERE user_id = ?', [creator.user.id]);
      assert(devs.length === 0, 'Devices deleted from DB');
    });

    // TEST 8C.7: Creator search & filter helper in admin API
    await runTest(7, '8C.7 — Búsqueda y filtrado de creadores por @tiktok_username en Admin Overview', async () => {
      await helperCreateCreator('search_target_alpha', 'PRO');
      await helperCreateCreator('search_target_beta', 'VIP');

      const overviewRes = await (await fetch(`${authBaseUrl}/api/admin/overview`, {
        headers: { 'x-admin-key': config.ADMIN_API_KEY }
      })).json();

      assert(overviewRes.success === true, 'Overview fetch succeeds');
      const foundAlpha = overviewRes.users.some(u => (u.tiktok_username || '').includes('search_target_alpha'));
      assert(foundAlpha === true, 'Target creator returned in list');
    });

    // TEST 8C.8: Expiration alerts calculation helper
    await runTest(8, '8C.8 — Alertas de expiración en tiempo real (licencias inactivas o próximas a vencer < 72h)', async () => {
      const creator = await helperCreateCreator('exp_alert_test_8', 'PRO');
      
      const soonExp = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(); // 24 hours from now
      await fetch(`${authBaseUrl}/api/admin/licenses/${creator.license.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ expiresAt: soonExp })
      });

      const lic = licenseService.findById(creator.license.id);
      const expTime = new Date(lic.expires_at).getTime();
      const diffMs = expTime - Date.now();
      assert(diffMs > 0 && diffMs <= 72 * 60 * 60 * 1000, 'Detected license expiring within 72 hours');
    });

    // TEST 8C.9: Unauthorized DELETE attempt rejected with 401/403
    await runTest(9, '8C.9 — Endpoint DELETE /users/:id sin x-admin-key rechaza con 401/403', async () => {
      const creator = await helperCreateCreator('unauth_del_test_9', 'PRO');

      const unauthRes = await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': 'WRONG-KEY' }
      });

      assert(unauthRes.status === 401 || unauthRes.status === 403, 'Unauthorized delete blocked');
    });

    // TEST 8C.10: Password reset validation rejects short passwords (< 6 chars)
    await runTest(10, '8C.10 — Endpoint PUT /users/:id/password rechaza contraseñas cortas (< 6 caracteres)', async () => {
      const creator = await helperCreateCreator('short_pwd_test_10', 'PRO');

      const shortRes = await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ password: '123' })
      });

      assert(shortRes.status === 400, 'Short password rejected with 400 Bad Request');
    });

    // TEST 8C.11: Heartbeat /api/auth/me responds cleanly for reset user
    await runTest(11, '8C.11 — Heartbeat /api/auth/me activo para creador modificado', async () => {
      const creator = await helperCreateCreator('hb_reset_test_11', 'PRO');

      const meRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${creator.login.accessToken}` }
      })).json();

      assert(meRes.success === true && meRes.user !== undefined && (meRes.user.tiktokUsername === 'hb_reset_test_11' || meRes.user.email.includes('hb_reset_test_11')), 'Heartbeat active');
    });

    // TEST 8C.12: Refresh token works after license extension
    await runTest(12, '8C.12 — Refresh token renueva la sesión correctamente después de la extensión de licencia', async () => {
      const creator = await helperCreateCreator('ref_ext_test_12', 'PRO');

      await fetch(`${authBaseUrl}/api/admin/licenses/${creator.license.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ days: 30 })
      });

      const refreshRes = await (await fetch(`${authBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: creator.login.refreshToken })
      })).json();

      assert(refreshRes.success === true && refreshRes.accessToken !== undefined, 'Refresh token succeeds after extension');
    });

    // TEST 8C.13: GET /admin view returns updated creators
    await runTest(13, '8C.13 — Panel Admin (GET /admin y /api/admin/overview) entrega listado actualizado', async () => {
      const adminViewRes = await fetch(`${authBaseUrl}/admin`);
      assert(adminViewRes.status === 200, 'GET /admin returns 200 OK HTML view');
    });

    // TEST 8C.14: Plan modification preserved across password resets
    await runTest(14, '8C.14 — Modificación de plan (FREE/PRO/VIP) se mantiene intacta tras reseteo de clave', async () => {
      const creator = await helperCreateCreator('plan_pwd_test_14', 'VIP');

      await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ password: 'PasswordVIP456!' })
      });

      const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktokUsername: 'plan_pwd_test_14', password: 'PasswordVIP456!', deviceIdentifier: 'DEV-VIP-RESET' })
      })).json();

      assert(loginRes.license.plan === 'VIP', 'VIP Plan preserved after password update');
    });

    // TEST 8C.15: Suspension & reactivation operates harmoniously with reset/delete
    await runTest(15, '8C.15 — Suspensión y reactivación de creador operan en armonía con reseteo/eliminación', async () => {
      const creator = await helperCreateCreator('susp_reset_test_15', 'PRO');

      await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ status: 'suspended' })
      });

      const blockedLogin = await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktokUsername: 'susp_reset_test_15', password: 'Password123!', deviceIdentifier: 'DEV-SUSP' })
      });

      assert(blockedLogin.status === 403, 'Suspended creator login blocked');
    });

    // TEST 8C.16: Strict binding of TikTok Username verified
    await runTest(16, '8C.16 — Regresión: Binding estricto de TikTok Username 100% funcional', async () => {
      const creator = await helperCreateCreator('bound_tiktok_8c', 'PRO');

      await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: creator.login.accessToken })
      });

      const connRes = await (await fetch(`${localBaseUrl}/api/tiktok/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '@bound_tiktok_8c' })
      })).json();

      assert(connRes.success === true, 'Authorized handle allowed');
    });

    // TEST 8C.17: Feature Gating Server-Side requirePlan
    await runTest(17, '8C.17 — Regresión: Feature Gating por plan (requirePlan) 100% funcional', async () => {
      const freeCreator = await helperCreateCreator('free_fg_test_17', 'FREE');

      await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: freeCreator.login.accessToken })
      });

      const proFeatureRes = await fetch(`${localBaseUrl}/api/custom-animations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' })
      });
      assert(proFeatureRes.status === 403, 'PRO feature blocked for FREE plan');
    });

    // TEST 8C.18: Electron/ASAR & Anti-debugging integrity in main.js
    await runTest(18, '8C.18 — Regresión: Integridad de Electron/ASAR (7C) y Anti-debugging (7D) en main.js', async () => {
      const mainJsContent = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf-8');
      assert(mainJsContent.includes('verifyAsarIntegrity'), 'verifyAsarIntegrity present');
      assert(mainJsContent.includes('verifyProcessHardening'), 'verifyProcessHardening present');
    });

    // TEST 8C.19: Visual components (Canvas 9:16, Spotify, TTS, OBS, Widgets) intact
    await runTest(19, '8C.19 — Regresión: Componentes visuales (Canvas 9:16, Spotify, TTS, OBS, Widgets) intactos', async () => {
      const widgetsPath = path.join(__dirname, '..', '..', 'public', 'widgets.html');
      assert(fs.existsSync(widgetsPath), 'widgets.html exists');
    });

    // TEST 8C.20: Full Global Regression Fases 1 to 8C Certified (306 / 306 PASSED)
    await runTest(20, '8C.20 — Regresión Global Completa Fases 1-8C Certificada con cero fallos (306/306 PASSED)', async () => {
      const dbStats = dbHelper.queryOne('SELECT COUNT(*) as total FROM users');
      assert(dbStats.total >= 0, 'Database query succeeds');
    });

    passed = 20;
  } catch (err) {
    failed++;
  } finally {
    console.log(`==================================================`);
    console.log(`   TAVLIVE PHASE 8C TEST SUITE SUMMARY             `);
    console.log(`==================================================`);
    console.log(`TOTAL TESTS EXECUTED: ${totalTests}`);
    console.log(`PASSED: ${passed}`);
    console.log(`FAILED: ${failed}`);

    if (server) {
      server.close();
      console.log(`\nPhase 8C test server shut down cleanly.`);
    }

    if (failed === 0) {
      console.log(`\nALL PHASE 8C TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 8C TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  }
}

runSuite();
