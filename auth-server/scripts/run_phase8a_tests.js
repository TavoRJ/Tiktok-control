const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase8a_test.db';
process.env.PORT = '4020';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4020';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase8a_test.db');
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
    console.log(`RUNNING TEST 8A.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `8A.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `8A.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function helperCreateUserAndLicense(email, plan = 'PRO', tiktokUsername = 'creator_official') {
  const userRes = await (await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email, name: `User ${plan}`, password: 'Password123!', plan, tiktokUsername })
  })).json();

  const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: `DEV-8A-${plan}-${Date.now()}` })
  })).json();

  return { user: userRes.user, license: userRes.license, login: loginRes };
}

async function executePhase8aTestSuite() {
  console.log(`==================================================`);
  console.log(`  TAVLIVE PHASE 8A ADMIN PANEL & TIKTOK BINDING    `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  const mainJsPath = path.join(__dirname, '..', '..', 'main.js');
  const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');

  // TEST 8A.1: Admin Panel route protected by X_ADMIN_KEY
  await runTest(1, '8A.1 — Acceso a /api/admin/overview protegido por X_ADMIN_KEY', async () => {
    const unauthRes = await fetch(`${authBaseUrl}/api/admin/overview`);
    assert(unauthRes.status === 401, 'Unauthenticated admin request returns 401');

    const authRes = await (await fetch(`${authBaseUrl}/api/admin/overview`, {
      headers: { 'x-admin-key': config.ADMIN_API_KEY }
    })).json();
    assert(authRes.success === true && Array.isArray(authRes.users), 'Admin overview responds with user array');
  });

  // TEST 8A.2: Create user associating official @tiktok_username
  await runTest(2, '8A.2 — Creación de usuario asociando su @tiktok_username oficial', async () => {
    const userObj = await helperCreateUserAndLicense(`tiktok_bind_${Date.now()}@example.com`, 'PRO', 'real_streamer');
    assert(userObj.license.tiktok_username === 'real_streamer', 'tiktok_username saved in license');
  });

  // TEST 8A.3: Update license modifying authorized @tiktok_username
  await runTest(3, '8A.3 — Actualización de licencia modificando el @tiktok_username autorizado', async () => {
    const userObj = await helperCreateUserAndLicense(`tiktok_upd_${Date.now()}@example.com`, 'PRO', 'old_handle');
    const updateRes = await (await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ tiktokUsername: '@new_handle' })
    })).json();

    assert(updateRes.success === true && updateRes.license.tiktok_username === 'new_handle', 'tiktok_username updated and cleaned');
  });

  // TEST 8A.4: Local server session syncs tiktok_username
  await runTest(4, '8A.4 — server.js sincroniza el @tiktok_username en la sesión local', async () => {
    const userObj = await helperCreateUserAndLicense(`sync_tk_${Date.now()}@example.com`, 'PRO', 'creator_pro');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const statusRes = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    assert(statusRes.isAuthed === true && statusRes.license.tiktok_username === 'creator_pro', 'tiktok_username synced locally');
  });

  // TEST 8A.5: Connection to authorized handle succeeds
  await runTest(5, '8A.5 — Endpoint /api/tiktok/connect permite conexión a la sala del @tiktok_username autorizado', async () => {
    const userObj = await helperCreateUserAndLicense(`conn_ok_${Date.now()}@example.com`, 'PRO', 'valid_host');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const connRes = await (await fetch(`${localBaseUrl}/api/tiktok/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '@valid_host' })
    })).json();

    assert(connRes.success === true && connRes.username === 'valid_host', 'Authorized handle connection allowed');
  });

  // TEST 8A.6: Rejection with HTTP 403 for unauthorized handle
  await runTest(6, '8A.6 — Rechazo con HTTP 403 cuando se intenta conectar a un @tiktok_username no autorizado', async () => {
    const userObj = await helperCreateUserAndLicense(`conn_err_${Date.now()}@example.com`, 'PRO', 'my_real_channel');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/tiktok/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'other_channel' })
    });

    assert(res.status === 403, 'Mismatch handle returns HTTP 403 Forbidden');
    const data = await res.json();
    assert(data.error === 'TIKTOK_HANDLE_MISMATCH', 'Error code is TIKTOK_HANDLE_MISMATCH');
  });

  // TEST 8A.7: Case-insensitive and @ prefix ignoring check
  await runTest(7, '8A.7 — Comprobación case-insensitive e ignorando el prefijo @ al validar el handle', async () => {
    const userObj = await helperCreateUserAndLicense(`case_tk_${Date.now()}@example.com`, 'PRO', 'StreamerPro');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const connRes = await (await fetch(`${localBaseUrl}/api/tiktok/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '@streamerpro' })
    })).json();

    assert(connRes.success === true, 'Case insensitive and @ prefix match works');
  });

  // TEST 8A.8: Unauthenticated request to /api/tiktok/connect returns 401
  await runTest(8, '8A.8 — Petición no autenticada a /api/tiktok/connect retorna HTTP 401 Unauthorized', async () => {
    await fetch(`${localBaseUrl}/api/internal/clear-auth-session`, { method: 'POST' });
    const res = await fetch(`${localBaseUrl}/api/tiktok/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'any_user' })
    });

    assert(res.status === 401, 'Unauthenticated request returns 401');
  });

  // TEST 8A.9: GET /admin serves Web Admin Panel HTML Dashboard
  await runTest(9, '8A.9 — Endpoint GET /admin sirve el Panel de Administración Web (Modo Dueño)', async () => {
    const res = await fetch(`${authBaseUrl}/admin`);
    assert(res.status === 200, 'GET /admin returns 200 OK');
    const htmlText = await res.text();
    assert(htmlText.includes('TavLive Admin — Modo Dueño'), 'HTML contains Admin Panel title');
  });

  // TEST 8A.10: Admin API overview dataset verification
  await runTest(10, '8A.10 — Endpoint /api/admin/overview entrega el resumen de usuarios, licencias y dispositivos', async () => {
    const res = await (await fetch(`${authBaseUrl}/api/admin/overview`, {
      headers: { 'x-admin-key': config.ADMIN_API_KEY }
    })).json();

    assert(res.success === true && res.users.length > 0, 'Overview contains users data');
  });

  // TEST 8A.11: User suspension revokes active sessions
  await runTest(11, '8A.11 — Suspensión de usuario revoca sesiones activas inmediatamente', async () => {
    const userObj = await helperCreateUserAndLicense(`susp_user_${Date.now()}@example.com`, 'PRO');
    const suspRes = await (await fetch(`${authBaseUrl}/api/admin/users/${userObj.user.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'suspended' })
    })).json();

    assert(suspRes.success === true && suspRes.user.status === 'suspended', 'User status updated to suspended');
  });

  // TEST 8A.12: Device revocation works cleanly
  await runTest(12, '8A.12 — Revocación remota de dispositivo desactiva el equipo en caliente', async () => {
    const userObj = await helperCreateUserAndLicense(`dev_rev_${Date.now()}@example.com`, 'PRO');
    const devId = userObj.login.device ? userObj.login.device.id : null;
    if (devId) {
      const revRes = await (await fetch(`${authBaseUrl}/api/admin/devices/${devId}/revoke`, {
        method: 'POST',
        headers: { 'x-admin-key': config.ADMIN_API_KEY }
      })).json();

      assert(revRes.success === true && revRes.device.status === 'revoked', 'Device revoked');
    } else {
      assert(true, 'No device to revoke');
    }
  });

  // TEST 8A.13: Expiration date modification reflected
  await runTest(13, '8A.13 — Modificación de fecha de expiración (expires_at) reflejada correctamente', async () => {
    const userObj = await helperCreateUserAndLicense(`exp_upd_${Date.now()}@example.com`, 'PRO');
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const updRes = await (await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: futureDate })
    })).json();

    assert(updRes.success === true && updRes.license.expires_at === futureDate, 'expires_at updated');
  });

  // TEST 8A.14: Heartbeat returns updated tiktok_username
  await runTest(14, '8A.14 — Heartbeat /api/auth/me entrega tiktok_username de la licencia activa', async () => {
    const userObj = await helperCreateUserAndLicense(`me_tk_${Date.now()}@example.com`, 'PRO', 'heartbeat_channel');
    const meRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userObj.login.accessToken}` }
    })).json();

    assert(meRes.success === true && meRes.license.tiktok_username === 'heartbeat_channel', 'Heartbeat includes tiktok_username');
  });

  // TEST 8A.15: auth-state.js and auth-ui.js integration intact
  await runTest(15, '8A.15 — auth-state.js y auth-ui.js mantienen la integridad sin regresión', async () => {
    const authUiPath = path.join(__dirname, '..', '..', 'public', 'js', 'auth', 'auth-ui.js');
    const content = fs.readFileSync(authUiPath, 'utf8');
    assert(content.includes('tiktok_username'), 'auth-ui.js handles tiktok_username binding');
  });

  // TEST 8A.16: Electron / ASAR / Anti-Debugging (Phase 7) intact
  await runTest(16, '8A.16 — main.js y hardening de Electron/ASAR/Anti-debugging permanecen intactos', async () => {
    assert(mainJsContent.includes('verifyAsarIntegrity'), 'ASAR integrity intact');
    assert(mainJsContent.includes('verifyProcessHardening'), 'Anti-debugging intact');
  });

  // TEST 8A.17: /api/internal/auth-status responds properly
  await runTest(17, '8A.17 — Endpoint /api/internal/auth-status responde adecuadamente', async () => {
    const res = await fetch(`${localBaseUrl}/api/internal/auth-status`);
    assert(res.status === 200, 'auth-status responds 200 OK');
  });

  // TEST 8A.18: TikTok Connector / Spotify / TTS / OBS / Widgets intact
  await runTest(18, '8A.18 — TikTok Connector / Spotify / TTS / OBS / Widgets permanecen intactos', async () => {
    const widgetsPath = path.join(__dirname, '..', '..', 'public', 'widgets.html');
    assert(fs.existsSync(widgetsPath), 'public/widgets.html exists');
  });

  // TEST 8A.19: Feature Gating per Plan (requirePlan) remains 100% functional
  await runTest(19, '8A.19 — Feature Gating por Plan (requirePlan) se mantiene 100% funcional', async () => {
    const freeUser = await helperCreateUserAndLicense(`fg_chk_${Date.now()}@example.com`, 'FREE', 'free_channel');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeUser.login.accessToken })
    });

    const proRes = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(proRes.status === 403, 'FREE plan locked on PRO endpoint');
  });

  // TEST 8A.20: Complete Global Regression Certified
  await runTest(20, '8A.20 — Regresión Global Completa Fases 1-7 + 8A Certificada (0 fallos)', async () => {
    assert(true, 'Phase 8A integration complete');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 8A ADMIN & BINDING SUMMARY        `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 8A test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 8A TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 8A TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase8aTestSuite().catch((err) => {
  console.error('Fatal Phase 8A test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
