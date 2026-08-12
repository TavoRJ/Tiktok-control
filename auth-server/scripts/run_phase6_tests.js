const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase6_test.db';
process.env.PORT = '4012';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4012';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase6_test.db');
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
    console.log(`RUNNING TEST 6.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `6.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `6.${testNum}`, name: testName, status: 'FAILED', error: err.message });
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
    body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: `DEV-${plan}-${Date.now()}` })
  })).json();

  return { user: userRes.user, license: licRes.license, login: loginRes };
}

async function helperSyncLocalServer(accessToken) {
  const res = await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken })
  });
  return res.json();
}

async function executePhase6TestSuite() {
  console.log(`==================================================`);
  console.log(`     TAVLIVE PHASE 6 FEATURE GATING SUITE         `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  // TEST 6.1: FREE user accesses FREE endpoint
  await runTest(1, '6.1 — FREE: endpoint FREE accesible (HTTP 200)', async () => {
    const freeUser = await helperCreateUserAndLicense(`free_${Date.now()}@example.com`, 'FREE');
    await helperSyncLocalServer(freeUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/get-gifts`);
    assert(res.status === 200, 'Free endpoint responds 200 OK for FREE user');
  });

  // TEST 6.2: FREE user rejected from PRO endpoint (HTTP 403)
  await runTest(2, '6.2 — FREE: endpoint PRO rechazado con HTTP 403 Forbidden', async () => {
    const freeUser = await helperCreateUserAndLicense(`free2_${Date.now()}@example.com`, 'FREE');
    await helperSyncLocalServer(freeUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Anim', filename: 'anim.gif', fileData: 'dGVzdA==' })
    });
    const data = await res.json();
    assert(res.status === 403, 'PRO endpoint returns 403 for FREE user');
    assert(data.error === 'PLAN_UPGRADE_REQUIRED', 'Error code PLAN_UPGRADE_REQUIRED');
  });

  // TEST 6.3: FREE user rejected from VIP endpoint (HTTP 403)
  await runTest(3, '6.3 — FREE: endpoint VIP rechazado con HTTP 403 Forbidden', async () => {
    const freeUser = await helperCreateUserAndLicense(`free3_${Date.now()}@example.com`, 'FREE');
    await helperSyncLocalServer(freeUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'VIPUser', animationId: '1' })
    });
    const data = await res.json();
    assert(res.status === 403, 'VIP endpoint returns 403 for FREE user');
    assert(data.error === 'PLAN_UPGRADE_REQUIRED', 'Error code PLAN_UPGRADE_REQUIRED');
  });

  // TEST 6.4: PRO user accesses FREE endpoint
  await runTest(4, '6.4 — PRO: endpoint FREE accesible (HTTP 200)', async () => {
    const proUser = await helperCreateUserAndLicense(`pro_${Date.now()}@example.com`, 'PRO');
    await helperSyncLocalServer(proUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/get-gifts`);
    assert(res.status === 200, 'Free endpoint responds 200 OK for PRO user');
  });

  // TEST 6.5: PRO user accesses PRO endpoint
  await runTest(5, '6.5 — PRO: endpoint PRO accesible (HTTP 200 / valid schema)', async () => {
    const proUser = await helperCreateUserAndLicense(`pro2_${Date.now()}@example.com`, 'PRO');
    await helperSyncLocalServer(proUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ProAnim', filename: 'pro.png', fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
    });
    assert(res.status === 200, 'PRO endpoint responds 200 OK for PRO user');
  });

  // TEST 6.6: PRO user rejected from VIP endpoint (HTTP 403)
  await runTest(6, '6.6 — PRO: endpoint VIP rechazado con HTTP 403 Forbidden', async () => {
    const proUser = await helperCreateUserAndLicense(`pro3_${Date.now()}@example.com`, 'PRO');
    await helperSyncLocalServer(proUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'MvpUser', animationId: '1' })
    });
    const data = await res.json();
    assert(res.status === 403, 'VIP endpoint returns 403 for PRO user');
    assert(data.error === 'PLAN_UPGRADE_REQUIRED', 'Error code PLAN_UPGRADE_REQUIRED');
  });

  // TEST 6.7: VIP user accesses FREE endpoint
  await runTest(7, '6.7 — VIP: endpoint FREE accesible (HTTP 200)', async () => {
    const vipUser = await helperCreateUserAndLicense(`vip_${Date.now()}@example.com`, 'VIP');
    await helperSyncLocalServer(vipUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/get-gifts`);
    assert(res.status === 200, 'Free endpoint responds 200 OK for VIP user');
  });

  // TEST 6.8: VIP user accesses PRO endpoint
  await runTest(8, '6.8 — VIP: endpoint PRO accesible (HTTP 200 / valid schema)', async () => {
    const vipUser = await helperCreateUserAndLicense(`vip2_${Date.now()}@example.com`, 'VIP');
    await helperSyncLocalServer(vipUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'VipProAnim', filename: 'vippro.png', fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
    });
    assert(res.status === 200, 'PRO endpoint responds 200 OK for VIP user');
  });

  // TEST 6.9: VIP user accesses VIP endpoint
  await runTest(9, '6.9 — VIP: endpoint VIP accesible (HTTP 200)', async () => {
    const vipUser = await helperCreateUserAndLicense(`vip3_${Date.now()}@example.com`, 'VIP');
    await helperSyncLocalServer(vipUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'VipFan', animationId: '1' })
    });
    assert(res.status === 200, 'VIP endpoint responds 200 OK for VIP user');
  });

  // TEST 6.10: Unauthenticated request to protected endpoint returns HTTP 401
  await runTest(10, '6.10 — Petición no autenticada en endpoint protegido retorna HTTP 401', async () => {
    await fetch(`${localBaseUrl}/api/internal/clear-auth-session`, { method: 'POST' });

    const res = await fetch(`${localBaseUrl}/api/upload-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.mp3', fileData: 'dGVzdA==' })
    });
    const data = await res.json();
    assert(res.status === 401, 'Unauthenticated request returns HTTP 401');
    assert(data.error === 'UNAUTHORIZED', 'Error code UNAUTHORIZED');
  });

  // TEST 6.11: Authenticated user with insufficient plan returns HTTP 403
  await runTest(11, '6.11 — Petición autenticada con plan insuficiente retorna HTTP 403', async () => {
    const freeUser = await helperCreateUserAndLicense(`insuf_${Date.now()}@example.com`, 'FREE');
    await helperSyncLocalServer(freeUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/upload-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.mp3', fileData: 'dGVzdA==' })
    });
    assert(res.status === 403, 'Insufficient plan returns 403 Forbidden');
  });

  // TEST 6.12: EXPIRED license rejects protected endpoints (HTTP 403)
  await runTest(12, '6.12 — Licencia EXPIRED rechaza llamadas a endpoints protegidos (HTTP 403)', async () => {
    const expUser = await helperCreateUserAndLicense(`exp_${Date.now()}@example.com`, 'PRO', 'active');
    await helperSyncLocalServer(expUser.login.accessToken);

    // Update license remotely to expired
    await fetch(`${authBaseUrl}/api/admin/licenses/${expUser.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'expired' })
    });
    await helperSyncLocalServer(expUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/upload-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.mp3', fileData: 'dGVzdA==' })
    });
    assert(res.status === 403, 'Expired license returns 403 Forbidden');
  });

  // TEST 6.13: REVOKED license rejects protected endpoints (HTTP 403)
  await runTest(13, '6.13 — Licencia REVOKED rechaza llamadas a endpoints protegidos (HTTP 403)', async () => {
    const revUser = await helperCreateUserAndLicense(`rev_${Date.now()}@example.com`, 'PRO', 'active');
    await helperSyncLocalServer(revUser.login.accessToken);

    // Update license remotely to revoked
    await fetch(`${authBaseUrl}/api/admin/licenses/${revUser.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'revoked' })
    });
    await helperSyncLocalServer(revUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/upload-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.mp3', fileData: 'dGVzdA==' })
    });
    assert(res.status === 403, 'Revoked license returns 403 Forbidden');
  });

  // TEST 6.14: PAUSED license rejects protected endpoints (HTTP 403)
  await runTest(14, '6.14 — Licencia PAUSED rechaza llamadas a endpoints protegidos (HTTP 403)', async () => {
    const pauUser = await helperCreateUserAndLicense(`pau_${Date.now()}@example.com`, 'PRO', 'active');
    await helperSyncLocalServer(pauUser.login.accessToken);

    // Update license remotely to paused
    await fetch(`${authBaseUrl}/api/admin/licenses/${pauUser.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'paused' })
    });
    await helperSyncLocalServer(pauUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/upload-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.mp3', fileData: 'dGVzdA==' })
    });
    assert(res.status === 403, 'Paused license returns 403 Forbidden');
  });

  // TEST 6.15: SUSPENDED user rejects protected endpoints (HTTP 403)
  await runTest(15, '6.15 — Usuario SUSPENDED rechaza acceso a endpoints protegidos (HTTP 403)', async () => {
    const proUser = await helperCreateUserAndLicense(`susp_${Date.now()}@example.com`, 'PRO');
    await fetch(`${authBaseUrl}/api/admin/users/${proUser.user.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'suspended' })
    });

    await helperSyncLocalServer(proUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/upload-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.mp3', fileData: 'dGVzdA==' })
    });
    assert(res.status === 401 || res.status === 403, 'Suspended user blocked from protected endpoint');
  });

  // TEST 6.16: BANNED user rejects protected endpoints (HTTP 403)
  await runTest(16, '6.16 — Usuario BANNED rechaza acceso a endpoints protegidos (HTTP 403)', async () => {
    const proUser = await helperCreateUserAndLicense(`ban_${Date.now()}@example.com`, 'PRO');
    await fetch(`${authBaseUrl}/api/admin/users/${proUser.user.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'banned' })
    });

    await helperSyncLocalServer(proUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/upload-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.mp3', fileData: 'dGVzdA==' })
    });
    assert(res.status === 401 || res.status === 403, 'Banned user blocked from protected endpoint');
  });

  // TEST 6.17: Past expires_at date rejects protected endpoints (HTTP 403)
  await runTest(17, '6.17 — expires_at vencido rechaza acceso a funciones protegidas (HTTP 403)', async () => {
    const expUser = await helperCreateUserAndLicense(`expdate_${Date.now()}@example.com`, 'PRO', 'active');
    await helperSyncLocalServer(expUser.login.accessToken);

    // Update expiresAt date remotely to past date
    const pastDate = new Date(Date.now() - 5000).toISOString();
    await fetch(`${authBaseUrl}/api/admin/licenses/${expUser.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: pastDate })
    });
    await helperSyncLocalServer(expUser.login.accessToken);

    const res = await fetch(`${localBaseUrl}/api/upload-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.mp3', fileData: 'dGVzdA==' })
    });
    assert(res.status === 403, 'Past expires_at date returns 403 Forbidden');
  });

  // TEST 6.18: Remote downgrade PRO -> FREE updates permissions after sync
  await runTest(18, '6.18 — Cambio remoto PRO -> FREE actualiza permisos en cliente tras sync', async () => {
    const userObj = await helperCreateUserAndLicense(`downgrade_${Date.now()}@example.com`, 'PRO');
    await helperSyncLocalServer(userObj.login.accessToken);

    // Initial PRO access works
    let res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'BeforeDG', filename: 'before.png', fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
    });
    assert(res.status === 200, 'Initial PRO access succeeds');

    // Downgrade license remotely to FREE
    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'FREE' })
    });

    // Sync session again (simulates Heartbeat sync)
    await helperSyncLocalServer(userObj.login.accessToken);

    // Now PRO access is rejected
    res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'AfterDG', filename: 'after.png', fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
    });
    assert(res.status === 403, 'Post-downgrade access rejected with 403');
  });

  // TEST 6.19: Remote upgrade FREE -> PRO unlocks PRO endpoints after sync
  await runTest(19, '6.19 — Cambio remoto FREE -> PRO desbloquea endpoints PRO tras sync', async () => {
    const userObj = await helperCreateUserAndLicense(`upgrade_${Date.now()}@example.com`, 'FREE');
    await helperSyncLocalServer(userObj.login.accessToken);

    // Initial PRO access fails
    let res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'BeforeUG', filename: 'before.png', fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
    });
    assert(res.status === 403, 'Initial FREE access to PRO endpoint fails');

    // Upgrade license remotely to PRO
    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'PRO' })
    });

    // Sync session
    await helperSyncLocalServer(userObj.login.accessToken);

    // Now PRO access succeeds
    res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'AfterUG', filename: 'after.png', fileData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
    });
    assert(res.status === 200, 'Post-upgrade access succeeds with 200');
  });

  // TEST 6.20: Frontend request tampering cannot bypass requirePlan in server.js
  await runTest(20, '6.20 — Manipular frontend/DOM/localStorage no permite bypass de requirePlan en server.js', async () => {
    const freeUser = await helperCreateUserAndLicense(`tamper_${Date.now()}@example.com`, 'FREE');
    await helperSyncLocalServer(freeUser.login.accessToken);

    // Direct HTTP fetch trying to spoof plan parameter in body or headers
    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-plan': 'VIP' },
      body: JSON.stringify({ username: 'Hacker', animationId: '1', plan: 'VIP' })
    });

    assert(res.status === 403, 'Server.js ignores frontend header/body plan spoofing and returns 403');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 6 FEATURE GATING SUMMARY REPORT   `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 6 test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 6 TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 6 TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase6TestSuite().catch((err) => {
  console.error('Fatal Phase 6 test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
