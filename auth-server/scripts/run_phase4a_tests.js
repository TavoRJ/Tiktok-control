const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase4a_test.db';
process.env.PORT = '4006';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4006';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase4a_test.db');
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

async function runTest(testNum, testName, fn) {
  try {
    console.log(`\n--------------------------------------------------`);
    console.log(`RUNNING TEST 4A.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `4A.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `4A.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function executePhase4aTestSuite() {
  console.log(`==================================================`);
  console.log(`      TAVLIVE PHASE 4A PLAN MODEL TEST SUITE       `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  let testUserId = null;
  let testUserEmail = `phase4a_user_${Date.now()}@example.com`;

  // Create user with valid password
  const userRes = await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email: testUserEmail, name: 'Plan Model Tester', password: 'ValidPassword123!' })
  });
  const userData = await userRes.json();
  testUserId = userData.user.id;

  // TEST 1: Creation of FREE plan license defaults to max_devices: 1
  await runTest(1, 'Model: Licencia plan FREE asigna por defecto max_devices: 1', async () => {
    const res = await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: testUserId, plan: 'FREE' })
    });
    const data = await res.json();
    assert(res.status === 201, 'Status code 201 expected');
    assert(data.license.plan === 'FREE', 'Plan is FREE');
    assert(data.license.max_devices === 1, 'Max devices is 1 for FREE plan');
  });

  // TEST 2: Creation of PRO plan license defaults to max_devices: 2
  await runTest(2, 'Model: Licencia plan PRO asigna por defecto max_devices: 2', async () => {
    const user2Res = await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: testUserId, plan: 'PRO' })
    });
    // First update or create second user
    const user2 = await (await fetch(`${authBaseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ email: `pro_user_${Date.now()}@example.com`, name: 'PRO Tester', password: 'ValidPassword123!' })
    })).json();

    const res = await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: user2.user.id, plan: 'PRO' })
    });
    const data = await res.json();
    assert(res.status === 201, 'Status 201 expected');
    assert(data.license.plan === 'PRO', 'Plan is PRO');
    assert(data.license.max_devices === 2, 'Max devices is 2 for PRO plan');
  });

  // TEST 3: Creation of VIP plan license defaults to max_devices: 5
  await runTest(3, 'Model: Licencia plan VIP asigna por defecto max_devices: 5', async () => {
    const user3 = await (await fetch(`${authBaseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ email: `vip_user_${Date.now()}@example.com`, name: 'VIP Tester', password: 'ValidPassword123!' })
    })).json();

    const res = await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: user3.user.id, plan: 'VIP' })
    });
    const data = await res.json();
    assert(res.status === 201, 'Status 201 expected');
    assert(data.license.plan === 'VIP', 'Plan is VIP');
    assert(data.license.max_devices === 5, 'Max devices is 5 for VIP plan');
  });

  // TEST 4: Invalid plan name rejected with 400 Bad Request
  await runTest(4, 'Rechazo de plan no permitido (ej. SUPER_PRO)', async () => {
    const res = await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: testUserId, plan: 'INVALID_PLAN_NAME' })
    });
    assert(res.status === 400, '400 Bad Request expected for invalid plan name');
  });

  // TEST 5: Admin API can update plan from FREE to PRO
  await runTest(5, 'Admin API: Actualizar plan de FREE a PRO en base de datos remota', async () => {
    const license = licenseService.findByUserId(testUserId);
    const res = await fetch(`${authBaseUrl}/api/admin/licenses/${license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'PRO' })
    });
    const data = await res.json();
    assert(res.status === 200, 'Status 200 expected');
    assert(data.license.plan === 'PRO', 'Plan updated to PRO');
    assert(data.license.max_devices === 2, 'Max devices updated to 2');
  });

  console.log(`\n==================================================`);
  console.log(`       PHASE 4A PLAN MODEL SUMMARY REPORT         `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 4A test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 4A TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 4A TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase4aTestSuite().catch((err) => {
  console.error('Fatal Phase 4A test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
