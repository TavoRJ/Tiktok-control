const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase4d_test.db';
process.env.PORT = '4009';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4009';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase4d_test.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { startServer: startAuthServer } = require('../src/index');
const config = require('../src/config');
const deviceService = require('../src/services/deviceService');

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
    console.log(`RUNNING TEST 4D.${testNum}: [ ${testName} ]`);
    await fn();
    console.log(`RESULT: PASSED ✓`);
    results.push({ num: `4D.${testNum}`, name: testName, status: 'PASSED' });
  } catch (err) {
    console.error(`RESULT: FAILED ✗ - ${err.message}`);
    results.push({ num: `4D.${testNum}`, name: testName, status: 'FAILED', error: err.message });
  }
}

async function executePhase4dTestSuite() {
  console.log(`==================================================`);
  console.log(`    TAVLIVE PHASE 4D DEVICE CONTROL TEST SUITE     `);
  console.log(`==================================================`);

  const { server } = await startAuthServer();
  authServerInstance = server;
  const actualPort = server.address().port;
  authBaseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`--> Connected to Auth Server at ${authBaseUrl}`);

  // TEST 1: FREE plan limit (1 device allowed, 2nd rejected)
  await runTest(1, 'Plan FREE: 1er dispositivo permitido, 2do rechazado por límite (Max: 1)', async () => {
    const email = `free_dev_${Date.now()}@example.com`;
    const userRes = await fetch(`${authBaseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ email, name: 'Free User', password: 'Password123!' })
    });
    const user = (await userRes.json()).user;

    await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: user.id, plan: 'FREE' })
    });

    // 1st Device -> Allowed
    const d1 = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'FREE-PC-1' })
    });
    assert(d1.status === 200, '1st device on FREE allowed');

    // 2nd Device -> Rejected
    const d2 = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'FREE-PC-2' })
    });
    assert(d2.status === 500 || d2.status === 400, '2nd device on FREE rejected');
  });

  // TEST 2: PRO plan limit (2 devices allowed, 3rd rejected)
  await runTest(2, 'Plan PRO: 2 dispositivos permitidos, 3ro rechazado por límite (Max: 2)', async () => {
    const email = `pro_dev_${Date.now()}@example.com`;
    const user = (await (await fetch(`${authBaseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ email, name: 'PRO User', password: 'Password123!' })
    })).json()).user;

    await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: user.id, plan: 'PRO' })
    });

    const d1 = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'PRO-PC-1' })
    });
    assert(d1.status === 200, '1st device on PRO allowed');

    const d2 = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'PRO-PC-2' })
    });
    assert(d2.status === 200, '2nd device on PRO allowed');

    const d3 = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'PRO-PC-3' })
    });
    assert(d3.status === 500 || d3.status === 400, '3rd device on PRO rejected');
  });

  // TEST 3: VIP plan limit (5 devices allowed, 6th rejected)
  await runTest(3, 'Plan VIP: 5 dispositivos permitidos, 6to rechazado por límite (Max: 5)', async () => {
    const email = `vip_dev_${Date.now()}@example.com`;
    const user = (await (await fetch(`${authBaseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ email, name: 'VIP User', password: 'Password123!' })
    })).json()).user;

    await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: user.id, plan: 'VIP' })
    });

    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: `VIP-PC-${i}` })
      });
      assert(res.status === 200, `Device ${i} on VIP allowed`);
    }

    const d6 = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'VIP-PC-6' })
    });
    assert(d6.status === 500 || d6.status === 400, '6th device on VIP rejected');
  });

  // TEST 4: Re-authentication of existing authorized device does not consume new slot
  await runTest(4, 'Re-autenticación en el mismo equipo NO consume plaza adicional', async () => {
    const email = `reauth_dev_${Date.now()}@example.com`;
    const user = (await (await fetch(`${authBaseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ email, name: 'Reauth User', password: 'Password123!' })
    })).json()).user;

    await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: user.id, plan: 'FREE' })
    });

    // Login once
    await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'SAME-PC-1' })
    });

    // Login second time with same deviceIdentifier
    const res2 = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'SAME-PC-1' })
    });
    assert(res2.status === 200, 'Re-authenticating same device allowed seamlessly');
  });

  // TEST 5: Administrative device revocation frees up a device slot
  await runTest(5, 'Revocación administrativa de dispositivo libera una plaza', async () => {
    const email = `revoke_slot_${Date.now()}@example.com`;
    const user = (await (await fetch(`${authBaseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ email, name: 'Revoke Slot User', password: 'Password123!' })
    })).json()).user;

    await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: user.id, plan: 'FREE' })
    });

    // Device 1
    const d1Res = await (await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'OLD-PC-1' })
    })).json();

    // Revoke Old PC 1
    await fetch(`${authBaseUrl}/api/admin/devices/${d1Res.device.id}/revoke`, {
      method: 'POST',
      headers: { 'x-admin-key': config.ADMIN_API_KEY }
    });

    // Now registering NEW-PC-2 should succeed (slot freed)
    const d2Res = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'NEW-PC-2' })
    });
    assert(d2Res.status === 200, 'New device registered after old device revoked');
  });

  // TEST 6: Revoked device attempt rejected
  await runTest(6, 'Intento de login con dispositivo revocado es rechazado', async () => {
    const email = `rev_device_${Date.now()}@example.com`;
    const user = (await (await fetch(`${authBaseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ email, name: 'Revoked Device User', password: 'Password123!' })
    })).json()).user;

    await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: user.id, plan: 'PRO' })
    });

    const d1Res = await (await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'REVOKED-PC-1' })
    })).json();

    // Revoke device
    await fetch(`${authBaseUrl}/api/admin/devices/${d1Res.device.id}/revoke`, {
      method: 'POST',
      headers: { 'x-admin-key': config.ADMIN_API_KEY }
    });

    // Login attempt from revoked device
    const retryRes = await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'REVOKED-PC-1' })
    });
    assert(retryRes.status === 403 || retryRes.status === 500 || retryRes.status === 400, 'Revoked device login rejected');
  });

  // TEST 7: Admin endpoint GET /api/admin/devices/user/:userId lists all devices
  await runTest(7, 'Admin API: Listar todos los dispositivos de un usuario', async () => {
    const email = `list_dev_${Date.now()}@example.com`;
    const user = (await (await fetch(`${authBaseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ email, name: 'List Devices User', password: 'Password123!' })
    })).json()).user;

    await fetch(`${authBaseUrl}/api/admin/licenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
      body: JSON.stringify({ userId: user.id, plan: 'PRO' })
    });

    await fetch(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', deviceIdentifier: 'DEVICE-A' })
    });

    const listRes = await fetch(`${authBaseUrl}/api/admin/devices/user/${user.id}`, {
      headers: { 'x-admin-key': config.ADMIN_API_KEY }
    });
    const listData = await listRes.json();
    assert(listRes.status === 200, 'List devices status 200');
    assert(Array.isArray(listData.devices), 'Devices list returned');
    assert(listData.devices.length >= 1, 'At least 1 device listed');
  });

  console.log(`\n==================================================`);
  console.log(`   TAVLIVE PHASE 4D DEVICE CONTROL SUMMARY REPORT  `);
  console.log(`==================================================`);
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL TESTS EXECUTED: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${results.length - passedCount}`);

  server.close(() => {
    console.log(`\nPhase 4D test server shut down cleanly.`);
    if (passedCount === results.length) {
      console.log(`\nALL PHASE 4D TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME PHASE 4D TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executePhase4dTestSuite().catch((err) => {
  console.error('Fatal Phase 4D test execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
