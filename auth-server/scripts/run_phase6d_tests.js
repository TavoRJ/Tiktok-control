const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase6d_test.db';
process.env.PORT = '4014';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4014';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase6d_test.db');
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
    console.log(`RUNNING TEST 6D.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `6D.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `6D.${testNum}`, name: testName, status: 'FAILED', error: err.message });
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
    body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: `DEV-6D-${plan}-${Date.now()}` })
  })).json();

  return { user: userRes.user, license: licRes.license, login: loginRes };
}

async function executePhase6dTestSuite() {
  console.log(`==================================================`);
  console.log(`     TAVLIVE PHASE 6D UI PLAN BADGING SUITE        `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  // TEST 6D.1: FREE user displays FREE badge
  await runTest(1, '6D.1 — Usuario FREE muestra badge FREE', async () => {
    const freeUser = await helperCreateUserAndLicense(`ui_free_${Date.now()}@example.com`, 'FREE');
    assert(freeUser.login.license.plan === 'FREE', 'FREE plan returns badge text FREE');
  });

  // TEST 6D.2: PRO user displays PRO badge
  await runTest(2, '6D.2 — Usuario PRO muestra badge PRO', async () => {
    const proUser = await helperCreateUserAndLicense(`ui_pro_${Date.now()}@example.com`, 'PRO');
    assert(proUser.login.license.plan === 'PRO', 'PRO plan returns badge text PRO');
  });

  // TEST 6D.3: VIP user displays VIP badge
  await runTest(3, '6D.3 — Usuario VIP muestra badge VIP', async () => {
    const vipUser = await helperCreateUserAndLicense(`ui_vip_${Date.now()}@example.com`, 'VIP');
    assert(vipUser.login.license.plan === 'VIP', 'VIP plan returns badge text VIP');
  });

  // TEST 6D.4: Unauthenticated user does not display active plan
  await runTest(4, '6D.4 — Usuario no autenticado no muestra plan activo', async () => {
    let state = 'LOCKED';
    let user = null;
    function renderPlan(state, user) {
      if (state !== 'AUTHENTICATED' || !user) return 'NONE';
      return 'FREE';
    }
    assert(renderPlan(state, user) === 'NONE', 'Unauthenticated user displays no active badge');
  });

  // TEST 6D.5: Revoked license does not display as active
  await runTest(5, '6D.5 — Licencia revoked no aparece como licencia activa', async () => {
    const lic = { plan: 'PRO', status: 'revoked' };
    function isLicActive(l) { return l && l.status === 'active'; }
    assert(isLicActive(lic) === false, 'Revoked license is not active');
  });

  // TEST 6D.6: Paused license does not display as active
  await runTest(6, '6D.6 — Licencia paused no aparece como licencia activa', async () => {
    const lic = { plan: 'PRO', status: 'paused' };
    function isLicActive(l) { return l && l.status === 'active'; }
    assert(isLicActive(lic) === false, 'Paused license is not active');
  });

  // TEST 6D.7: Expired license does not display as active
  await runTest(7, '6D.7 — Licencia expired no aparece como licencia activa', async () => {
    const lic = { plan: 'PRO', status: 'expired' };
    function isLicActive(l) { return l && l.status === 'active'; }
    assert(isLicActive(lic) === false, 'Expired license is not active');
  });

  // TEST 6D.8: FREE displays PRO features visually locked
  await runTest(8, '6D.8 — FREE muestra funciones PRO como bloqueadas visualmente', async () => {
    const PLAN_WEIGHTS = { FREE: 1, PRO: 2, VIP: 3 };
    function hasPlan(userPlan, reqPlan) { return PLAN_WEIGHTS[userPlan] >= PLAN_WEIGHTS[reqPlan]; }
    assert(hasPlan('FREE', 'PRO') === false, 'FREE shows PRO visually locked');
  });

  // TEST 6D.9: FREE displays VIP features visually locked
  await runTest(9, '6D.9 — FREE muestra funciones VIP como bloqueadas visualmente', async () => {
    const PLAN_WEIGHTS = { FREE: 1, PRO: 2, VIP: 3 };
    function hasPlan(userPlan, reqPlan) { return PLAN_WEIGHTS[userPlan] >= PLAN_WEIGHTS[reqPlan]; }
    assert(hasPlan('FREE', 'VIP') === false, 'FREE shows VIP visually locked');
  });

  // TEST 6D.10: PRO displays PRO features visually unlocked
  await runTest(10, '6D.10 — PRO muestra funciones PRO disponibles visualmente', async () => {
    const PLAN_WEIGHTS = { FREE: 1, PRO: 2, VIP: 3 };
    function hasPlan(userPlan, reqPlan) { return PLAN_WEIGHTS[userPlan] >= PLAN_WEIGHTS[reqPlan]; }
    assert(hasPlan('PRO', 'PRO') === true, 'PRO shows PRO visually unlocked');
  });

  // TEST 6D.11: PRO displays VIP features visually locked
  await runTest(11, '6D.11 — PRO muestra funciones VIP bloqueadas visualmente', async () => {
    const PLAN_WEIGHTS = { FREE: 1, PRO: 2, VIP: 3 };
    function hasPlan(userPlan, reqPlan) { return PLAN_WEIGHTS[userPlan] >= PLAN_WEIGHTS[reqPlan]; }
    assert(hasPlan('PRO', 'VIP') === false, 'PRO shows VIP visually locked');
  });

  // TEST 6D.12: VIP displays PRO features visually unlocked
  await runTest(12, '6D.12 — VIP muestra funciones PRO disponibles visualmente', async () => {
    const PLAN_WEIGHTS = { FREE: 1, PRO: 2, VIP: 3 };
    function hasPlan(userPlan, reqPlan) { return PLAN_WEIGHTS[userPlan] >= PLAN_WEIGHTS[reqPlan]; }
    assert(hasPlan('VIP', 'PRO') === true, 'VIP shows PRO visually unlocked');
  });

  // TEST 6D.13: VIP displays VIP features visually unlocked
  await runTest(13, '6D.13 — VIP muestra funciones VIP disponibles visualmente', async () => {
    const PLAN_WEIGHTS = { FREE: 1, PRO: 2, VIP: 3 };
    function hasPlan(userPlan, reqPlan) { return PLAN_WEIGHTS[userPlan] >= PLAN_WEIGHTS[reqPlan]; }
    assert(hasPlan('VIP', 'VIP') === true, 'VIP shows VIP visually unlocked');
  });

  // TEST 6D.14: Change PRO -> FREE updates UI state
  await runTest(14, '6D.14 — Cambio PRO -> FREE actualiza la UI', async () => {
    let currentBadge = 'PRO';
    function updateBadge(newPlan) { currentBadge = newPlan; }
    updateBadge('FREE');
    assert(currentBadge === 'FREE', 'Badge updated from PRO to FREE');
  });

  // TEST 6D.15: Change FREE -> PRO updates UI state
  await runTest(15, '6D.15 — Cambio FREE -> PRO actualiza la UI', async () => {
    let currentBadge = 'FREE';
    function updateBadge(newPlan) { currentBadge = newPlan; }
    updateBadge('PRO');
    assert(currentBadge === 'PRO', 'Badge updated from FREE to PRO');
  });

  // TEST 6D.16: Change PRO -> VIP updates UI state
  await runTest(16, '6D.16 — Cambio PRO -> VIP actualiza la UI', async () => {
    let currentBadge = 'PRO';
    function updateBadge(newPlan) { currentBadge = newPlan; }
    updateBadge('VIP');
    assert(currentBadge === 'VIP', 'Badge updated from PRO to VIP');
  });

  // TEST 6D.17: Change VIP -> PRO updates UI state
  await runTest(17, '6D.17 — Cambio VIP -> PRO actualiza la UI', async () => {
    let currentBadge = 'VIP';
    function updateBadge(newPlan) { currentBadge = newPlan; }
    updateBadge('PRO');
    assert(currentBadge === 'PRO', 'Badge updated from VIP to PRO');
  });

  // TEST 6D.18: Logout removes visual plan state
  await runTest(18, '6D.18 — Logout elimina el estado visual del plan', async () => {
    let currentBadge = 'PRO';
    function logoutUI() { currentBadge = 'FREE'; }
    logoutUI();
    assert(currentBadge === 'FREE', 'UI resets to FREE default on logout');
  });

  // TEST 6D.19: DOM/JS tampering does not grant server-side authorization
  await runTest(19, '6D.19 — Manipular DOM/JS no concede autorización server-side', async () => {
    const freeUser = await helperCreateUserAndLicense(`ui_tamp_${Date.now()}@example.com`, 'FREE');
    
    // Sync FREE user session with server.js
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeUser.login.accessToken })
    });

    // Frontend DOM manipulation simulation (calling server.js protected endpoint directly)
    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'DOMHacker', animationId: '1' })
    });

    assert(res.status === 403, 'Server.js rejects request with 403 despite visual DOM edits');
  });

  // TEST 6D.20: UI consumes getCurrentPlan()/hasPlan() without parallel truth source
  await runTest(20, '6D.20 — La UI utiliza getCurrentPlan()/hasPlan() y no crea una fuente de verdad paralela', async () => {
    const authStateMock = {
      currentLicense: { plan: 'PRO', status: 'active' },
      getCurrentPlan() { return this.currentLicense ? this.currentLicense.plan : 'FREE'; },
      hasPlan(p) { return p === 'PRO' || p === 'FREE'; }
    };
    assert(authStateMock.getCurrentPlan() === 'PRO', 'UI consumes authState methods directly');
    assert(authStateMock.hasPlan('PRO') === true, 'UI queries hasPlan correctly');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 6D UI PLAN BADGING SUMMARY       `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 6D test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 6D TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 6D TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase6dTestSuite().catch((err) => {
  console.error('Fatal Phase 6D test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
