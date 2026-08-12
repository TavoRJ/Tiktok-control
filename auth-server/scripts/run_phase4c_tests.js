const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase4c_test.db';
process.env.PORT = '4008';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4008';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase4c_test.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { startServer: startAuthServer } = require('../src/index');
const config = require('../src/config');
const licenseService = require('../src/services/licenseService');

let authServerInstance = null;
let authBaseUrl = '';
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
    console.log(`RUNNING TEST 4C.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `4C.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `4C.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function executePhase4cTestSuite() {
  console.log(`==================================================`);
  console.log(`   TAVLIVE PHASE 4C EXPIRATION (expires_at) SUITE  `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  let testUserId = null;
  let testUserEmail = `expires_user_${Date.now()}@example.com`;
  let testUserPassword = 'ExpiresPassword123!';
  let licenseId = null;

  // Create user
  const userRes = await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email: testUserEmail, name: 'Expires Tester', password: testUserPassword })
  });
  const userData = await userRes.json();
  testUserId = userData.user.id;

  // TEST 1: Active license with future expires_at -> access granted
  await runTest(1, 'expires_at en el futuro: acceso permitido (HTTP 200)', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days in future
    const licRes = await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: testUserId, plan: 'PRO', expiresAt: futureDate })
    });
    const licData = await licRes.json();
    licenseId = licData.license.id;

    const res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    const data = await res.json();
    assert(res.status === 200, 'Status code 200 expected for future expires_at');
    assert(data.accessToken, 'Access token emitted');
  });

  // TEST 2: Active license with past expires_at -> access rejected
  await runTest(2, 'expires_at en el pasado: acceso rechazado con 403 Forbidden', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day in past
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: pastDate })
    });

    const res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    assert(res.status === 403, 'Status code 403 Forbidden expected for past expires_at');
  });

  // TEST 3: Active license with expires_at = null (perpetual) -> access granted
  await runTest(3, 'expires_at = null (perpetua/sin vencimiento): acceso permitido', async () => {
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: null })
    });

    const res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    assert(res.status === 200, 'Status code 200 expected for null expires_at');
  });

  // TEST 4: License expiring during session -> next token refresh rejected
  await runTest(4, 'Licencia que vence durante la sesión: siguiente renovación rechazada', async () => {
    // Set future date first
    const nearFuture = new Date(Date.now() + 5000).toISOString();
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: nearFuture })
    });

    const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    const loginData = await loginRes.json();
    const activeRefreshToken = loginData.refreshToken;

    // Set expires_at to past
    const pastDate = new Date(Date.now() - 1000).toISOString();
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: pastDate })
    });

    const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: activeRefreshToken })
    });
    assert(refreshRes.status === 403, 'Refresh rejected with 403 after expires_at passed');
  });

  // TEST 5: Google OAuth login with past expires_at rejected
  await runTest(5, 'Google OAuth rechaza login si expires_at ha transcurrido', async () => {
    const gSub = `sub_exp_google_${Date.now()}`;
    const gEmail = `exp_google_${Date.now()}@gmail.com`;
    const mockToken = createMockGoogleToken(gSub, gEmail);

    const g1 = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    const g1Data = await g1.json();

    // Expire the created license
    const pastDate = new Date(Date.now() - 60000).toISOString();
    await fetch(`${authBaseUrl}/api/admin/licenses/${g1Data.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: pastDate })
    });

    const g2 = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    assert(g2.status === 403, 'Google login rejected with 403 due to past expires_at');
  });

  // TEST 6: /api/auth/me rejects expired license
  await runTest(6, 'Endpoint /api/auth/me rechaza licencias expiradas por fecha', async () => {
    // Reset to perpetual first to get valid access token
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: null })
    });

    const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    const loginData = await loginRes.json();

    // Expire license
    const pastDate = new Date(Date.now() - 5000).toISOString();
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: pastDate })
    });

    const meRes = await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${loginData.accessToken}` }
    });
    assert(meRes.status === 403, '/me rejected with 403 for expired license');
  });

  console.log(`\n==================================================`);
  console.log(`   PHASE 4C EXPIRATION (expires_at) SUMMARY REPORT`);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 4C test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 4C TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 4C TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase4cTestSuite().catch((err) => {
  console.error('Fatal Phase 4C test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
