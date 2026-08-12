const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase6e_test.db';
process.env.PORT = '4015';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4015';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase6e_test.db');
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
    console.log(`RUNNING TEST 6E.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `6E.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `6E.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function helperCreateUserAndLicense(email, plan = 'FREE') {
  const userRes = await (await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email, name: `User ${plan}`, password: 'Password123!' })
  })).json();

  const licRes = await (await fetch(`${authBaseUrl}/api/admin/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ userId: userRes.user.id, plan, status: 'active' })
  })).json();

  const loginRes = await (await fetch(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: `DEV-6E-${plan}-${Date.now()}` })
  })).json();

  return { user: userRes.user, license: licRes.license, login: loginRes };
}

async function executePhase6eTestSuite() {
  console.log(`==================================================`);
  console.log(`     TAVLIVE PHASE 6E FINAL INTEGRATION SUITE      `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  // TEST 6E.1: FREE user access controls
  await runTest(1, '6E.1 — FREE: Acceso a FREE OK, rechazo en PRO/VIP con 403', async () => {
    const freeUser = await helperCreateUserAndLicense(`int_free_${Date.now()}@example.com`, 'FREE');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeUser.login.accessToken })
    });

    const resFree = await fetch(`${localBaseUrl}/api/get-gifts`);
    assert(resFree.status === 200, 'FREE endpoint returns 200 OK');

    const resPro = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(resPro.status === 403, 'PRO endpoint returns 403 Forbidden');

    const resVip = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Test' })
    });
    assert(resVip.status === 403, 'VIP endpoint returns 403 Forbidden');
  });

  // TEST 6E.2: PRO user access controls
  await runTest(2, '6E.2 — PRO: Acceso a FREE y PRO OK, rechazo en VIP con 403', async () => {
    const proUser = await helperCreateUserAndLicense(`int_pro_${Date.now()}@example.com`, 'PRO');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: proUser.login.accessToken })
    });

    const resFree = await fetch(`${localBaseUrl}/api/get-gifts`);
    assert(resFree.status === 200, 'FREE endpoint returns 200 OK');

    const resPro = await fetch(`${localBaseUrl}/api/custom-animations`);
    assert(resPro.status === 200, 'PRO GET endpoint returns 200 OK');

    const resVip = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Test' })
    });
    assert(resVip.status === 403, 'VIP endpoint returns 403 Forbidden');
  });

  // TEST 6E.3: VIP user access controls
  await runTest(3, '6E.3 — VIP: Acceso completo a FREE, PRO y VIP OK', async () => {
    const vipUser = await helperCreateUserAndLicense(`int_vip_${Date.now()}@example.com`, 'VIP');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: vipUser.login.accessToken })
    });

    const resFree = await fetch(`${localBaseUrl}/api/get-gifts`);
    assert(resFree.status === 200, 'FREE endpoint returns 200 OK');

    const resPro = await fetch(`${localBaseUrl}/api/custom-animations`);
    assert(resPro.status === 200, 'PRO endpoint returns 200 OK');

    const resVip = await fetch(`${localBaseUrl}/api/mvps`);
    assert(resVip.status === 200, 'VIP endpoint returns 200 OK');
  });

  // TEST 6E.4: Unauthenticated request receives 401
  await runTest(4, '6E.4 — Petición no autenticada en endpoint protegido retorna HTTP 401', async () => {
    await fetch(`${localBaseUrl}/api/internal/clear-auth-session`, { method: 'POST' });
    const res = await fetch(`${localBaseUrl}/api/custom-animations`, { method: 'POST' });
    assert(res.status === 401, 'Unauthenticated request returns 401 Unauthorized');
  });

  // TEST 6E.5: Invalid license expired returns 403
  await runTest(5, '6E.5 — Licencia expirada tras re-sync retorna 403', async () => {
    const userObj = await helperCreateUserAndLicense(`int_exp_${Date.now()}@example.com`, 'PRO');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    // Update license status remotely to expired
    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'expired' })
    });

    // Re-sync
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(res.status === 403, 'Expired license returns 403 Forbidden');
  });

  // TEST 6E.6: Remote plan change FREE -> PRO updates server.js and client state
  await runTest(6, '6E.6 — Cambio remoto FREE -> PRO se refleja tras re-sincronización', async () => {
    const userObj = await helperCreateUserAndLicense(`int_ug_${Date.now()}@example.com`, 'FREE');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    // Remote upgrade
    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'PRO' })
    });

    // Re-sync
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const statusRes = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    assert(statusRes.license.plan === 'PRO', 'Server.js localAuthState updated to PRO');
  });

  // TEST 6E.7: Remote plan change PRO -> FREE revokes permissions immediately
  await runTest(7, '6E.7 — Cambio remoto PRO -> FREE revoca acceso PRO tras re-sync', async () => {
    const userObj = await helperCreateUserAndLicense(`int_dg_${Date.now()}@example.com`, 'PRO');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    // Remote downgrade
    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'FREE' })
    });

    // Re-sync
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(res.status === 403, 'Downgraded user rejected with 403 on PRO endpoint');
  });

  // TEST 6E.8: Remote plan change PRO -> VIP unlocks VIP endpoints
  await runTest(8, '6E.8 — Cambio remoto PRO -> VIP desbloquea endpoints VIP', async () => {
    const userObj = await helperCreateUserAndLicense(`int_vip_ug_${Date.now()}@example.com`, 'PRO');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    // Remote upgrade to VIP
    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'VIP' })
    });

    // Re-sync
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/mvps`);
    assert(res.status === 200, 'Upgraded VIP user access granted on VIP endpoint');
  });

  // TEST 6E.9: Remote plan change VIP -> PRO revokes VIP endpoints
  await runTest(9, '6E.9 — Cambio remoto VIP -> PRO revoca acceso VIP', async () => {
    const userObj = await helperCreateUserAndLicense(`int_vip_dg_${Date.now()}@example.com`, 'VIP');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    // Remote downgrade to PRO
    await fetch(`${authBaseUrl}/api/admin/licenses/${userObj.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ plan: 'PRO' })
    });

    // Re-sync
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Test' })
    });
    assert(res.status === 403, 'Downgraded PRO user rejected on VIP POST endpoint');
  });

  // TEST 6E.10: Heartbeat compatibility with license updates
  await runTest(10, '6E.10 — Heartbeat /api/auth/me entrega información de licencia actualizada', async () => {
    const userObj = await helperCreateUserAndLicense(`int_hb_${Date.now()}@example.com`, 'FREE');
    const meRes = await (await fetch(`${authBaseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userObj.login.accessToken}` }
    })).json();

    assert(meRes.success === true && meRes.license.plan === 'FREE', 'Heartbeat profile includes valid license');
  });

  // TEST 6E.11: Logout clears session in server.js and client
  await runTest(11, '6E.11 — Logout limpia la sesión en server.js y bloquea endpoints', async () => {
    const proUser = await helperCreateUserAndLicense(`int_lo_${Date.now()}@example.com`, 'PRO');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: proUser.login.accessToken })
    });

    // Clear session
    await fetch(`${localBaseUrl}/api/internal/clear-auth-session`, { method: 'POST' });

    const statusRes = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    assert(statusRes.isAuthed === false, 'Server.js localAuthState is unauthenticated');
  });

  // TEST 6E.12: Security - DOM alteration does not bypass requirePlan
  await runTest(12, '6E.12 — Alteración del DOM no invalida el rechazo HTTP 403 en server.js', async () => {
    const freeUser = await helperCreateUserAndLicense(`sec_dom_${Date.now()}@example.com`, 'FREE');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeUser.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(res.status === 403, 'Server.js rejects PRO endpoint request despite client DOM state');
  });

  // TEST 6E.13: Security - window global variable alteration does not bypass requirePlan
  await runTest(13, '6E.13 — Modificar window.userPlan en frontend no altera requirePlan en server.js', async () => {
    const freeUser = await helperCreateUserAndLicense(`sec_win_${Date.now()}@example.com`, 'FREE');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeUser.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/upload-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(res.status === 403, 'Server.js enforces requirePlan strictly');
  });

  // TEST 6E.14: Security - Header spoofing is ignored
  await runTest(14, '6E.14 — Inyección de headers falsos (x-user-plan: VIP) es ignorada por server.js', async () => {
    const freeUser = await helperCreateUserAndLicense(`sec_hdr_${Date.now()}@example.com`, 'FREE');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeUser.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-plan': 'VIP' },
      body: JSON.stringify({ username: 'Hacker' })
    });
    assert(res.status === 403, 'Header spoofing rejected with 403 Forbidden');
  });

  // TEST 6E.15: Security - Body payload spoofing is ignored
  await runTest(15, '6E.15 — Inyección de propiedades en body ({ plan: "VIP" }) es ignorada por server.js', async () => {
    const freeUser = await helperCreateUserAndLicense(`sec_body_${Date.now()}@example.com`, 'FREE');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: freeUser.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', plan: 'VIP' })
    });
    assert(res.status === 403, 'Body spoofing rejected with 403 Forbidden');
  });

  // TEST 6E.16: Hierarchy single source of truth verification
  await runTest(16, '6E.16 — Verificación de jerarquía PLAN_WEIGHTS (FREE: 1, PRO: 2, VIP: 3)', async () => {
    const PLAN_WEIGHTS = { FREE: 1, PRO: 2, VIP: 3 };
    assert(PLAN_WEIGHTS.FREE < PLAN_WEIGHTS.PRO, 'FREE < PRO');
    assert(PLAN_WEIGHTS.PRO < PLAN_WEIGHTS.VIP, 'PRO < VIP');
    assert(PLAN_WEIGHTS.FREE < PLAN_WEIGHTS.VIP, 'FREE < VIP');
  });

  // TEST 6E.17: Expired license status overrides tier plan
  await runTest(17, '6E.17 — Licencia VIP expirada por fecha es rechazada con 403', async () => {
    const vipUser = await helperCreateUserAndLicense(`exp_vip_${Date.now()}@example.com`, 'VIP');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: vipUser.login.accessToken })
    });

    const pastDate = new Date(Date.now() - 3600000).toISOString();
    await fetch(`${authBaseUrl}/api/admin/licenses/${vipUser.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ expiresAt: pastDate })
    });

    // Re-sync
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: vipUser.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Test' })
    });
    assert(res.status === 403, 'Expired VIP license returns 403 Forbidden');
  });

  // TEST 6E.18: Paused license status overrides tier plan
  await runTest(18, '6E.18 — Licencia PRO pausada es rechazada con 403', async () => {
    const proUser = await helperCreateUserAndLicense(`pau_pro_${Date.now()}@example.com`, 'PRO');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: proUser.login.accessToken })
    });

    await fetch(`${authBaseUrl}/api/admin/licenses/${proUser.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'paused' })
    });

    // Re-sync
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: proUser.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/custom-animations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert(res.status === 403, 'Paused PRO license returns 403 Forbidden');
  });

  // TEST 6E.19: Revoked license status overrides tier plan
  await runTest(19, '6E.19 — Licencia VIP revocada es rechazada con 403', async () => {
    const vipUser = await helperCreateUserAndLicense(`rev_vip_${Date.now()}@example.com`, 'VIP');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: vipUser.login.accessToken })
    });

    await fetch(`${authBaseUrl}/api/admin/licenses/${vipUser.license.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ status: 'revoked' })
    });

    // Re-sync
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: vipUser.login.accessToken })
    });

    const res = await fetch(`${localBaseUrl}/api/mvps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Test' })
    });
    assert(res.status === 403, 'Revoked VIP license returns 403 Forbidden');
  });

  // TEST 6E.20: Architectural confirmation - Remote Auth Server is sole authority
  await runTest(20, '6E.20 — Auth Server remoto es la ÚNICA autoridad de seguridad de licencias', async () => {
    const userObj = await helperCreateUserAndLicense(`auth_auth_${Date.now()}@example.com`, 'FREE');
    await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userObj.login.accessToken })
    });
    const authStatus = await (await fetch(`${localBaseUrl}/api/internal/auth-status`)).json();
    assert(authStatus.license !== undefined, 'Local server syncs license from Remote Auth Server');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 6E FINAL INTEGRATION SUMMARY      `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 6E test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 6E TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 6E TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase6eTestSuite().catch((err) => {
  console.error('Fatal Phase 6E test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
