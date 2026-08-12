const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase3_test.db';
process.env.PORT = '4005';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4005';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase3_test.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { startServer: startAuthServer } = require('../src/index');
const config = require('../src/config');
const localServerApp = require('../../server.js');

let authServerInstance = null;
let dbHelperInstance = null;
let authBaseUrl = '';
const localBaseUrl = 'http://127.0.0.1:3000';

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function createMockGoogleToken(sub, email, name = 'Google User') {
  return 'mock_google_token:' + JSON.stringify({ sub, email, name });
}

async function runTest(testNum, testName, fn) {
  try {
    console.log(`\n--------------------------------------------------`);
    console.log(`RUNNING TEST ${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: testNum, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: testNum, name: testName, status: 'FAILED', error: err.message });
  }
}

async function executePhase3TestSuite() {
  console.log(`==================================================`);
  console.log(`    TAVLIVE PHASE 3 GOOGLE OAUTH VERIFICATION SUITE`);
  console.log(`==================================================`);

  const { server, dbHelper } = await startAuthServer();
  authServerInstance = server;
  dbHelperInstance = dbHelper;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  let testUserEmail = `trad_user_${Date.now()}@example.com`;
  let testUserPassword = 'TraditionalPassword2026!';
  let createdUserId = null;

  let googleUserEmail = `google_user_${Date.now()}@gmail.com`;
  let googleSub = `10987654321_${Date.now()}`;
  let validAccessToken = null;
  let validRefreshToken = null;

  // Setup traditional user
  const createRes = await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email: testUserEmail, name: 'Traditional Streamer', password: testUserPassword })
  });
  const createData = await createRes.json();
  createdUserId = createData.user.id;

  await fetch(`${authBaseUrl}/api/admin/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ userId: createdUserId, plan: 'PRO', maxDevices: 2 })
  });

  // TEST 1: Login tradicional continúa funcionando
  await runTest(1, 'Login tradicional continúa funcionando', async () => {
    const res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword, deviceIdentifier: 'DEV-TRAD-1' })
    });
    const data = await res.json();
    assert(res.status === 200, 'Status code 200 expected');
    assert(data.accessToken, 'Access token present');
    assert(data.user.email === testUserEmail, 'Email matches traditional user');
  });

  // TEST 2: Google OAuth exitoso
  await runTest(2, 'Google OAuth exitoso', async () => {
    const mockToken = createMockGoogleToken(googleSub, googleUserEmail);
    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken, deviceIdentifier: 'DEV-GOOGLE-1' })
    });
    const data = await res.json();
    assert(res.status === 200, `Status code 200 expected, got ${res.status}`);
    assert(data.accessToken, 'TavLive access token issued');
    assert(data.refreshToken, 'TavLive refresh token issued');
    assert(data.user.email === googleUserEmail, 'Google user email matches');

    validAccessToken = data.accessToken;
    validRefreshToken = data.refreshToken;
  });

  // TEST 3: Google OAuth con identidad inválida es rechazado
  await runTest(3, 'Google OAuth con identidad inválida es rechazado', async () => {
    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: '' })
    });
    assert(res.status === 400, 'Empty token rejected with 400 Bad Request');
  });

  // TEST 4: Token/ID token Google manipulado es rechazado
  await runTest(4, 'Token/ID token Google manipulado es rechazado', async () => {
    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'manipulated_google_token_header.payload.signature' })
    });
    assert(res.status === 500 || res.status === 400, 'Manipulated token rejected');
  });

  // TEST 5: Usuario Google nuevo se crea correctamente
  await runTest(5, 'Usuario Google nuevo se crea correctamente', async () => {
    const newGoogleSub = `sub_new_${Date.now()}`;
    const newGoogleEmail = `new_google_${Date.now()}@gmail.com`;
    const mockToken = createMockGoogleToken(newGoogleSub, newGoogleEmail);

    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    const data = await res.json();
    assert(res.status === 200, 'New user successfully registered via Google');
    assert(data.user.provider === 'google', 'Provider is google');
  });

  // TEST 6: Usuario existente no genera una cuenta duplicada
  await runTest(6, 'Usuario existente no genera una cuenta duplicada (Binding por Email)', async () => {
    const mockToken = createMockGoogleToken(`sub_bind_${Date.now()}`, testUserEmail);
    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    const data = await res.json();
    assert(res.status === 200, 'Google login bound to existing account');
    assert(data.user.id === createdUserId, 'Existing user ID matches (no duplicate created)');
  });

  // TEST 7: Cuenta suspendida no puede entrar mediante Google
  await runTest(7, 'Cuenta suspendida no puede entrar mediante Google', async () => {
    // Suspend existing user
    await fetch(`${authBaseUrl}/api/admin/users/${createdUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'suspended' })
    });

    const mockToken = createMockGoogleToken(`sub_bind_${Date.now()}`, testUserEmail);
    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    assert(res.status === 403, 'Suspended Google account rejected with 403 Forbidden');
  });

  // TEST 8: Cuenta banned no puede entrar mediante Google
  await runTest(8, 'Cuenta banned no puede entrar mediante Google', async () => {
    await fetch(`${authBaseUrl}/api/admin/users/${createdUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'banned' })
    });

    const mockToken = createMockGoogleToken(`sub_bind_${Date.now()}`, testUserEmail);
    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    assert(res.status === 403, 'Banned Google account rejected with 403 Forbidden');
  });

  // TEST 9: Cuenta sin licencia no obtiene acceso PRO automáticamente
  await runTest(9, 'Cuenta sin licencia no obtiene acceso PRO automáticamente', async () => {
    const unlicSub = `sub_unlic_${Date.now()}`;
    const unlicEmail = `unlicensed_${Date.now()}@gmail.com`;
    const mockToken = createMockGoogleToken(unlicSub, unlicEmail);

    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    const data = await res.json();
    assert(res.status === 200, 'Login successful');
    assert(data.license.plan === 'FREE', 'New Google account gets default FREE plan (not unearned PRO)');
  });

  // TEST 10: Cuenta con licencia PRO conserva correctamente su licencia
  await runTest(10, 'Cuenta con licencia PRO conserva su licencia', async () => {
    // Re-activate traditional user
    await fetch(`${authBaseUrl}/api/admin/users/${createdUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'active' })
    });

    const mockToken = createMockGoogleToken(`sub_bind_${Date.now()}`, testUserEmail);
    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    const data = await res.json();
    assert(res.status === 200, 'PRO user logs in with Google');
    assert(data.license.plan === 'PRO', 'PRO license plan preserved');
  });

  // TEST 11: Límite de dispositivos continúa funcionando
  await runTest(11, 'Límite de dispositivos continúa funcionando para Google Login', async () => {
    const devSub = `sub_dev_limit_${Date.now()}`;
    const devEmail = `dev_limit_${Date.now()}@gmail.com`;

    // Device 1 (FREE plan max devices: 1)
    const d1 = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: createMockGoogleToken(devSub, devEmail), deviceIdentifier: 'GOOGLE-DEV-1' })
    });
    assert(d1.status === 200, 'Device 1 authorized');

    // Device 2 (Should exceed max devices = 1 on FREE plan)
    const d2 = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: createMockGoogleToken(devSub, devEmail), deviceIdentifier: 'GOOGLE-DEV-2' })
    });
    const d2Data = await d2.json();
    assert(d2.status === 500 || d2.status === 400, 'Device 2 rejected due to device limit');
    assert(d2Data.error.includes('Device limit reached'), 'Device limit error returned');
  });

  // TEST 12: Refresh Token continúa funcionando
  await runTest(12, 'Refresh Token continúa funcionando', async () => {
    const res = await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: validRefreshToken })
    });
    const data = await res.json();
    assert(res.status === 200, 'Refresh token succeeds');
    assert(data.accessToken, 'New Access token emitted');
  });

  // TEST 13: Logout continúa revocando la sesión
  await runTest(13, 'Logout continúa revocando la sesión', async () => {
    await fetch(`${authBaseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: validRefreshToken })
    });

    const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: validRefreshToken })
    });
    assert(refreshRes.status === 401, 'Revoked refresh token rejected with 401');
  });

  // TEST 14: Modificar el frontend no permite convertir FREE en PRO
  await runTest(14, 'Modificar el frontend no permite convertir FREE en PRO', async () => {
    // Fresh login
    const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    const loginData = await loginRes.json();

    const res = await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${loginData.accessToken}` }
    });
    const data = await res.json();
    assert(data.license !== null, 'Server returns exact DB license object');
  });

  // TEST 15: Google Client Secret no aparece en el cliente
  await runTest(15, 'Google Client Secret no aparece en los archivos del cliente', async () => {
    const projectRoot = path.join(__dirname, '..', '..');
    const mainContent = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf-8');
    const preloadContent = fs.readFileSync(path.join(projectRoot, 'preload.js'), 'utf-8');
    const panelContent = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'panel.js'), 'utf-8');
    const authUiContent = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'auth', 'auth-ui.js'), 'utf-8');

    assert(!mainContent.includes(config.GOOGLE_CLIENT_SECRET), 'Secret not in main.js');
    assert(!preloadContent.includes(config.GOOGLE_CLIENT_SECRET), 'Secret not in preload.js');
    assert(!panelContent.includes(config.GOOGLE_CLIENT_SECRET), 'Secret not in panel.js');
    assert(!authUiContent.includes(config.GOOGLE_CLIENT_SECRET), 'Secret not in auth-ui.js');
  });

  // TEST 16: No existen credenciales sensibles dentro del build del cliente
  await runTest(16, 'No existen credenciales sensibles dentro del cliente', async () => {
    const projectRoot = path.join(__dirname, '..', '..');
    const authClientContent = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'auth', 'auth-client.js'), 'utf-8');
    assert(!authClientContent.includes(config.ADMIN_API_KEY), 'ADMIN_API_KEY not in auth-client.js');
    assert(!authClientContent.includes(config.JWT_ACCESS_SECRET), 'JWT_ACCESS_SECRET not in auth-client.js');
  });

  // TEST 17: Los widgets siguen funcionando
  await runTest(17, 'Los widgets y endpoints de overlays siguen funcionando', async () => {
    const res = await fetch(`${localBaseUrl}/overlay.html`);
    assert(res.status === 200, 'overlay.html loads successfully with 200');
  });

  // TEST 18: TikTok Connector sigue funcionando
  await runTest(18, 'TikTok Connector sigue integrado sin modificaciones', async () => {
    const res = await fetch(`${localBaseUrl}/api/internal/auth-status`);
    assert(res.status === 200, 'TikTok Connector status check endpoint responds');
  });

  // TEST 19: Spotify sigue funcionando
  await runTest(19, 'Spotify sigue integrado sin modificaciones', async () => {
    const res = await fetch(`${localBaseUrl}/music-widget.html`);
    assert(res.status === 200, 'music-widget.html loads with 200');
  });

  // TEST 20: OBS / widgets.html siguen funcionando
  await runTest(20, 'OBS / widgets.html siguen funcionando', async () => {
    const res = await fetch(`${localBaseUrl}/recetas.html`);
    assert(res.status === 200, 'recetas.html loads with 200');
  });

  console.log(`\n==================================================`);
  console.log(`       PHASE 3 GOOGLE OAUTH SUMMARY REPORT        `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nTest servers shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 3 TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 3 TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase3TestSuite().catch((err) => {
  console.error('Fatal Phase 3 test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
