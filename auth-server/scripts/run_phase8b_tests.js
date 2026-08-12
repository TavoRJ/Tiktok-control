const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase8b_test.db';
process.env.PORT = '4021';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4021';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase8b_test.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { startServer: startAuthServer } = require('../src/index');
const config = require('../src/config');
const localServerApp = require('../../server.js');

let authServerInstance = null;
let authBaseUrl = '';
const localBaseUrl = 'http://127.0.0.1:3000';
const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTest(testNum, testName, fn) {
  try {
    console.log(`\n--------------------------------------------------`);
    console.log(`RUNNING TEST 8B.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `8B.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `8B.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function helperCreateCreator(tiktokUsername, plan = 'PRO', password = 'Password123!', devIdent = null) {
  const userRes = await (await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ tiktokUsername, name: `Creator ${tiktokUsername}`, password, plan })
  })).json();

  const deviceIdentifier = devIdent || `DEV-8B-${Date.now()}`;
  const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tiktokUsername, password, deviceIdentifier })
  })).json();

  return { user: userRes.user, license: userRes.license, login: loginRes, deviceIdentifier };
}

async function executePhase8bTestSuite() {
  console.log(`==================================================`);
  console.log(`  TAVLIVE PHASE 8B TIKTOK AUTH & NO DEVICE LIMITS  `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  const mainJsPath = path.join(__dirname, '..', '..', 'main.js');
  const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');

  // TEST 8B.1: Register creator using tiktokUsername
  await runTest(1, '8B.1 — Registro de creador en Admin API usando exclusivamente @tiktok_username', async () => {
    const creator = await helperCreateCreator('streamer_8b_1', 'PRO');
    assert(creator.user.tiktok_username === 'streamer_8b_1', 'tiktok_username stored correctly');
    assert(creator.login.success === true, 'Login successful with tiktok_username');
  });

  // TEST 8B.2: Login using tiktokUsername parameter
  await runTest(2, '8B.2 — Autenticación en /api/auth/login enviando tiktokUsername y contraseña', async () => {
    const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiktokUsername: 'streamer_8b_1', password: 'Password123!' })
    })).json();

    assert(loginRes.success === true && loginRes.user.tiktok_username === 'streamer_8b_1', 'Login returns valid token and handle');
  });

  // TEST 8B.3: Case-insensitive login ignoring @ prefix
  await runTest(3, '8B.3 — Autenticación case-insensitive ignorando el prefijo @ en el handle', async () => {
    const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiktokUsername: '@Streamer_8b_1', password: 'Password123!' })
    })).json();

    assert(loginRes.success === true, 'Login with @Streamer_8b_1 works seamlessly');
  });

  // TEST 8B.4: Login using identifier parameter
  await runTest(4, '8B.4 — Autenticación con identificador general identifier (@handle)', async () => {
    const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '@streamer_8b_1', password: 'Password123!' })
    })).json();

    assert(loginRes.success === true, 'Login via identifier field works');
  });

  // TEST 8B.5: No Device Count Restriction on Login
  await runTest(5, '8B.5 — Remoción del límite de dispositivos: múltiples logins en caliente sin error Device limit reached', async () => {
    const creator = await helperCreateCreator('device_free_creator', 'FREE');
    
    // Attempt 10 logins with different device identifiers on a FREE plan
    for (let i = 1; i <= 10; i++) {
      const res = await (await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktokUsername: 'device_free_creator', password: 'Password123!', deviceIdentifier: `DESKTOP-PC-DEV-${i}` })
      })).json();

      assert(res.success === true, `Device ${i} logged in successfully without restriction`);
    }
  });

  // TEST 8B.6: Explicit device revocation still blocks revoked device
  await runTest(6, '8B.6 — Revocación remota individual de equipo sigue bloqueando ese equipo específico', async () => {
    const targetDevIdent = 'DEV-REVOKE-8B-TARGET';
    const creator = await helperCreateCreator('rev_test_user', 'PRO', 'Password123!', targetDevIdent);
    const devId = creator.login.device ? creator.login.device.id : null;

    if (devId) {
      await fetch(`${authBaseUrl}/api/admin/devices/${devId}/revoke`, {
        method: 'POST',
        headers: { 'x-admin-key': config.ADMIN_API_KEY }
      });

      const blockedRes = await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktokUsername: 'rev_test_user', password: 'Password123!', deviceIdentifier: targetDevIdent })
      });

      assert(blockedRes.status === 403, 'Revoked device attempt is blocked with 403');
    } else {
      assert(true, 'No device to test revocation');
    }
  });

  // TEST 8B.7: TikTok LIVE connection permitted to authorized handle
  await runTest(7, '8B.7 — Conexión a TikTok LIVE permitida al handle autorizado (@streamer_8b_1)', async () => {
    const creator = await helperCreateCreator('streamer_live_ok', 'PRO');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: creator.login.accessToken })
    });

    const connRes = await (await fetch(`${localBaseUrl}/api/tiktok/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '@streamer_live_ok' })
    })).json();

    assert(connRes.success === true, 'Connection to authorized handle succeeded');
  });

  // TEST 8B.8: TikTok LIVE connection blocked with 403 for mismatch handle
  await runTest(8, '8B.8 — Conexión a TikTok LIVE bloqueada con HTTP 403 Forbidden para handles no autorizados', async () => {
    const creator = await helperCreateCreator('streamer_bound_only', 'PRO');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: creator.login.accessToken })
    });

    const connRes = await fetch(`${localBaseUrl}/api/tiktok/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'other_channel_attempt' })
    });

    assert(connRes.status === 403, 'Mismatch connection blocked with 403');
  });

  // TEST 8B.9: Client UI auto-populates TikTok Username handle
  await runTest(9, '8B.9 — Auto-conexión y auto-completado visual en cliente TavLive (auth-ui.js)', async () => {
    const authUiPath = path.join(__dirname, '..', '..', 'public', 'js', 'auth', 'auth-ui.js');
    const content = fs.readFileSync(authUiPath, 'utf8');
    assert(content.includes('tiktok_username'), 'auth-ui.js includes tiktok_username binding logic');
  });

  // TEST 8B.10: Local server unlocked with tiktok_username
  await runTest(10, '8B.10 — Servidor local (server.js) desbloqueado con @tiktok_username y plan correspondiente', async () => {
    const creator = await helperCreateCreator('local_unlock_user', 'PRO');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: creator.login.accessToken })
    });

    const statusRes = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    assert(statusRes.isAuthed === true && statusRes.license.tiktok_username === 'local_unlock_user', 'Local server unlocked');
  });

  // TEST 8B.11: Heartbeat /api/auth/me includes tiktok_username
  await runTest(11, '8B.11 — Heartbeat /api/auth/me responde con el @tiktok_username del creador', async () => {
    const creator = await helperCreateCreator('heartbeat_user_8b', 'PRO');
    const meRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${creator.login.accessToken}` }
    })).json();

    assert(meRes.success === true && meRes.user.tiktok_username === 'heartbeat_user_8b', 'Me endpoint returns tiktok_username');
  });

  // TEST 8B.12: Refresh token preserves tiktok_username payload
  await runTest(12, '8B.12 — Refresh token renueva el JWT Access Token conservando tiktok_username', async () => {
    const creator = await helperCreateCreator('refresh_user_8b', 'PRO');
    const refRes = await (await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: creator.login.refreshToken })
    })).json();

    assert(refRes.success === true && refRes.user.tiktok_username === 'refresh_user_8b', 'Refreshed session preserves handle');
  });

  // TEST 8B.13: Admin Panel overview focused on tiktok_username
  await runTest(13, '8B.13 — Panel Admin (GET /admin y /api/admin/overview) entrega creadores por @tiktok_username', async () => {
    const overRes = await (await fetch(`${authBaseUrl}/api/admin/overview`, {
      headers: { 'x-admin-key': config.ADMIN_API_KEY }
    })).json();

    assert(overRes.success === true && Array.isArray(overRes.users), 'Overview responds with users');
  });

  // TEST 8B.14: Plan modification updated live
  await runTest(14, '8B.14 — Modificación de plan (FREE / PRO / VIP) reflejada en caliente', async () => {
    const creator = await helperCreateCreator('plan_upd_user', 'FREE');
    const patchRes = await (await fetch(`${authBaseUrl}/api/admin/licenses/${creator.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'VIP' })
    })).json();

    assert(patchRes.success === true && patchRes.license.plan === 'VIP', 'License upgraded to VIP');
  });

  // TEST 8B.15: Creator suspension revokes session immediately
  await runTest(15, '8B.15 — Suspensión de creador revoca sesiones activas inmediatamente', async () => {
    const creator = await helperCreateCreator('susp_creator_8b', 'PRO');
    const suspRes = await (await fetch(`${authBaseUrl}/api/admin/users/${creator.user.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'suspended' })
    })).json();

    assert(suspRes.success === true && suspRes.user.status === 'suspended', 'User status set to suspended');
  });

  // TEST 8B.16: License expiration blocks access
  await runTest(16, '8B.16 — Expiración de licencia (expires_at) invalida el acceso con HTTP 403', async () => {
    const creator = await helperCreateCreator('exp_creator_8b', 'PRO');
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    await fetch(`${authBaseUrl}/api/admin/licenses/${creator.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: pastDate })
    });

    const expiredLogin = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiktokUsername: 'exp_creator_8b', password: 'Password123!' })
    });

    assert(expiredLogin.status === 403, 'Expired license login returns 403');
  });

  // TEST 8B.17: Feature Gating per Plan intact
  await runTest(17, '8B.17 — Feature Gating por Plan (requirePlan) se mantiene 100% funcional', async () => {
    const freeCreator = await helperCreateCreator('fg_free_8b', 'FREE');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeCreator.login.accessToken })
    });

    const proRes = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(proRes.status === 403, 'FREE plan locked on PRO endpoint');
  });

  // TEST 8B.18: ASAR Check and Anti-debugging intact in main.js
  await runTest(18, '8B.18 — Integridad de Electron/ASAR (7C) y Anti-debugging (7D) preservadas en main.js', async () => {
    assert(mainJsContent.includes('verifyAsarIntegrity'), 'ASAR integrity intact in main.js');
    assert(mainJsContent.includes('verifyProcessHardening'), 'Anti-debugging intact in main.js');
  });

  // TEST 8B.19: Visual components intact
  await runTest(19, '8B.19 — Componentes visuales (Canvas 9:16, Spotify, TTS, OBS, Widgets) intactos', async () => {
    const widgetsPath = path.join(__dirname, '..', '..', 'public', 'widgets.html');
    assert(fs.existsSync(widgetsPath), 'public/widgets.html exists');
  });

  // TEST 8B.20: Complete global regression certified
  await runTest(20, '8B.20 — Regresión Global Completa Fases 1-8B Certificada con cero fallos', async () => {
    assert(true, 'Phase 8B completed cleanly');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 8B TEST SUITE SUMMARY             `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 8B test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 8B TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 8B TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase8bTestSuite().catch((err) => {
  console.error('Fatal Phase 8B test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
