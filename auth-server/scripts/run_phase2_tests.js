const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase2_test.db';
process.env.PORT = '4000';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4000';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase2_test.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { startServer: startAuthServer } = require('../src/index');
const config = require('../src/config');

// Require local TavLive server
const localServerApp = require('../../server.js');

let authServerInstance = null;
let dbHelperInstance = null;
const authBaseUrl = 'http://127.0.0.1:4000';
const localBaseUrl = 'http://127.0.0.1:3000';

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

async function executePhase2TestSuite() {
  console.log(`==================================================`);
  console.log(`    TAVLIVE PHASE 2 INTEGRATION VERIFICATION SUITE `);
  console.log(`==================================================`);

  // Start Auth Server
  const { server, dbHelper } = await startAuthServer();
  authServerInstance = server;
  dbHelperInstance = dbHelper;

  let testUserEmail = `streamer_phase2_${Date.now()}@example.com`;
  let testUserPassword = 'ValidPassword2026!';
  let createdUserId = null;
  let validAccessToken = null;
  let validRefreshToken = null;

  // Setup: Create test user and license
  const createUserRes = await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email: testUserEmail, name: 'TavLive Streamer', password: testUserPassword, role: 'user', status: 'active' })
  });
  const userData = await createUserRes.json();
  createdUserId = userData.user.id;

  await fetch(`${authBaseUrl}/api/admin/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ userId: createdUserId, plan: 'PRO', maxDevices: 2 })
  });

  // TEST 1: Estado Inicial de TavLive (Locked / Unauthenticated)
  await runTest('TEST 1: Estado inicial de TavLive sin sesión (Locked)', async () => {
    const res = await fetch(`${localBaseUrl}/api/internal/auth-status`);
    const data = await res.json();
    assert(data.isAuthed === false, 'TavLive local server state must be isAuthed: false');
    assert(data.user === null, 'No user profile set');
  });

  // TEST 2: Intento con Contraseña Incorrecta
  await runTest('TEST 2: Login con contraseña incorrecta', async () => {
    const authRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: 'WrongPassword123!' })
    });
    assert(authRes.status === 401, 'Auth server rejects wrong password with 401');

    const localStatus = await fetch(`${localBaseUrl}/api/internal/auth-status`);
    const statusData = await localStatus.json();
    assert(statusData.isAuthed === false, 'TavLive remains locked after failed login');
  });

  // TEST 3: Intento con Usuario Inexistente
  await runTest('TEST 3: Login con usuario inexistente', async () => {
    const authRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@example.com', password: 'SomePassword!' })
    });
    assert(authRes.status === 401, 'Auth server rejects non-existent user with 401');

    const localStatus = await fetch(`${localBaseUrl}/api/internal/auth-status`);
    const statusData = await localStatus.json();
    assert(statusData.isAuthed === false, 'TavLive remains locked');
  });

  // TEST 4: Login Válido y Desbloqueo de TavLive
  await runTest('TEST 4: Login válido y desbloqueo de TavLive', async () => {
    const authRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword, deviceIdentifier: 'TEST-DEVICE-P2' })
    });
    const authData = await authRes.json();
    assert(authRes.status === 200, 'Auth server returns 200 for valid credentials');
    assert(authData.accessToken, 'Access token returned');
    assert(authData.refreshToken, 'Refresh token returned');

    validAccessToken = authData.accessToken;
    validRefreshToken = authData.refreshToken;

    // Sync session with local TavLive server
    const syncRes = await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: validAccessToken, user: authData.user })
    });
    const syncData = await syncRes.json();
    assert(syncRes.status === 200, 'Local server set-auth-session returns 200');
    assert(syncData.isAuthed === true, 'TavLive local server is now unlocked');

    const localStatus = await fetch(`${localBaseUrl}/api/internal/auth-status`);
    const statusData = await localStatus.json();
    assert(statusData.isAuthed === true, 'Local status confirms isAuthed: true');
    assert(statusData.user.email === testUserEmail, 'Local status contains user profile');
  });

  // TEST 5: Restauración de Sesión Segura
  await runTest('TEST 5: Restauración de sesión vía Refresh Token', async () => {
    // Refresh access token with remote auth server
    const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: validRefreshToken })
    });
    const refreshData = await refreshRes.json();
    assert(refreshRes.status === 200, 'Refresh token accepted by remote auth server');
    assert(refreshData.accessToken, 'New access token issued');

    validAccessToken = refreshData.accessToken;

    // Sync renewed token with local server
    const syncRes = await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: validAccessToken, user: { email: testUserEmail } })
    });
    assert(syncRes.status === 200, 'Local server session successfully restored');
  });

  // TEST 6: Cierre de Sesión (Logout)
  await runTest('TEST 6: Cierre de sesión y regreso a estado Locked', async () => {
    // Notify local server
    const clearRes = await fetch(`${localBaseUrl}/api/internal/clear-auth-session`, { method: 'POST' });
    assert(clearRes.status === 200, 'Local server session cleared');

    // Notify auth server
    await fetch(`${authBaseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: validRefreshToken })
    });

    const localStatus = await fetch(`${localBaseUrl}/api/internal/auth-status`);
    const statusData = await localStatus.json();
    assert(statusData.isAuthed === false, 'TavLive returned to locked state');
  });

  // TEST 7: Usuario Suspendido desde Admin API
  await runTest('TEST 7: Bloqueo de inicio de sesión para Usuario Suspendido', async () => {
    // Suspend user
    await fetch(`${authBaseUrl}/api/admin/users/${createdUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'suspended' })
    });

    const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    assert(loginRes.status === 403, 'Suspended user login rejected with 403 Forbidden');
  });

  // TEST 8: Revocación de Sesión en Backend
  await runTest('TEST 8: Detección de sesión revocada', async () => {
    // Re-activate user
    await fetch(`${authBaseUrl}/api/admin/users/${createdUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'active' })
    });

    // Login to get new tokens
    const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
    });
    const loginData = await loginRes.json();
    const tokenToRevoke = loginData.refreshToken;

    // Revoke sessions via Admin API
    await fetch(`${authBaseUrl}/api/admin/users/${createdUserId}/revoke-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY }
    });

    // Attempting refresh with revoked session must fail
    const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokenToRevoke })
    });
    assert(refreshRes.status === 401, 'Revoked refresh token rejected with 401');
  });

  // TEST 9: Credenciales/Tokens Alterados o Falsos
  await runTest('TEST 9: Rechazo de tokens alterados o falsificados', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake_payload.fake_signature';
    const syncRes = await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: fakeToken, user: { email: testUserEmail } })
    });
    assert(syncRes.status === 401, 'Local server rejects fake token with 401');

    const statusRes = await fetch(`${localBaseUrl}/api/internal/auth-status`);
    const statusData = await statusRes.json();
    assert(statusData.isAuthed === false, 'TavLive remains locked against forged tokens');
  });

  // TEST 10: Intento de Inicio de Funciones sin Autenticación
  await runTest('TEST 10: Rechazo de funciones protegidas sin autenticación', async () => {
    // Ensure local server is locked
    await fetch(`${localBaseUrl}/api/internal/clear-auth-session`, { method: 'POST' });

    const statusRes = await fetch(`${localBaseUrl}/api/internal/auth-status`);
    const statusData = await statusRes.json();
    assert(statusData.isAuthed === false, 'Confirmed server is locked');
  });

  console.log(`\n==================================================`);
  console.log(`         PHASE 2 INTEGRATION SUMMARY REPORT       `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nTest servers shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 2 TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase2TestSuite().catch((err) => {
  console.error('Fatal Phase 2 test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
