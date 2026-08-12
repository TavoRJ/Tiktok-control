const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_test.db';
process.env.PORT = '4005';

// Clean test database before test run
const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_test.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { startServer } = require('../src/index');
const config = require('../src/config');

let baseUrl = '';
let serverInstance = null;
let dbHelperInstance = null;

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTest(testName, testFn) {
  try {
    console.log(`\n--------------------------------------------------`);
    console.log(`RUNNING TEST: [ ${testName} ]`);
    await testFn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ name: testName, status: 'FAILED', error: err.message });
  }
}

async function executeTestSuite() {
  console.log(`==================================================`);
  console.log(`    TAVLIVE PHASE 1 VERIFICATION TEST SUITE        `);
  console.log(`==================================================`);

  const { server, dbHelper } = await startServer();
  serverInstance = server;
  dbHelperInstance = dbHelper;
  const actualPort = server.address().port;
  baseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${baseUrl}`);

  let createdUserId = null;
  let testUserEmail = `streamer_${Date.now()}@example.com`;
  let testUserPassword = 'SuperSecretPassword2026!';
  let validAccessToken = null;
  let validRefreshToken = null;

  // 1. Create User via Admin API
  await runTest('1. Crear usuario (vía Admin API)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': config.ADMIN_API_KEY
      },
      body: JSON.stringify({
        email: testUserEmail,
        name: 'Streamer Pro User',
        password: testUserPassword,
        role: 'user',
        status: 'active'
      })
    });

    const data = await res.json();
    assert(res.status === 201, `Status code should be 201, got ${res.status}`);
    assert(data.success === true, 'Data success should be true');
    assert(data.user.email === testUserEmail, 'Email matches');
    assert(data.user.id, 'User ID is returned');
    createdUserId = data.user.id;
  });

  // 2. Assign License to User
  await runTest('2. Asignar Licencia PRO al usuario', async () => {
    const res = await fetch(`${baseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': config.ADMIN_API_KEY
      },
      body: JSON.stringify({
        userId: createdUserId,
        plan: 'PRO',
        maxDevices: 2
      })
    });
    const data = await res.json();
    assert(res.status === 201, `Status code 201 expected, got ${res.status}`);
    assert(data.license.key.startsWith('TAVLIVE-PRO-'), 'License key has PRO format');
  });

  // 3. Verify Argon2id Password Hash stored in DB
  await runTest('3. Verificar que la contraseña almacenada es un hash Argon2id', async () => {
    const dbUser = dbHelperInstance.queryOne('SELECT password_hash FROM users WHERE id = ?', [createdUserId]);
    assert(dbUser, 'User found in DB');
    assert(dbUser.password_hash.startsWith('$argon2id$'), `Hash must start with $argon2id$, got: ${dbUser.password_hash}`);
    assert(!dbUser.password_hash.includes(testUserPassword), 'Plaintext password must NOT be in DB');
    console.log(`   --> Verified stored hash format: ${dbUser.password_hash.substring(0, 35)}...`);
  });

  // 4. Correct Login
  await runTest('4. Login correcto', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: testUserPassword,
        deviceIdentifier: 'HARDWARE-UUID-TEST-PC-1',
        deviceName: 'Gaming Desktop PC',
        osPlatform: 'win32'
      })
    });

    const data = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(data.success === true, 'Success true');
    assert(data.accessToken, 'Access token present');
    assert(data.refreshToken, 'Refresh token present');
    assert(data.user.email === testUserEmail, 'User profile returned');
    assert(data.license && data.license.plan === 'PRO', 'License details returned');

    validAccessToken = data.accessToken;
    validRefreshToken = data.refreshToken;
  });

  // 5. Login with incorrect password
  await runTest('5. Login con contraseña incorrecta', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: 'WrongPassword123!',
        deviceIdentifier: 'HARDWARE-UUID-TEST-PC-1'
      })
    });
    const data = await res.json();
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(data.success === false, 'Success false');
    assert(data.error === 'Invalid email or password.', 'Generic error message (no detail leakage)');
  });

  // 6. Login with non-existent user
  await runTest('6. Login con usuario inexistente', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ghost_user_9999@example.com',
        password: 'SomePassword123!',
        deviceIdentifier: 'HARDWARE-UUID-TEST-PC-1'
      })
    });
    const data = await res.json();
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(data.error === 'Invalid email or password.', 'Generic error message');
  });

  // 7. Invalid Inputs validation
  await runTest('7. Manejo de inputs inválidos (Zod Schema Validation)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid-email-format',
        password: ''
      })
    });
    const data = await res.json();
    assert(res.status === 400, `Expected 400 Bad Request, got ${res.status}`);
    assert(data.error === 'Validation failed', 'Validation failed message');
    assert(Array.isArray(data.details), 'Details array provided');
  });

  // 8. Token emission and /me endpoint
  await runTest('8. Verificar emisión de tokens y Endpoint /me (Bearer Auth)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${validAccessToken}`
      }
    });
    const data = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(data.user.id === createdUserId, 'Authenticated user ID matches');
    assert(data.license.plan === 'PRO', 'License plan matches');
  });

  // 9. Refresh token exchange
  await runTest('9. Renovación de sesión vía Refresh Token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: validRefreshToken
      })
    });
    const data = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(data.accessToken, 'New Access token emitted');
    validAccessToken = data.accessToken;
  });

  // 10. Logout and Session Revocation
  await runTest('10. Cierre de sesión y revocación de Refresh Token', async () => {
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: validRefreshToken
      })
    });
    assert(logoutRes.status === 200, 'Logout succeeded');

    // Attempting to refresh with revoked token should fail
    const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: validRefreshToken
      })
    });
    assert(refreshRes.status === 401, `Expected 401 for revoked refresh token, got ${refreshRes.status}`);
  });

  // 11. Suspended User Login
  await runTest('11. Bloqueo de acceso para Usuario Suspendido', async () => {
    // Suspend user via Admin API
    await fetch(`${baseUrl}/api/admin/users/${createdUserId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': config.ADMIN_API_KEY
      },
      body: JSON.stringify({ status: 'suspended' })
    });

    // Try to login
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: testUserPassword
      })
    });
    const data = await loginRes.json();
    assert(loginRes.status === 403, `Expected 403 Forbidden for suspended user, got ${loginRes.status}`);
    assert(data.error.includes('suspended'), 'Suspended error message');
  });

  // 12. Banned User Login
  await runTest('12. Bloqueo de acceso para Usuario Banned', async () => {
    // Ban user via Admin API
    await fetch(`${baseUrl}/api/admin/users/${createdUserId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': config.ADMIN_API_KEY
      },
      body: JSON.stringify({ status: 'banned' })
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: testUserPassword
      })
    });
    const data = await loginRes.json();
    assert(loginRes.status === 403, `Expected 403 for banned user, got ${loginRes.status}`);
    assert(data.error.includes('banned'), 'Banned error message');
  });

  // 13. Device Limit Enforcement
  await runTest('13. Verificación de Límite de Dispositivos (Max 2 en PRO)', async () => {
    // Re-activate user
    await fetch(`${baseUrl}/api/admin/users/${createdUserId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': config.ADMIN_API_KEY
      },
      body: JSON.stringify({ status: 'active' })
    });

    // Device 1: HARDWARE-UUID-TEST-PC-1 (already registered in Test 4)
    const d1 = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword, deviceIdentifier: 'HARDWARE-UUID-TEST-PC-1' })
    });
    assert(d1.status === 200, `Device 1 authorized, got ${d1.status}`);

    // Device 2: HARDWARE-UUID-TEST-LAPTOP-2 (2nd device allowed)
    const d2 = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword, deviceIdentifier: 'HARDWARE-UUID-TEST-LAPTOP-2' })
    });
    assert(d2.status === 200, `Device 2 authorized, got ${d2.status}`);

    // Device 3: HARDWARE-UUID-TEST-TABLET-3 (3rd device -> EXCEEDS MAX 2!)
    const d3 = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword, deviceIdentifier: 'HARDWARE-UUID-TEST-TABLET-3' })
    });
    const d3Data = await d3.json();
    assert(d3.status === 500 || d3.status === 400, `Device 3 rejected as expected (Status ${d3.status})`);
    assert(d3Data.error.includes('Device limit reached'), 'Device limit error message returned');
  });

  // 14. Confirm No Secrets in Error Logs
  await runTest('14. Confirmar que ningún secreto aparece en errores o respuestas', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: 'WrongPassword' })
    });
    const data = await res.json();
    const strResponse = JSON.stringify(data);
    assert(!strResponse.includes(config.JWT_ACCESS_SECRET), 'JWT Access Secret not in response');
    assert(!strResponse.includes(config.ADMIN_API_KEY), 'Admin API Key not in response');
    assert(!strResponse.includes(testUserPassword), 'Plaintext password not in response');
  });

  console.log(`\n==================================================`);
  console.log(`             PHASE 1 SUMMARY REPORT               `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  serverInstance.close(() => {
    console.log(`\nTest server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 1 TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executeTestSuite().catch((err) => {
  console.error('Fatal test execution error:', err);
  if (serverInstance) serverInstance.close();
  process.exit(1);
});
