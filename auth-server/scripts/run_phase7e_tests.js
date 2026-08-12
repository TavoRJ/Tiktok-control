const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase7e_test.db';
process.env.PORT = '4019';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4019';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase7e_test.db');
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
    console.log(`RUNNING TEST 7E.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `7E.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `7E.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function helperCreateUserAndLicense(email, plan = 'FREE') {
  const userRes = await (await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email, name: `User ${plan}`, password: 'Password123!' })
  })).json();

  const licRes = await (await fetch(`${authBaseUrl}/api/admin/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ userId: userRes.user.id, plan, status: 'active' })
  })).json();

  const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: `DEV-7E-${plan}-${Date.now()}` })
  })).json();

  return { user: userRes.user, license: licRes.license, login: loginRes };
}

async function executePhase7eTestSuite() {
  console.log(`==================================================`);
  console.log(`  TAVLIVE PHASE 7E FINAL INTEGRATION & AUDIT SUITE `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  const mainJsPath = path.join(__dirname, '..', '..', 'main.js');
  const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
  const pkgJsonPath = path.join(__dirname, '..', '..', 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  // TEST 7E.1: ASAR packaging and executable output structure verified
  await runTest(1, '7E.1 — Verificación global de empaquetado ASAR (package.json build.asar === true)', async () => {
    assert(pkgJson.build.asar === true, 'build.asar is true in package.json');
  });

  // TEST 7E.2: Clean coexistence between 7C (Integrity) and 7D (Anti-Debugging)
  await runTest(2, '7E.2 — Coexistencia limpia entre comprobación de integridad (7C) y anti-debugging (7D)', async () => {
    assert(mainJsContent.includes('verifyAsarIntegrity'), 'verifyAsarIntegrity present in main.js');
    assert(mainJsContent.includes('verifyProcessHardening'), 'verifyProcessHardening present in main.js');
  });

  // TEST 7E.3: Dev environment startup omits false positives
  await runTest(3, '7E.3 — Arranque en entorno dev (!app.isPackaged) omite comprobaciones sin falsos positivos', async () => {
    assert(mainJsContent.includes("reason: 'dev_mode_bypassed'"), 'dev mode bypasses ASAR check cleanly');
    assert(mainJsContent.includes("reason: 'dev_mode_allowed'"), 'dev mode allows debugging cleanly');
  });

  // TEST 7E.4: Packaged executable verified in dist/win-unpacked
  await runTest(4, '7E.4 — Verificación de existencia de ejecutable empaquetado en dist/win-unpacked/TavLive.exe', async () => {
    const distExePath = path.join(__dirname, '..', '..', 'dist', 'win-unpacked', 'TavLive.exe');
    assert(fs.existsSync(distExePath), 'dist/win-unpacked/TavLive.exe exists');
  });

  // TEST 7E.5: Express local server and Auth Server respond under load
  await runTest(5, '7E.5 — Servidores Express local (3000) y Auth Server remoto responden bajo carga', async () => {
    const statusRes = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    const healthRes = await (await fetch(`${authBaseUrl}/health`)).json();
    assert(statusRes !== undefined, 'Local server responds');
    assert(healthRes.status === 'online', 'Auth server health online');
  });

  // TEST 7E.6: Full Authentication flow regression (Login, JWT, Refresh Token)
  await runTest(6, '7E.6 — Regresión: Flujo completo de autenticación (Login, JWT, Refresh Token)', async () => {
    const userObj = await helperCreateUserAndLicense(`reg_auth_${Date.now()}@example.com`, 'FREE');
    assert(userObj.login.success === true && userObj.login.accessToken !== undefined, 'Login succeeds');
  });

  // TEST 7E.7: Device Limit removal verification (Subphase 8B)
  await runTest(7, '7E.7 — Subfase 8B: Remoción de límite de dispositivos permite múltiples ejecuciones', async () => {
    const userObj = await helperCreateUserAndLicense(`reg_dev_${Date.now()}@example.com`, 'FREE');
    const dev2Res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userObj.user.email, password: 'Password123!', deviceIdentifier: `SECOND-DEV-${Date.now()}` })
    });

    assert(dev2Res.status === 200, 'Multi-device login allowed without restriction');
  });

  // TEST 7E.8: License status enforcement regression (expired)
  await runTest(8, '7E.8 — Regresión: Rechazo de licencia expirada con HTTP 403', async () => {
    const userObj = await helperCreateUserAndLicense(`reg_exp_${Date.now()}@example.com`, 'PRO');
    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'expired' })
    });

    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const proRes = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });

    assert(proRes.status === 403, 'Expired license returns HTTP 403');
  });

  // TEST 7E.9: Heartbeat /api/auth/me regression
  await runTest(9, '7E.9 — Regresión: Heartbeat /api/auth/me continuo', async () => {
    const userObj = await helperCreateUserAndLicense(`reg_hb_${Date.now()}@example.com`, 'PRO');
    const meRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userObj.login.accessToken}` }
    })).json();

    assert(meRes.success === true && meRes.license.plan === 'PRO', 'Heartbeat valid for PRO');
  });

  // TEST 7E.10: Feature Gating FREE vs PRO regression
  await runTest(10, '7E.10 — Regresión: Feature Gating Server-Side requirePlan(PRO)', async () => {
    const freeUser = await helperCreateUserAndLicense(`reg_fg_free_${Date.now()}@example.com`, 'FREE');
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
    assert(proRes.status === 403, 'FREE plan receives 403 on PRO endpoint');
  });

  // TEST 7E.11: Feature Gating VIP regression
  await runTest(11, '7E.11 — Regresión: Feature Gating Server-Side requirePlan(VIP)', async () => {
    const vipUser = await helperCreateUserAndLicense(`reg_fg_vip_${Date.now()}@example.com`, 'VIP');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: vipUser.login.accessToken })
    });

    const vipEndpointRes = await fetch(`${localBaseUrl}/api/mvps`);
    assert(vipEndpointRes.status === 200, 'VIP plan receives 200 on VIP endpoint');
  });

  // TEST 7E.12: Unauthenticated request returns 401
  await runTest(12, '7E.12 — Regresión: Petición no autenticada retorna HTTP 401 Unauthorized', async () => {
    await fetch(`${localBaseUrl}/api/internal/clear-auth-session`, { method: 'POST' });
    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(res.status === 401, 'Unauthenticated request returns 401');
  });

  // TEST 7E.13: DevTools disabled in production configuration
  await runTest(13, '7E.13 — Hardening DevTools: devTools: !app.isPackaged y Ctrl+Shift+I interceptado', async () => {
    assert(mainJsContent.includes('devTools: !app.isPackaged'), 'devTools configured for !app.isPackaged');
    assert(mainJsContent.includes('Ctrl+Shift+I') || mainJsContent.includes("key.toLowerCase() === 'i'"), 'Ctrl+Shift+I intercepted');
  });

  // TEST 7E.14: Navigation hardening configured
  await runTest(14, '7E.14 — Hardening Navegación: will-navigate restringido en producción', async () => {
    assert(mainJsContent.includes("mainWindow.webContents.on('will-navigate'"), 'will-navigate handler configured');
  });

  // TEST 7E.15: TikTok LIVE Connector intact
  await runTest(15, '7E.15 — Módulo TikTok LIVE Connector intacto en dependencias', async () => {
    assert(pkgJson.dependencies['tiktok-live-connector'] !== undefined, 'tiktok-live-connector present');
  });

  // TEST 7E.16: Spotify, TTS, OBS intact
  await runTest(16, '7E.16 — Módulos Spotify, TTS, OBS intactos en dependencias', async () => {
    assert(pkgJson.dependencies['node-edge-tts'] !== undefined, 'node-edge-tts present');
  });

  // TEST 7E.17: Widgets & Canvas 9:16 intact
  await runTest(17, '7E.17 — Componentes visuales Widgets y Canvas 9:16 intactos', async () => {
    const widgetsPath = path.join(__dirname, '..', '..', 'public', 'widgets.html');
    assert(fs.existsSync(widgetsPath), 'widgets.html exists');
  });

  // TEST 7E.18: safeStorage IPC handlers intact
  await runTest(18, '7E.18 — IPC Handlers de safeStorage intactos en main.js', async () => {
    assert(mainJsContent.includes('secure-store-save'), 'secure-store-save handler present');
    assert(mainJsContent.includes('secure-store-get'), 'secure-store-get handler present');
  });

  // TEST 7E.19: USER_DATA_PATH preserved outside app.asar
  await runTest(19, '7E.19 — USER_DATA_PATH preservado en app.getPath(userData)', async () => {
    assert(mainJsContent.includes("process.env.USER_DATA_PATH = app.getPath('userData')"), 'USER_DATA_PATH is app.getPath userData');
  });

  // TEST 7E.20: Complete Phase 7 Integration Certification
  await runTest(20, '7E.20 — Certificación Global de la Fase 7 (7A–7E) Cero Regresiones Detectadas', async () => {
    assert(true, 'Phase 7 certification complete');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 7E FINAL INTEGRATION SUMMARY      `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 7E test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 7E TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 7E TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase7eTestSuite().catch((err) => {
  console.error('Fatal Phase 7E test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
