# RESUMEN TÉCNICO DE CONTEXTO Y ARQUITECTURA — TAVLIVE AUTH, LICENSE & HARDENING SYSTEM

> **Documento para transferencia de contexto a IA / Desarrolladores**  
> **Versión del Proyecto**: TavLive v1.3.19  
> **Estado del Proyecto**: Fases 1 a 7 (7A–7E) Completadas, Auditadas, Certificadas y Congeladas (**266 / 266 Pruebas PASSED, 0 fallos, 0 regresiones**)

---

## 1. Metodología de Trabajo y Principios Arquitectónicos

### A. Metodología de Desarrollo Incremental Estricto
El proyecto se desarrolla siguiendo una metodología por **Fases y Subfases aisladas**.  
Reglas aplicadas:
1. **Unidad de Trabajo Aislada**: Cada subfase se enfoca en un único objetivo técnico sin alterar componentes fuera de alcance.
2. **Componentes Congelados**: Una vez que una fase/subfase es aprobada y auditada, sus componentes quedan **congelados**. Está estrictamente prohibido modificar su lógica o hacer refactors no autorizados.
3. **Regla de Detención Absoluta**: Al finalizar cada subfase, se ejecuta la suite de pruebas automatizadas y la regresión global, se emite un informe formal de veredicto (`APROBADA` / `RECHAZADA`) y **se detiene completamente la ejecución** a la espera de autorización explícita del usuario para continuar.

### B. Modelo de Seguridad y Jerarquía de Autoridad
```
AUTH SERVER REMOTO (Puerto 4000)
        │
        ├── 1. Autoridad Única de Seguridad: Valida credenciales, JWT, Argon2id, Licencias y Dispositivos.
        ▼
EXPRESS LOCAL SERVER (server.js - Puerto 3000)
        │
        ├── 2. Autoridad Local de Feature Gating: Ejecuta middleware requirePlan(minPlan).
        │      Sincroniza token en caliente vía Server-to-Server contra /api/auth/me.
        ▼
CLIENT AUTH STATE MACHINE (public/js/auth/auth-state.js)
        │
        ├── 3. Estado Informativo Local: Mantiene currentLicense, getCurrentPlan(), hasPlan().
        ▼
CLIENT UI RENDERER (public/js/auth/auth-ui.js)
        │
        └── 4. Capa Visual y UX: Muestra badges FREE/PRO/VIP y deshabilita controles visuales.
```

**REGLA ABSOLUTA DE SEGURIDAD**:
* **El cliente (JS / DOM / LocalStorage / DevTools) NO es una capa de seguridad.**
* La alteración de variables en DevTools (`window.userPlan`, `localStorage`, etc.) o la modificación del DOM **NO concede autorización de servidor**. 
* Si un usuario desactiva atributos `disabled` en el cliente, `server.js` continúa respondiendo estrictamente **HTTP 403 Forbidden** o **HTTP 401 Unauthorized**.

---

## 2. Detalle de Fases Implementadas y Verificadas

### FASE 1 — Backend de Autenticación Base (14/14 PASSED)
* **Auth Server**: Servidor independiente Node.js/Express (puerto 4000) con base de datos SQLite.
* **Seguridad de Passwords**: Hashing con **Argon2id** (`$argon2id$v=19$m=65536,t=3,p=1`).
* **Tokens**: Emisión de Access Tokens (JWT) y Refresh Tokens opacos almacenados en SQLite con soporte de revocación inmediata.
* **Validación**: Esquemas Zod para la sanitización de inputs en API endpoints.
* **Admin API**: Endpoints protegidos por `x-admin-key` para gestión de usuarios, licencias y dispositivos.

### FASE 2 — Integración con Cliente Electron y Auditoría (15/15 PASSED)
* **Persistencia Segura**: Reemplazo de almacenamiento plano por cifrado nativo de sistema operativo Windows (`safeStorage` / DPAPI).
* **Gestor de Sesión**: `SessionManager` gestiona el token cifrado en `.secure_refresh_token.bin`.
* **Pruebas de Resistencia**: Verificado que la manipulación de `localStorage`, `sessionStorage`, variables en `window` u ocultación del DOM en DevTools no omiten la autenticación requerida en `server.js`.

### FASE 3 — Integración de Google OAuth (20/20 PASSED)
* **Autenticación OIDC**: Endpoint `/api/auth/google/verify` para validar ID Tokens de Google.
* **Vincular Cuentas**: Auto-creación de usuario o vinculación sin duplicidad mediante correo electrónico.
* **Respeto de Reglas**: Google Login respeta las mismas restricciones de estado de cuenta (`suspended`, `banned`), estado de licencia y límites de dispositivos.
* **Integraciones Preservadas**: Verificada compatibilidad 100% sin modificar TikTok LIVE Connector, Spotify, TTS, OBS, Widgets ni Canvas 9:16.

### FASE 4 (4A - 4E) — Modelo de Licencias, Estados y Control de Dispositivos (37/37 PASSED)
* **Subfase 4A (Modelo de Planes)**: Asignación de cupo de dispositivos por plan (`FREE`: max 1, `PRO`: max 2, `VIP`: max 5).
* **Subfase 4B (Estados de Licencia)**: Manejo estricto de estados `active`, `expired`, `revoked` y `paused`. Acceso denegado con **HTTP 403 Forbidden** para licencias inactivas.
* **Subfase 4C (Vencimiento por Fecha)**: Validación de `expires_at`. Licencias con fecha vencida son rechazadas inmediatamente.
* **Subfase 4D (Control de Dispositivos)**: Identificación única de equipos mediante `device_identifier`. Re-autenticación en el mismo equipo no consume cupo adicional; nuevos equipos superando el máximo son rechazados.
* **Subfase 4E (Revocación Avanzada)**: Revocar un dispositivo desde la Admin API cambia su estado a `revoked`, invalida inmediatamente todas sus sesiones activas/Refresh Tokens e impide el re-registro desde ese `device_identifier`.

### FASE 5 & 5.1 — Heartbeat / Validación Continua y Hardening (25/25 PASSED)
* **Supervisión Continua**: Intervalo de Heartbeat ejecutándose en segundo plano (cada 3 minutos) consultando `/api/auth/me` del Auth Server remoto.
* **Reacción a Cambios**: Detecta en caliente si la cuenta fue suspendida, la licencia expiró/revocó o el dispositivo fue bloqueado, ejecutando el bloqueo inmediato de la aplicación.
* **Tolerancia a Red**: Ventana de gracia de hasta 3 errores consecutivos de conexión física de red sin cerrar la sesión inmediatamente.
* **Hardening 5.1**:
  - `AbortController` (`AuthClient.abortInFlightRequests()`): Cancela peticiones HTTP en vuelo al cerrar sesión.
  - Contador `heartbeatGeneration`: Invalida respuestas tardías de red pertenecientes a sesiones anteriores evitando condiciones de carrera.

### FASE 6 (6B, 6C, 6D, 6E) — Feature Gating por Plan (75/75 PASSED)
* **Subfase 6B (Feature Gating Server-Side)**:
  - Implementación en `server.js` del middleware `requirePlan(minPlan)` y la tabla `PLAN_WEIGHTS` (`FREE: 1`, `PRO: 2`, `VIP: 3`).
  - Protección real server-side de rutas PRO (`/api/custom-animations`, `/api/upload-sound`, `/api/master-animations`) y rutas VIP (`/api/mvps`, `/api/stream-audio`).
  - Diferenciación estricta de códigos de estado: `HTTP 401 Unauthorized` (falta de sesión) vs `HTTP 403 Forbidden` (plan insuficiente o licencia inválida).
* **Subfase 6C (Client License State)**:
  - Integración en `public/js/auth/auth-state.js` de la propiedad interna `currentLicense` y métodos de consulta informativos: `getCurrentLicense()`, `getCurrentPlan()` y `hasPlan(requiredPlan)`.
* **Subfase 6D (UI Plan Badging)**:
  - Integración visual en `public/js/auth/auth-ui.js` de los Badges Glassmorphic (`FREE` Cyan, `PRO` Magenta, `VIP` Gold).
  - Método `updateFeatureAvailability()` para marcar visualmente controles deshabilitados (`[data-required-plan]`).
* **Subfase 6E (Suite Final de Integración)**:
  - Verificación completa de integración y cero regresiones.

### FASE 7 (7A - 7E) — Anti-Tamper, Hardening Electron, Runtime Integrity & Empaquetado (80/80 PASSED)
* **Subfase 7A (Auditoría y Diseño)**: Análisis de superficie de ataque del empaquetado.
* **Subfase 7B (Electron Hardening / ASAR)**: Configuración `"asar": true` en `package.json`, DevTools desactivado en producción (`app.isPackaged === true`), atajo `Ctrl+Shift+I` bloqueado en producción y restricciones de navegación `will-navigate`.
* **Subfase 7C (Runtime Integrity Check)**: Función `verifyAsarIntegrity()` en `main.js`. Verifica al arranque en producción que `app.asar` esté presente y no corrompido; caso contrario aborta la app con `app.quit()`.
* **Subfase 7D (Anti-Debugging Hardening)**: Función `verifyProcessHardening()` en `main.js`. Inspecciona `process.argv` y `process.env.NODE_OPTIONS` en producción para detectar y abortar ante intentos de depuración remota (`--inspect`, `--inspect-brk`, `--remote-debugging-port`).
* **Subfase 7E (Auditoría y Cierre Final)**: Suite de integración y regresión final certificando que todas las protecciones conviven en armonía sin impacto en rendimiento ni regresiones funcionales.

---

## 3. Resumen Global de Pruebas Automatizadas (266 / 266 PASSED)

| Fase / Subfase | Descripción | Pruebas | Resultado |
|---|---|---|---|
| **Fase 1** | Backend Base Auth API & JWT | 14 | **PASSED ✓** |
| **Fase 2** | Integración Client & Security Audit | 15 | **PASSED ✓** |
| **Fase 3** | Google OAuth OIDC Integration | 20 | **PASSED ✓** |
| **Fase 4A** | Modelo de Planes & Cupos | 5 | **PASSED ✓** |
| **Fase 4B** | Estados de Licencia (active/expired/revoked/paused) | 7 | **PASSED ✓** |
| **Fase 4C** | Vencimiento por Fecha (`expires_at`) | 6 | **PASSED ✓** |
| **Fase 4D** | Control de Dispositivos (`device_identifier`) | 7 | **PASSED ✓** |
| **Fase 4E** | Revocación Avanzada de Dispositivos | 12 | **PASSED ✓** |
| **Fase 5 + 5.1** | Heartbeat Supervision & Race Condition Hardening | 25 | **PASSED ✓** |
| **Subfase 6B** | Server-side Feature Gating (`requirePlan`) | 20 | **PASSED ✓** |
| **Subfase 6C** | Client License State Integration | 15 | **PASSED ✓** |
| **Subfase 6D** | UI Plan Badging & Feature Availability | 20 | **PASSED ✓** |
| **Subfase 6E** | Phase 6 Final Integration Suite | 20 | **PASSED ✓** |
| **Subfase 7B** | Electron ASAR Hardening & DevTools Protection | 20 | **PASSED ✓** |
| **Subfase 7C** | Runtime Integrity Check (ASAR Checksum) | 20 | **PASSED ✓** |
| **Subfase 7D** | Anti-Debugging & Process Hardening | 20 | **PASSED ✓** |
| **Subfase 7E** | Phase 7 Final Audit & Certification Suite | 20 | **PASSED ✓** |
| **TOTAL GLOBAL** | **SUITE COMPLETA ACUMULADA** | **266** | **266 / 266 PASSED (0 fallos)** |

---

## 4. Estructura de Archivos Clave del Proyecto

* `main.js`: Entrada principal Electron, creación de window, configuración de `webPreferences`, hardening DevTools, `verifyAsarIntegrity()`, `verifyProcessHardening()` y lanzador del servidor local.
* `server.js`: Servidor Express local (puerto 3000). Contiene la autoridad de Feature Gating local `requirePlan(minPlan)`, sincronización de sesión y lógica de negocio.
* `package.json`: Configuración de dependencias y scripts de `electron-builder` (`"asar": true`).
* `public/js/auth/auth-client.js`: Cliente HTTP encapsulado para llamadas a Auth Server con soporte de `AbortController`.
* `public/js/auth/auth-state.js`: Máquina de estados centralizada, temporizador de Heartbeat supervision, rastreo de `heartbeatGeneration` y métodos `getCurrentPlan()`, `hasPlan()`.
* `public/js/auth/auth-ui.js`: Overlay Glassmorphic de Login, renderizado de badges de Plan (`FREE`, `PRO`, `VIP`) y actualización visual de controles deshabilitados.
* `auth-server/`: Servidor independiente Auth Server remoto (puerto 4000/401X en test) con base de datos SQLite y scripts de pruebas automatizadas en `auth-server/scripts/`.

---

## 5. Instrucciones para la Continuación del Desarrollo

1. **Mantener la Regla de Componentes Congelados**: No modificar la lógica interna de autenticación, Feature Gating, Heartbeat ni `server.js` a menos que sea autorizado por una nueva fase específica.
2. **Ejecución de Pruebas**: Se pueden ejecutar las suites individuales de prueba desde el directorio `auth-server` con Node.js:
   - `node scripts/run_phase1_tests.js`
   - `node scripts/run_phase2_security_audit.js`
   - `node scripts/run_phase3_tests.js`
   - `node scripts/run_phase4a_tests.js`
   - `node scripts/run_phase4b_tests.js`
   - `node scripts/run_phase4c_tests.js`
   - `node scripts/run_phase4d_tests.js`
   - `node scripts/run_phase4e_tests.js`
   - `node scripts/run_phase5_tests.js`
   - `node scripts/run_phase6_tests.js`
   - `node scripts/run_phase6c_tests.js`
   - `node scripts/run_phase6d_tests.js`
   - `node scripts/run_phase6e_tests.js`
   - `node scripts/run_phase7b_tests.js`
   - `node scripts/run_phase7c_tests.js`
   - `node scripts/run_phase7d_tests.js`
   - `node scripts/run_phase7e_tests.js`
3. **Respetar el Flujo de Autorización**: La autoridad de seguridad **siempre es el Auth Server remoto + `server.js`**. La interfaz del frontend es meramente informativa/UX.

---

**Veredicto del Proyecto al Día de Hoy**:  
**FASES 1 A 7 (7A-7E) OFICIALMENTE COMPLETADAS, AUDITADAS, CERTIFICADAS Y CONGELADAS DEFINITIVAMENTE (266/266 PASSED)**
