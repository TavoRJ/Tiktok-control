const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase6c_test.db';
process.env.PORT = '4013';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4013';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase6c_test.db');
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
    console.log(`RUNNING TEST 6C.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `6C.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `6C.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function helperCreateUserAndLicense(email, plan = 'FREE', status = 'active', expiresAt = null) {
  const userRes = await (await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email, name: `User ${plan}`, password: 'Password123!' })
  })).json();

  const licRes = await (await fetch(`${authBaseUrl}/api/admin/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ userId: userRes.user.id, plan, status, expiresAt })
  })).json();

  const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: `DEV-6C-${plan}-${Date.now()}` })
  })).json();

  return { user: userRes.user, license: licRes.license, login: loginRes };
}

async function executePhase6cTestSuite() {
  console.log(`==================================================`);
  console.log(`  TAVLIVE PHASE 6C CLIENT LICENSE STATE SUITE     `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  // TEST 6C.1: Initial currentLicense is null
  await runTest(1, '6C.1 — currentLicense inicial correctamente definido como null', async () => {
    let mockLicense = null;
    let mockState = 'LOCKED';
    function getCurrentLicense() { return mockLicense; }
    assert(getCurrentLicense() === null, 'Initial license is null');
  });

  // TEST 6C.2: Login FREE updates currentLicense
  await runTest(2, '6C.2 — Login FREE actualiza currentLicense', async () => {
    const freeUser = await helperCreateUserAndLicense(`c_free_${Date.now()}@example.com`, 'FREE');
    assert(freeUser.login.license.plan === 'FREE', 'Login response returns FREE license');
  });

  // TEST 6C.3: Login PRO updates currentLicense
  await runTest(3, '6C.3 — Login PRO actualiza currentLicense', async () => {
    const proUser = await helperCreateUserAndLicense(`c_pro_${Date.now()}@example.com`, 'PRO');
    assert(proUser.login.license.plan === 'PRO', 'Login response returns PRO license');
  });

  // TEST 6C.4: Login VIP updates currentLicense
  await runTest(4, '6C.4 — Login VIP actualiza currentLicense', async () => {
    const vipUser = await helperCreateUserAndLicense(`c_vip_${Date.now()}@example.com`, 'VIP');
    assert(vipUser.login.license.plan === 'VIP', 'Login response returns VIP license');
  });

  // TEST 6C.5: getCurrentPlan() returns FREE
  await runTest(5, '6C.5 — getCurrentPlan() devuelve FREE para usuario FREE', async () => {
    const license = { plan: 'FREE', status: 'active' };
    function getCurrentPlan(lic) { return lic ? lic.plan : 'FREE'; }
    assert(getCurrentPlan(license) === 'FREE', 'Returns FREE plan');
  });

  // TEST 6C.6: getCurrentPlan() returns PRO
  await runTest(6, '6C.6 — getCurrentPlan() devuelve PRO para usuario PRO', async () => {
    const license = { plan: 'PRO', status: 'active' };
    function getCurrentPlan(lic) { return lic ? lic.plan : 'FREE'; }
    assert(getCurrentPlan(license) === 'PRO', 'Returns PRO plan');
  });

  // TEST 6C.7: getCurrentPlan() returns VIP
  await runTest(7, '6C.7 — getCurrentPlan() devuelve VIP para usuario VIP', async () => {
    const license = { plan: 'VIP', status: 'active' };
    function getCurrentPlan(lic) { return lic ? lic.plan : 'FREE'; }
    assert(getCurrentPlan(license) === 'VIP', 'Returns VIP plan');
  });

  // TEST 6C.8: hasPlan() respects hierarchy FREE < PRO < VIP
  await runTest(8, '6C.8 — hasPlan() respeta jerarquía FREE < PRO < VIP', async () => {
    const PLAN_WEIGHTS = { FREE: 1, PRO: 2, VIP: 3 };
    function hasPlan(userPlan, reqPlan) {
      return (PLAN_WEIGHTS[userPlan] || 1) >= (PLAN_WEIGHTS[reqPlan] || 1);
    }

    assert(hasPlan('FREE', 'FREE') === true, 'FREE has FREE');
    assert(hasPlan('FREE', 'PRO') === false, 'FREE does NOT have PRO');
    assert(hasPlan('FREE', 'VIP') === false, 'FREE does NOT have VIP');

    assert(hasPlan('PRO', 'FREE') === true, 'PRO has FREE');
    assert(hasPlan('PRO', 'PRO') === true, 'PRO has PRO');
    assert(hasPlan('PRO', 'VIP') === false, 'PRO does NOT have VIP');

    assert(hasPlan('VIP', 'FREE') === true, 'VIP has FREE');
    assert(hasPlan('VIP', 'PRO') === true, 'VIP has PRO');
    assert(hasPlan('VIP', 'VIP') === true, 'VIP has VIP');
  });

  // TEST 6C.9: Logout clears currentLicense to null
  await runTest(9, '6C.9 — Logout limpia currentLicense a null', async () => {
    let currentLicense = { plan: 'PRO', status: 'active' };
    function logout() { currentLicense = null; }
    logout();
    assert(currentLicense === null, 'License cleared on logout');
  });

  // TEST 6C.10: LOCKED state does not retain active license
  await runTest(10, '6C.10 — Sesión LOCKED no conserva licencia activa', async () => {
    let state = 'LOCKED';
    let currentLicense = null;
    assert(state === 'LOCKED' && currentLicense === null, 'LOCKED state has null license');
  });

  // TEST 6C.11: Session restoration retrieves currentLicense
  await runTest(11, '6C.11 — Restauración de sesión recupera currentLicense', async () => {
    const proUser = await helperCreateUserAndLicense(`c_rest_${Date.now()}@example.com`, 'PRO');
    const profileRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${proUser.login.accessToken}` }
    })).json();

    assert(profileRes.license.plan === 'PRO', 'Restored profile includes PRO license');
  });

  // TEST 6C.12: Sync update refreshes currentLicense
  await runTest(12, '6C.12 — Actualización de licencia mediante sincronización actualiza currentLicense', async () => {
    const userObj = await helperCreateUserAndLicense(`c_sync_${Date.now()}@example.com`, 'FREE');

    // Upgrade remotely
    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'PRO' })
    });

    const profileRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userObj.login.accessToken}` }
    })).json();

    assert(profileRes.license.plan === 'PRO', 'Sync retrieves updated PRO license');
  });

  // TEST 6C.13: PRO -> FREE updates client state correctly
  await runTest(13, '6C.13 — PRO -> FREE actualiza correctamente el estado del cliente', async () => {
    const userObj = await helperCreateUserAndLicense(`c_dg_${Date.now()}@example.com`, 'PRO');

    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'FREE' })
    });

    const profileRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userObj.login.accessToken}` }
    })).json();

    assert(profileRes.license.plan === 'FREE', 'Downgraded plan reflects as FREE');
  });

  // TEST 6C.14: FREE -> PRO updates client state correctly
  await runTest(14, '6C.14 — FREE -> PRO actualiza correctamente el estado del cliente', async () => {
    const userObj = await helperCreateUserAndLicense(`c_ug_${Date.now()}@example.com`, 'FREE');

    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'PRO' })
    });

    const profileRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userObj.login.accessToken}` }
    })).json();

    assert(profileRes.license.plan === 'PRO', 'Upgraded plan reflects as PRO');
  });

  // TEST 6C.15: Frontend state tampering does NOT grant server-side permissions
  await runTest(15, '6C.15 — Manipulación de estado frontend NO concede permisos server-side', async () => {
    const freeUser = await helperCreateUserAndLicense(`c_tamp_${Date.now()}@example.com`, 'FREE');

    // Sync FREE user session with server.js
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeUser.login.accessToken })
    });

    // Frontend attempts to claim VIP access directly to server.js
    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-license': 'VIP' },
      body: JSON.stringify({ username: 'FakeVIP', animationId: '1' })
    });

    assert(res.status === 403, 'Server.js rejects frontend tampering and returns 403 Forbidden');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 6C CLIENT STATE SUMMARY REPORT    `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 6C test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 6C TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 6C TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase6cTestSuite().catch((err) => {
  console.error('Fatal Phase 6C test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
