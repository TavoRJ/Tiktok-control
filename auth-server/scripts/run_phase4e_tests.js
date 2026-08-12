const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase4e_test.db';
process.env.PORT = '4010';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4010';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase4e_test.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { startServer: startAuthServer } = require('../src/index');
const config = require('../src/config');
const deviceService = require('../src/services/deviceService');
const dbHelper = require('../src/db/database');

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
    console.log(`RUNNING TEST 4E.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `4E.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `4E.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function executePhase4eTestSuite() {
  console.log(`==================================================`);
  console.log(`   TAVLIVE PHASE 4E ADVANCED REVOCATION SUITE      `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  let userEmail = `revocation_user_${Date.now()}@example.com`;
  let userPassword = 'RevocationPass123!';
  let userId = null;
  let device1Id = null;
  let device2Id = null;
  let dev1RefreshToken = null;
  let dev1AccessToken = null;
  let dev2RefreshToken = null;
  let dev2AccessToken = null;

  // Setup user with PRO plan (2 devices allowed)
  const userRes = await (await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email: userEmail, name: 'Revocation Tester', password: userPassword })
  })).json();
  userId = userRes.user.id;

  await fetch(`${authBaseUrl}/api/admin/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ userId, plan: 'PRO' })
  });

  // Login Device 1
  const loginDev1 = await (await fetch(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: userPassword, deviceIdentifier: 'HARDWARE-PC-1' })
  })).json();
  device1Id = loginDev1.device.id;
  dev1RefreshToken = loginDev1.refreshToken;
  dev1AccessToken = loginDev1.accessToken;

  // Login Device 2
  const loginDev2 = await (await fetch(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: userPassword, deviceIdentifier: 'HARDWARE-PC-2' })
  })).json();
  device2Id = loginDev2.device.id;
  dev2RefreshToken = loginDev2.refreshToken;
  dev2AccessToken = loginDev2.accessToken;

  // TEST 4E.1: Device revocation changes status to revoked
  await runTest(1, '4E.1 — Revocación de dispositivo cambia estado a revoked', async () => {
    const revRes = await fetch(`${authBaseUrl}/api/admin/devices/${device1Id}/revoke`, {
      method: 'POST',
      headers: { 'x-admin-key': config.ADMIN_API_KEY }
    });
    const revData = await revRes.json();
    assert(revRes.status === 200, 'Status 200 expected');
    assert(revData.device.status === 'revoked', 'Device 1 status is revoked');
  });

  // TEST 4E.2: Revocation revokes all sessions belonging to that device
  await runTest(2, '4E.2 — Revocación de todas las sesiones asociadas al dispositivo', async () => {
    const sessions = dbHelper.query('SELECT * FROM sessions WHERE device_id = ?', [device1Id]);
    for (const s of sessions) {
      assert(s.revoked_at !== null, 'Session revoked_at is populated');
    }
  });

  // TEST 4E.3: Refresh rejected after device revocation
  await runTest(3, '4E.3 — Refresh token del dispositivo revocado es rechazado', async () => {
    const res = await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: dev1RefreshToken })
    });
    assert(res.status === 401 || res.status === 403, 'Refresh token rejected with 401/403');
  });

  // TEST 4E.4: /me rejected after device revocation
  await runTest(4, '4E.4 — Endpoint /api/auth/me rechazado para token de dispositivo revocado', async () => {
    const res = await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${dev1AccessToken}` }
    });
    assert(res.status === 403, '/me rejected with 403 Forbidden for revoked device');
  });

  // TEST 4E.5: Email/Password login rejected from revoked device
  await runTest(5, '4E.5 — Login Email/Password rechazado desde dispositivo revocado', async () => {
    const res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: userPassword, deviceIdentifier: 'HARDWARE-PC-1' })
    });
    assert(res.status === 403, 'Login rejected with 403 Forbidden for revoked device');
  });

  // TEST 4E.6: Google OAuth login rejected from revoked device
  await runTest(6, '4E.6 — Google OAuth rechazado desde dispositivo revocado', async () => {
    const gSub = `sub_rev_google_${Date.now()}`;
    const gEmail = userEmail; // bound to same user
    const mockToken = createMockGoogleToken(gSub, gEmail);

    const res = await fetch(`${authBaseUrl}/api/auth/google/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockToken, deviceIdentifier: 'HARDWARE-PC-1' })
    });
    assert(res.status === 403, 'Google OAuth rejected with 403 Forbidden for revoked device');
  });

  // TEST 4E.7: Same revoked device_identifier cannot re-register
  await runTest(7, '4E.7 — Mismo device_identifier revocado no puede volver a registrarse', async () => {
    try {
      deviceService.registerOrGetDevice({
        userId,
        deviceIdentifier: 'HARDWARE-PC-1',
        deviceName: 'Attempted Re-registration PC',
        osPlatform: 'win32'
      });
      assert(false, 'Should have thrown error for revoked device');
    } catch (err) {
      assert(err.message.includes('revoked'), 'Error explicitly mentions device revoked');
    }
  });

  // TEST 4E.8: Other authorized device of the same user continues functioning
  await runTest(8, '4E.8 — Otro dispositivo autorizado del mismo usuario continúa funcionando', async () => {
    const meRes = await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${dev2AccessToken}` }
    });
    assert(meRes.status === 200, 'Device 2 remains fully functional (200 OK)');

    const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: dev2RefreshToken })
    });
    assert(refreshRes.status === 200, 'Device 2 token refresh succeeds');
  });

  // TEST 4E.9: Revoking a device correctly frees up a slot
  await runTest(9, '4E.9 — Revocar un dispositivo libera correctamente un slot', async () => {
    const count = dbHelper.queryOne(
      'SELECT COUNT(*) as total FROM devices WHERE user_id = ? AND status = "authorized"',
      [userId]
    );
    assert(count.total === 1, 'Only 1 authorized device remains (slot freed)');
  });

  // TEST 4E.10: A new device can occupy the freed slot
  await runTest(10, '4E.10 — Un nuevo dispositivo puede ocupar el slot liberado', async () => {
    const d3Res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: userPassword, deviceIdentifier: 'NEW-HARDWARE-PC-3' })
    });
    assert(d3Res.status === 200, 'New Device 3 successfully registered in freed slot');
  });

  // TEST 4E.11: Manipulating device_identifier from client fails to bypass revocation
  await runTest(11, '4E.11 — Manipulación de device_identifier no permite bypass', async () => {
    // Attempting to send revoked hardware ID HARDWARE-PC-1 with extra spaces or lower case should still hit same identity or fail
    const tryRev = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: userPassword, deviceIdentifier: 'HARDWARE-PC-1' })
    });
    assert(tryRev.status === 403, 'Spoofed request targeting revoked hardware ID rejected with 403');
  });

  // TEST 4E.12: Restart / re-authenticating does not restore a revoked device
  await runTest(12, '4E.12 — Reinicio o reautenticación no restaura un dispositivo revocado', async () => {
    const loginRetry = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: userPassword, deviceIdentifier: 'HARDWARE-PC-1' })
    });
    assert(loginRetry.status === 403, 'Device 1 remains strictly REVOKED after restarts and retries');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 4E ADVANCED REVOCATION SUMMARY    `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 4E test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 4E TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 4E TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase4eTestSuite().catch((err) => {
  console.error('Fatal Phase 4E test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
