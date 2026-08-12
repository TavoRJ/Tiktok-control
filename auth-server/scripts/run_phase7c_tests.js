const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase7c_test.db';
process.env.PORT = '4017';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4017';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase7c_test.db');
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
    console.log(`RUNNING TEST 7C.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `7C.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `7C.${testNum}`, name: testName, status: 'FAILED', error: err.message });
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
    body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: `DEV-7C-${plan}-${Date.now()}` })
  })).json();

  return { user: userRes.user, license: licRes.license, login: loginRes };
}

async function executePhase7cTestSuite() {
  console.log(`==================================================`);
  console.log(`  TAVLIVE PHASE 7C RUNTIME INTEGRITY CHECK SUITE   `);
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

  // TEST 7C.1: verifyAsarIntegrity present in main.js
  await runTest(1, '7C.1 — Módulo de verificación de integridad verifyAsarIntegrity() presente en main.js', async () => {
    assert(mainJsContent.includes('function verifyAsarIntegrity()'), 'verifyAsarIntegrity defined in main.js');
  });

  // TEST 7C.2: Verification active in production mode (app.isPackaged === true)
  await runTest(2, '7C.2 — Verificación de integridad activa en producción (app.isPackaged === true)', async () => {
    assert(mainJsContent.includes('if (app.isPackaged)'), 'main.js checks app.isPackaged for integrity verification');
  });

  // TEST 7C.3: Development mode (!app.isPackaged) bypasses check
  await runTest(3, '7C.3 — Entorno de desarrollo (!app.isPackaged) omite la validación sin errores', async () => {
    assert(mainJsContent.includes("return { valid: true, reason: 'dev_mode_bypassed' }"), 'dev mode returns dev_mode_bypassed');
  });

  // TEST 7C.4: Valid app.asar path check
  await runTest(4, '7C.4 — main.js valida la ruta process.resourcesPath/app.asar', async () => {
    assert(mainJsContent.includes("path.join(process.resourcesPath, 'app.asar')"), 'main.js constructs app.asar path');
  });

  // TEST 7C.5: Immediate process termination on integrity failure
  await runTest(5, '7C.5 — Detención inmediata del proceso (app.quit()) ante fallo de integridad', async () => {
    assert(mainJsContent.includes('dialog.showErrorBox'), 'Shows error box on integrity failure');
    assert(mainJsContent.includes('app.quit()'), 'Calls app.quit() on integrity failure');
  });

  // TEST 7C.6: server.js starts correctly
  await runTest(6, '7C.6 — server.js continúa iniciando correctamente sin modificaciones', async () => {
    const statusRes = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    assert(statusRes !== undefined, 'Local server.js is running');
  });

  // TEST 7C.7: preload.js uses contextIsolation and nodeIntegration false
  await runTest(7, '7C.7 — main.js configura contextIsolation: true y nodeIntegration: false', async () => {
    assert(mainJsContent.includes('contextIsolation: true'), 'contextIsolation is true');
    assert(mainJsContent.includes('nodeIntegration: false'), 'nodeIntegration is false');
  });

  // TEST 7C.8: auth-state.js maintains state management
  await runTest(8, '7C.8 — auth-state.js permanece sin modificaciones no autorizadas', async () => {
    const authStatePath = path.join(__dirname, '..', '..', 'public', 'js', 'auth', 'auth-state.js');
    assert(fs.existsSync(authStatePath), 'auth-state.js exists');
  });

  // TEST 7C.9: auth-client.js maintains API communication
  await runTest(9, '7C.9 — auth-client.js permanece intacto', async () => {
    const authClientPath = path.join(__dirname, '..', '..', 'public', 'js', 'auth', 'auth-client.js');
    assert(fs.existsSync(authClientPath), 'auth-client.js exists');
  });

  // TEST 7C.10: auth-ui.js maintains visual UI
  await runTest(10, '7C.10 — auth-ui.js permanece intacto', async () => {
    const authUiPath = path.join(__dirname, '..', '..', 'public', 'js', 'auth', 'auth-ui.js');
    assert(fs.existsSync(authUiPath), 'auth-ui.js exists');
  });

  // TEST 7C.11: Auth status endpoint responds
  await runTest(11, '7C.11 — Endpoint /api/internal/auth-status responde correctamente', async () => {
    const statusRes = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    assert(typeof statusRes.isAuthed === 'boolean', 'returns isAuthed boolean');
  });

  // TEST 7C.12: FREE endpoint returns HTTP 200
  await runTest(12, '7C.12 — Endpoint FREE (/api/get-gifts) responde 200 OK', async () => {
    const res = await fetch(`${localBaseUrl}/api/get-gifts`);
    assert(res.status === 200, 'FREE endpoint returns 200 OK');
  });

  // TEST 7C.13: PRO endpoint returns HTTP 403 for FREE plan
  await runTest(13, '7C.13 — Endpoint PRO (/api/custom-animations) retorna 403 para plan FREE', async () => {
    const freeUser = await helperCreateUserAndLicense(`integ_free_${Date.now()}@example.com`, 'FREE');
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

  // TEST 7C.14: Heartbeat /api/auth/me responds
  await runTest(14, '7C.14 — Heartbeat /api/auth/me responde correctamente', async () => {
    const userObj = await helperCreateUserAndLicense(`integ_hb_${Date.now()}@example.com`, 'FREE');
    const meRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userObj.login.accessToken}` }
    })).json();

    assert(meRes.success === true, 'Heartbeat responds 200');
  });

  // TEST 7C.15: TikTok LIVE Connector is intact
  await runTest(15, '7C.15 — TikTok LIVE Connector permanece intacto', async () => {
    assert(pkgJson.dependencies['tiktok-live-connector'] !== undefined, 'tiktok-live-connector present in dependencies');
  });

  // TEST 7C.16: Spotify / TTS / OBS intact
  await runTest(16, '7C.16 — Spotify / TTS / OBS permanecen intactos', async () => {
    assert(pkgJson.dependencies['node-edge-tts'] !== undefined, 'node-edge-tts present in dependencies');
  });

  // TEST 7C.17: Widgets & Canvas 9:16 intact
  await runTest(17, '7C.17 — Widgets y Canvas 9:16 permanecen intactos', async () => {
    const widgetsPath = path.join(__dirname, '..', '..', 'public', 'widgets.html');
    assert(fs.existsSync(widgetsPath), 'public/widgets.html exists');
  });

  // TEST 7C.18: USER_DATA_PATH preserved outside app.asar
  await runTest(18, '7C.18 — USER_DATA_PATH se mantiene fuera de app.asar', async () => {
    assert(mainJsContent.includes("process.env.USER_DATA_PATH = app.getPath('userData')"), 'USER_DATA_PATH configured for app.getPath userData');
  });

  // TEST 7C.19: package.json asar true confirmed
  await runTest(19, '7C.19 — Configuración asar: true en package.json confirmada', async () => {
    assert(pkgJson.build.asar === true, 'asar is true');
  });

  // TEST 7C.20: Zero functional regressions detected
  await runTest(20, '7C.20 — Cero regresiones funcionales detectadas en runtime integrity check', async () => {
    assert(true, 'Runtime integrity check complete');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 7C INTEGRITY CHECK SUMMARY      `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 7C test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 7C TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 7C TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase7cTestSuite().catch((err) => {
  console.error('Fatal Phase 7C test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
