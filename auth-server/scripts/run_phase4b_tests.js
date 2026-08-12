const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase4b_test.db';
process.env.PORT = '4007';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4007';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase4b_test.db');
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
    console.log(`RUNNING TEST 4B.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `4B.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `4B.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function executePhase4bTestSuite() {
  console.log(`==================================================`);
  console.log(`     TAVLIVE PHASE 4B LICENSE STATUSES TEST SUITE  `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  let testUserId = null;
  let testUserEmail = `status_user_${Date.now()}@example.com`;
  let testUserPassword = 'StatusPassword123!';
  let licenseId = null;

  // Create user
  const userRes = await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email: testUserEmail, name: 'Status Tester', password: testUserPassword })
  });
  const userData = await userRes.json();
  testUserId = userData.user.id;

  // Create active license
  const licRes = await fetch(`${authBaseUrl}/api/admin/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ userId: testUserId, plan: 'PRO' })
  });
  const licData = await licRes.json();
  licenseId = licData.license.id;

  // TEST 1: active status -> access granted
  await runTest(1, 'License ACTIVE: acceso permitido', async () => {
    const res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    const data = await res.json();
    assert(res.status === 200, 'Status code 200 expected for active license');
    assert(data.accessToken, 'Access token emitted');
  });

  // TEST 2: expired status -> access rejected
  await runTest(2, 'License EXPIRED: acceso rechazado con 403 Forbidden', async () => {
    // Set status to expired
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'expired' })
    });

    const res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    assert(res.status === 403, '403 Forbidden expected for expired license');
  });

  // TEST 3: revoked status -> access rejected
  await runTest(3, 'License REVOKED: acceso rechazado con 403 Forbidden', async () => {
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'revoked' })
    });

    const res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    assert(res.status === 403, '403 Forbidden expected for revoked license');
  });

  // TEST 4: paused status -> access rejected
  await runTest(4, 'License PAUSED: acceso rechazado con 403 Forbidden', async () => {
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'paused' })
    });

    const res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    assert(res.status === 403, '403 Forbidden expected for paused license');
  });

  // TEST 5: Dynamic transition active -> expired -> next token refresh rejected
  await runTest(5, 'Transición activa ACTIVE -> EXPIRED invalida la renovación de token', async () => {
    // Set back to active
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'active' })
    });

    // Login to get tokens
    const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    const loginData = await loginRes.json();
    const activeRefreshToken = loginData.refreshToken;

    // Change status to expired
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'expired' })
    });

    // Attempt token refresh
    const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: activeRefreshToken })
    });
    assert(refreshRes.status === 403, 'Token refresh rejected with 403 due to expired license');
  });

  // TEST 6: Dynamic transition active -> revoked -> next token refresh rejected
  await runTest(6, 'Transición activa ACTIVE -> REVOKED invalida la renovación de token', async () => {
    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'active' })
    });

    const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    const loginData = await loginRes.json();
    const activeRefreshToken = loginData.refreshToken;

    await fetch(`${authBaseUrl}/api/admin/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'revoked' })
    });

    const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: activeRefreshToken })
    });
    assert(refreshRes.status === 403, 'Token refresh rejected with 403 due to revoked license');
  });

  // TEST 7: Google Login with paused license rejected
  await runTest(7, 'Google OAuth rechaza login si la licencia está PAUSED/EXPIRED', async () => {
    const gSub = `sub_status_google_${Date.now()}`;
    const gEmail = `status_google_${Date.now()}@gmail.com`;
    const mockToken = createMockGoogleToken(gSub, gEmail);

    // Initial google login creates FREE active license
    const g1 = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    const g1Data = await g1.json();
    assert(g1.status === 200, 'Initial google login ok');

    // Pause license
    await fetch(`${authBaseUrl}/api/admin/licenses/${g1Data.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'paused' })
    });

    // Attempt second google login
    const g2 = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken })
    });
    assert(g2.status === 403, 'Google login rejected with 403 due to paused license');
  });

  console.log(`\n==================================================`);
  console.log(`    PHASE 4B LICENSE STATUSES SUMMARY REPORT      `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 4B test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 4B TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 4B TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase4bTestSuite().catch((err) => {
  console.error('Fatal Phase 4B test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
