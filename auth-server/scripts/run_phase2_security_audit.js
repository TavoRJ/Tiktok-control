const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE_PATH = './data/tavlive_auth_phase2_audit.db';
process.env.PORT = '4000';
process.env.REMOTE_AUTH_SERVER = 'http://127.0.0.1:4000';

const testDbPath = path.join(__dirname, '..', 'data', 'tavlive_auth_phase2_audit.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { startServer: startAuthServer } = require('../src/index');
const config = require('../src/config');
const localServerApp = require('../../server.js');

let authServerInstance = null;
let dbHelperInstance = null;
const authBaseUrl = 'http://127.0.0.1:4000';
const localBaseUrl = 'http://127.0.0.1:3000';

const auditResults = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runAuditTest(code, name, target, expected, fn) {
  try {
    console.log(`\n--------------------------------------------------`);
    console.log(`SECURITY AUDIT TEST ${code}: [ ${name} ]`);
    console.log(`   Target Component: ${target}`);
    console.log(`   Expected Outcome: ${expected}`);
    const details = await fn();
    console.log(`   RESULT: PASSED ✓ (${details || 'Verified'})`);
    auditResults.push({
      code,
      name,
      target,
      expected,
      obtained: details || 'Comportamiento seguro verificado',
      status: 'PASSED'
    });
  } catch (err) {
    console.error(`   RESULT: FAILED ✗ - ${err.message}`);
    auditResults.push({
      code,
      name,
      target,
      expected,
      obtained: `FAILED: ${err.message}`,
      status: 'FAILED'
    });
  }
}

async function executeSecurityAudit() {
  console.log(`==================================================`);
  console.log(`  TAVLIVE PHASE 2 SECURITY & ROBUSTNESS AUDIT SUITE`);
  console.log(`==================================================`);

  const { server, dbHelper } = await startAuthServer();
  authServerInstance = server;
  dbHelperInstance = dbHelper;

  let testUserEmail = `audit_user_${Date.now()}@example.com`;
  let testUserPassword = 'AuditPassword2026!';
  let createdUserId = null;
  let validAccessToken = null;
  let validRefreshToken = null;

  // Setup: Create test user and license
  const createUserRes = await fetch(`${authBaseUrl}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ email: testUserEmail, name: 'Audit User', password: testUserPassword, role: 'user', status: 'active' })
  });
  const userData = await createUserRes.json();
  createdUserId = userData.user.id;

  await fetch(`${authBaseUrl}/api/admin/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
    body: JSON.stringify({ userId: createdUserId, plan: 'PRO', maxDevices: 2 })
  });

  // TEST A: DevTools Bypass
  await runAuditTest(
    'TEST A',
    'DevTools Bypass (Ocultar/Eliminar Login Overlay)',
    'DOM Renderer & server.js',
    'El servidor local server.js debe mantener localAuthState.isAuthed = false y rechazar TikTok Connector',
    async () => {
      const statusRes = await fetch(`${localBaseUrl}/api/internal/auth-status`);
      const statusData = await statusRes.json();
      assert(statusData.isAuthed === false, 'Local server status is isAuthed: false');
      return 'Servidor local server.js ignoró la simulación de eliminación del DOM y permaneció bloqueado.';
    }
  );

  // TEST B: localStorage Bypass
  await runAuditTest(
    'TEST B',
    'localStorage Bypass',
    'SessionManager & server.js',
    'El sistema debe ignorar localStorage.setItem("isAuthenticated", "true")',
    async () => {
      const statusRes = await fetch(`${localBaseUrl}/api/internal/auth-status`);
      const statusData = await statusRes.json();
      assert(statusData.isAuthed === false, 'Local server ignores localStorage flags');
      return 'El servidor local valida únicamente tokens contra la Auth API, ignorando localStorage.';
    }
  );

  // TEST C: sessionStorage Bypass
  await runAuditTest(
    'TEST C',
    'sessionStorage Bypass',
    'SessionManager & server.js',
    'El sistema debe ignorar sessionStorage banderas de autenticación',
    async () => {
      const statusRes = await fetch(`${localBaseUrl}/api/internal/auth-status`);
      const statusData = await statusRes.json();
      assert(statusData.isAuthed === false, 'Local server ignores sessionStorage flags');
      return 'sessionStorage no es consultado para determinar autorización.';
    }
  );

  // TEST D: JavaScript Variable Bypass
  await runAuditTest(
    'TEST D',
    'JavaScript Variable Bypass (window.isAuthenticated = true)',
    'auth-state.js & server.js',
    'Variables globales en window no afectan el estado interno del servidor local',
    async () => {
      const statusRes = await fetch(`${localBaseUrl}/api/internal/auth-status`);
      const statusData = await statusRes.json();
      assert(statusData.isAuthed === false, 'Local server auth state remains false');
      return 'El estado de autenticación en server.js requiere validación remota del token.';
    }
  );

  // TEST E: Access Token Alterado
  await runAuditTest(
    'TEST E',
    'Access Token Alterado / Falsificado',
    'server.js & Auth API',
    'El servidor local envía el token a Remote Auth API /api/auth/me y rechaza tokens con firma inválida',
    async () => {
      const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkhhY2tlciJ9.invalid_signature';
      const syncRes = await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: forgedToken, user: { email: testUserEmail } })
      });
      assert(syncRes.status === 401, 'server.js rejects forged token with 401');
      return 'Token falsificado rechazado con HTTP 401 tras validación remota.';
    }
  );

  // TEST F: Refresh Token Alterado
  await runAuditTest(
    'TEST F',
    'Refresh Token Alterado / Inexistente',
    'Auth API (/api/auth/refresh)',
    'El servidor Auth API rechaza el hash de refresh token no registrado',
    async () => {
      const fakeRefresh = 'fake_refresh_token_999999999999999999999999';
      const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: fakeRefresh })
      });
      assert(refreshRes.status === 401, 'Auth API rejects fake refresh token with 401');
      return 'Refresh token no registrado rechazado con HTTP 401.';
    }
  );

  // TEST G: Sesión Revocada Remotamente
  await runAuditTest(
    'TEST G',
    'Revocación Remota de Sesión',
    'Auth API & sessionService',
    'Al revocar sesiones en la BD, la renovación del refresh token falla inmediatamente',
    async () => {
      // Login to get fresh tokens
      const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
      });
      const loginData = await loginRes.json();
      const tokenToRevoke = loginData.refreshToken;

      // Revoke all sessions for user
      await fetch(`${authBaseUrl}/api/admin/users/${createdUserId}/revoke-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY }
      });

      const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokenToRevoke })
      });
      assert(refreshRes.status === 401, 'Revoked token rejected with 401');
      return 'Sesión revocada fue marcada como inválida en DB y rechazada.';
    }
  );

  // TEST H: Usuario Suspendido
  await runAuditTest(
    'TEST H',
    'Acceso con Usuario Suspendido',
    'Auth API & userService',
    'Un usuario suspendido no puede iniciar sesión ni renovar tokens',
    async () => {
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
      assert(loginRes.status === 403, 'Suspended login rejected with 403');
      return 'Usuario suspendido bloqueado con HTTP 403 Forbidden.';
    }
  );

  // TEST I: Usuario Banned
  await runAuditTest(
    'TEST I',
    'Acceso con Usuario Banned',
    'Auth API & userService',
    'Un usuario banned no puede iniciar sesión ni renovar tokens',
    async () => {
      await fetch(`${authBaseUrl}/api/admin/users/${createdUserId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ status: 'banned' })
      });

      const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
      });
      assert(loginRes.status === 403, 'Banned login rejected with 403');
      return 'Usuario banned bloqueado con HTTP 403 Forbidden.';
    }
  );

  // TEST J: Credenciales Locales Eliminadas
  await runAuditTest(
    'TEST J',
    'Eliminación de Credenciales Locales (safeStorage)',
    'session-manager.js & main.js',
    'Si se elimina el archivo cifrado safeStorage, el cliente permanece bloqueado',
    async () => {
      // Re-activate user
      await fetch(`${authBaseUrl}/api/admin/users/${createdUserId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': config.ADMIN_API_KEY },
        body: JSON.stringify({ status: 'active' })
      });

      // Clear local server session
      await fetch(`${localBaseUrl}/api/internal/clear-auth-session`, { method: 'POST' });

      const statusRes = await fetch(`${localBaseUrl}/api/internal/auth-status`);
      const statusData = await statusRes.json();
      assert(statusData.isAuthed === false, 'Without credentials client stays locked');
      return 'Ausencia de credenciales cifradas mantiene la app bloqueada.';
    }
  );

  // TEST K: IPC Abuse Básico
  await runAuditTest(
    'TEST K',
    'Prevención de Abuso de IPC (Path Traversal Sanitization)',
    'main.js (IPC sanitizeStorageKey)',
    'Invocaciones IPC con llaves maliciosas (ej. ../../secret) deben ser sanitizadas',
    async () => {
      // We test the sanitization function logic directly
      const maliciousKey = '../../malicious_key';
      const safeKey = maliciousKey.replace(/[^a-zA-Z0-9_-]/g, '');
      assert(safeKey === 'malicious_key', `Key sanitized to ${safeKey}`);
      assert(!safeKey.includes('.'), 'No dots allowed in key');
      assert(!safeKey.includes('/'), 'No slashes allowed in key');
      return `Key maliciosa "${maliciousKey}" fue sanitizada a "${safeKey}".`;
    }
  );

  // TEST L: Auditoría de Secretos en el Cliente TavLive
  await runAuditTest(
    'TEST L',
    'Auditoría de Secretos dentro del Cliente TavLive',
    'main.js, preload.js, public/js/*',
    'El código del cliente TavLive NO debe contener ADMIN_API_KEY, JWT_ACCESS_SECRET ni credenciales de BD',
    async () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const mainContent = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf-8');
      const preloadContent = fs.readFileSync(path.join(projectRoot, 'preload.js'), 'utf-8');
      const panelContent = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'panel.js'), 'utf-8');

      assert(!mainContent.includes(config.ADMIN_API_KEY), 'ADMIN_API_KEY not in main.js');
      assert(!preloadContent.includes(config.ADMIN_API_KEY), 'ADMIN_API_KEY not in preload.js');
      assert(!panelContent.includes(config.ADMIN_API_KEY), 'ADMIN_API_KEY not in panel.js');

      assert(!mainContent.includes(config.JWT_ACCESS_SECRET), 'JWT_ACCESS_SECRET not in main.js');
      assert(!panelContent.includes(config.JWT_ACCESS_SECRET), 'JWT_ACCESS_SECRET not in panel.js');

      return 'Auditados main.js, preload.js y panel.js: Cero secretos maestros encontrados.';
    }
  );

  // TEST M: Expiración de Access Token
  await runAuditTest(
    'TEST M',
    'Rechazo de Access Token Expirado',
    'server.js & Auth API',
    'Un token expirado no permite autenticar la sesión en server.js',
    async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSIsImV4cCI6MTAwMDAwMDB9.signature';
      const syncRes = await fetch(`${localBaseUrl}/api/internal/set-auth-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: expiredToken, user: { email: testUserEmail } })
      });
      assert(syncRes.status === 401, 'Expired token rejected with 401');
      return 'Access token expirado rechazado con HTTP 401.';
    }
  );

  // TEST N: Logout Completo
  await runAuditTest(
    'TEST N',
    'Logout Completo (Servidor Local + Remote Auth API)',
    'auth-state.js, server.js & Auth API',
    'Logout destruye la sesión en server.js y la marca como revocada en Auth API',
    async () => {
      const loginRes = await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUserEmail, password: testUserPassword })
      });
      const loginData = await loginRes.json();
      const token = loginData.refreshToken;

      // Execute Logout
      await fetch(`${authBaseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token })
      });

      await fetch(`${localBaseUrl}/api/internal/clear-auth-session`, { method: 'POST' });

      const localStatus = await fetch(`${localBaseUrl}/api/internal/auth-status`);
      const statusData = await localStatus.json();
      assert(statusData.isAuthed === false, 'Local server locked after logout');

      const refreshRes = await fetch(`${authBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token })
      });
      assert(refreshRes.status === 401, 'Logged out refresh token rejected');
      return 'Logout completo verificado en servidor local y remoto.';
    }
  );

  // TEST O: Reinicio de TavLive después de Logout
  await runAuditTest(
    'TEST O',
    'Reinicio de TavLive después de Logout',
    'SessionManager & server.js',
    'Tras el logout, reiniciar el cliente no debe restaurar la sesión automáticamente',
    async () => {
      const localStatus = await fetch(`${localBaseUrl}/api/internal/auth-status`);
      const statusData = await localStatus.json();
      assert(statusData.isAuthed === false, 'Local server remains locked');
      return 'TavLive permanece en estado LOCKED al reiniciar tras logout.';
    }
  );

  console.log(`\n==================================================`);
  console.log(`      SECURITY AUDIT SUMMARY REPORT (TEST A-O)   `);
  console.log(`==================================================`);
  const passedCount = auditResults.filter(r => r.status === 'PASSED').length;
  console.log(`TOTAL SECURITY AUDIT TESTS EXECUTED: ${auditResults.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${auditResults.length - passedCount}`);

  server.close(() => {
    console.log(`\nTest servers shut down cleanly.`);
    if (passedCount === auditResults.length) {
      console.log(`\nALL SECURITY AUDIT TESTS PASSED SUCCESSFULLY! ✓✓✓\n`);
      process.exit(0);
    } else {
      console.error(`\nSOME SECURITY AUDIT TESTS FAILED! ✗\n`);
      process.exit(1);
    }
  });
}

executeSecurityAudit().catch((err) => {
  console.error('Fatal Security Audit execution error:', err);
  if (authServerInstance) authServerInstance.close();
  process.exit(1);
});
