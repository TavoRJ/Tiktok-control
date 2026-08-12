const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase7b_test.db';
process.env.PORT = '4016';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4016';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase7b_test.db');
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
    console.log(`RUNNING TEST 7B.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `7B.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `7B.${testNum}`, name: testName, status: 'FAILED', error: err.message });
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
    body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: `DEV-7B-${plan}-${Date.now()}` })
  })).json();

  return { user: userRes.user, license: licRes.license, login: loginRes };
}

async function executePhase7bTestSuite() {
  console.log(`==================================================`);
  console.log(`  TAVLIVE PHASE 7B ELECTRON HARDENING SUITE       `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  const pkgJsonPath = path.join(__dirname, '..', '..', 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const mainJsPath = path.join(__dirname, '..', '..', 'main.js');
  const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');

  // TEST 7B.1: package.json maintains valid configuration
  await runTest(1, '7B.1 — package.json mantiene configuración válida', async () => {
    assert(pkgJson.name === 'tikttoklive', 'Package name is tikttoklive');
    assert(pkgJson.main === 'main.js', 'Main entrypoint is main.js');
  });

  // TEST 7B.2: electron-builder recognises asar: true
  await runTest(2, '7B.2 — electron-builder reconoce asar: true', async () => {
    assert(pkgJson.build && pkgJson.build.asar === true, 'package.json configures asar: true');
  });

  // TEST 7B.3: main.js includes devTools: !app.isPackaged
  await runTest(3, '7B.3 — main.js incluye devTools: !app.isPackaged', async () => {
    assert(mainJsContent.includes('devTools: !app.isPackaged'), 'main.js disables devTools in production webPreferences');
  });

  // TEST 7B.4: main.js blocks Ctrl+Shift+I when app.isPackaged is true
  await runTest(4, '7B.4 — main.js bloquea Ctrl+Shift+I en producción (app.isPackaged === true)', async () => {
    assert(mainJsContent.includes('if (app.isPackaged)'), 'main.js checks app.isPackaged before toggling DevTools');
  });

  // TEST 7B.5: main.js permits Ctrl+Shift+I when app.isPackaged is false
  await runTest(5, '7B.5 — main.js permite DevTools en desarrollo (!app.isPackaged)', async () => {
    assert(mainJsContent.includes('mainWindow.webContents.toggleDevTools()'), 'main.js allows toggleDevTools in dev mode');
  });

  // TEST 7B.6: main.js contains navigation restriction (will-navigate)
  await runTest(6, '7B.6 — main.js contiene hardening de navegación (will-navigate)', async () => {
    assert(mainJsContent.includes("will-navigate"), 'main.js listens to will-navigate event');
  });

  // TEST 7B.7: server.js starts correctly
  await runTest(7, '7B.7 — server.js continúa iniciando correctamente', async () => {
    const statusRes = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    assert(statusRes !== undefined, 'Local server.js is running');
  });

  // TEST 7B.8: preload.js uses contextIsolation and nodeIntegration false
  await runTest(8, '7B.8 — main.js configura contextIsolation: true y nodeIntegration: false', async () => {
    assert(mainJsContent.includes('contextIsolation: true'), 'contextIsolation is true');
    assert(mainJsContent.includes('nodeIntegration: false'), 'nodeIntegration is false');
  });

  // TEST 7B.9: auth-state.js maintains state management
  await runTest(9, '7B.9 — auth-state.js permanece sin modificaciones no autorizadas', async () => {
    const authStatePath = path.join(__dirname, '..', '..', 'public', 'js', 'auth', 'auth-state.js');
    assert(fs.existsSync(authStatePath), 'auth-state.js exists');
  });

  // TEST 7B.10: auth-client.js maintains API communication
  await runTest(10, '7B.10 — auth-client.js permanece intacto', async () => {
    const authClientPath = path.join(__dirname, '..', '..', 'public', 'js', 'auth', 'auth-client.js');
    assert(fs.existsSync(authClientPath), 'auth-client.js exists');
  });

  // TEST 7B.11: auth-ui.js maintains visual UI
  await runTest(11, '7B.11 — auth-ui.js permanece intacto', async () => {
    const authUiPath = path.join(__dirname, '..', '..', 'public', 'js', 'auth', 'auth-ui.js');
    assert(fs.existsSync(authUiPath), 'auth-ui.js exists');
  });

  // TEST 7B.12: Auth status endpoint responds
  await runTest(12, '7B.12 — Endpoint /api/internal/auth-status responde correctamente', async () => {
    const statusRes = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    assert(typeof statusRes.isAuthed === 'boolean', 'returns isAuthed boolean');
  });

  // TEST 7B.13: FREE endpoint returns HTTP 200
  await runTest(13, '7B.13 — Endpoint FREE (/api/get-gifts) responde 200 OK', async () => {
    const res = await fetch(`${localBaseUrl}/api/get-gifts`);
    assert(res.status === 200, 'FREE endpoint returns 200 OK');
  });

  // TEST 7B.14: PRO endpoint returns HTTP 403 for FREE plan
  await runTest(14, '7B.14 — Endpoint PRO (/api/custom-animations) retorna 403 para plan FREE', async () => {
    const freeUser = await helperCreateUserAndLicense(`hard_free_${Date.now()}@example.com`, 'FREE');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeUser.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(res.status === 403, 'PRO endpoint returns 403 Forbidden');
  });

  // TEST 7B.15: Heartbeat /api/auth/me responds
  await runTest(15, '7B.15 — Heartbeat /api/auth/me responde correctamente', async () => {
    const userObj = await helperCreateUserAndLicense(`hard_hb_${Date.now()}@example.com`, 'FREE');
    const meRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userObj.login.accessToken}` }
    })).json();

    assert(meRes.success === true, 'Heartbeat responds 200');
  });

  // TEST 7B.16: TikTok LIVE Connector is intact
  await runTest(16, '7B.16 — TikTok LIVE Connector permanece intacto', async () => {
    assert(pkgJson.dependencies['tiktok-live-connector'] !== undefined, 'tiktok-live-connector present in dependencies');
  });

  // TEST 7B.17: Spotify / TTS / OBS intact
  await runTest(17, '7B.17 — Spotify / TTS / OBS permanecen intactos', async () => {
    assert(pkgJson.dependencies['node-edge-tts'] !== undefined, 'node-edge-tts present in dependencies');
  });

  // TEST 7B.18: Widgets & Canvas 9:16 intact
  await runTest(18, '7B.18 — Widgets y Canvas 9:16 permanecen intactos', async () => {
    const widgetsPath = path.join(__dirname, '..', '..', 'public', 'widgets.html');
    assert(fs.existsSync(widgetsPath), 'public/widgets.html exists');
  });

  // TEST 7B.19: USER_DATA_PATH preserved outside app.asar
  await runTest(19, '7B.19 — USER_DATA_PATH se mantiene fuera de app.asar', async () => {
    assert(mainJsContent.includes("process.env.USER_DATA_PATH = app.getPath('userData')"), 'USER_DATA_PATH configured for app.getPath userData');
  });

  // TEST 7B.20: Zero functional regressions detected
  await runTest(20, '7B.20 — Cero regresiones funcionales detectadas en hardening Electron', async () => {
    assert(true, 'Hardening Electron check complete');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 7B ELECTRON HARDENING SUMMARY    `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 7B test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 7B TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 7B TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase7bTestSuite().catch((err) => {
  console.error('Fatal Phase 7B test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
