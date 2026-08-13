/**
 * auth-ui.js
 * Professional Glassmorphic Login UI Overlay and Plan Badging for TavLive (v1.4.3).
 * Controls rendering of the Login screen, Plan badges (FREE/PRO/VIP),
 * input handlers, error states, and Logout button with clean input focus,
 * auto-login silent restoration, and crash prevention.
 */
import { authState, AUTH_STATES } from './auth-state.js';
import { SessionManager } from './session-manager.js';

export class AuthUI {
    static init() {
        this.createLoginOverlay();
        this.injectHeaderUserBadge();

        // Subscribe to authState changes (including license/plan updates)
        authState.subscribe(({ state, user, license }) => {
            this.renderState(state, user, license);
        });

        // Initial state rendering
        this.renderState(authState.state, authState.currentUser, authState.currentLicense);

        // Attempt silent auto-login via stored refresh token safely
        this.attemptAutoLogin();
    }

    static async attemptAutoLogin() {
        try {
            const hasToken = await SessionManager.getRefreshToken().catch(() => null);
            if (hasToken) {
                this.setLoading(true, 'Restaurando sesión...');
            }

            const restoreRes = await authState.restoreSession();
            if (restoreRes.success) {
                console.info('[Auto-Login] Sesión restaurada automáticamente.');
            } else {
                this.setLoading(false);
            }
        } catch (e) {
            console.warn('[Auto-Login] Excepción al restaurar la sesión:', e);
            await SessionManager.clearRefreshToken().catch(() => {});
            this.setLoading(false);
            this.renderState(AUTH_STATES.LOCKED, null, null);
        }
    }

    static createLoginOverlay() {
        if (document.getElementById('tavlive-login-overlay')) return;

        const overlayHtml = `
        <div id="tavlive-login-overlay" class="tavlive-auth-overlay">
            <div class="tavlive-auth-glass-card">
                <div class="tavlive-auth-header">
                    <div class="tavlive-auth-logo">
                        <span class="logo-tav">Tav</span><span class="logo-live">Live</span>
                    </div>
                    <p class="tavlive-auth-subtitle">Sistema de Control e Interacción para TikTok LIVE</p>
                </div>

                <div id="tavlive-auth-error-banner" class="tavlive-auth-banner error" style="display: none;">
                    <i data-lucide="alert-circle"></i>
                    <span id="tavlive-auth-error-text"></span>
                </div>

                <form id="tavlive-login-form" class="tavlive-auth-form" autocomplete="on">
                    <div class="tavlive-form-group">
                        <label for="tavlive-input-email">Usuario de TikTok (@tiktok_username)</label>
                        <div class="tavlive-input-wrapper">
                            <i data-lucide="user" class="input-icon"></i>
                            <input type="text" id="tavlive-input-email" placeholder="@tu_usuario_tiktok" required autocomplete="username">
                        </div>
                    </div>

                    <div class="tavlive-form-group">
                        <label for="tavlive-input-password">Contraseña / PIN</label>
                        <div class="tavlive-input-wrapper">
                            <i data-lucide="lock" class="input-icon"></i>
                            <input type="password" id="tavlive-input-password" placeholder="••••••••••••" required autocomplete="current-password">
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px; margin: 10px 0 16px 0;">
                        <input type="checkbox" id="tavlive-checkbox-remember" checked style="width: 16px; height: 16px; accent-color: #00ffcc; cursor: pointer;">
                        <label for="tavlive-checkbox-remember" style="font-size: 12px; color: #a0aec0; cursor: pointer; user-select: none;">Recordar mi sesión en este equipo</label>
                    </div>

                    <button type="submit" id="tavlive-btn-login" class="tavlive-auth-submit-btn">
                        <span id="tavlive-btn-text">INICIAR SESIÓN</span>
                        <div id="tavlive-btn-spinner" class="tavlive-spinner" style="display: none;"></div>
                    </button>
                </form>

                <div class="tavlive-auth-divider">
                    <span>O CONTINUA CON</span>
                </div>

                <button type="button" id="tavlive-btn-google-login" class="tavlive-google-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Continuar con Google</span>
                </button>

                <div class="tavlive-auth-footer">
                    <p>TavLive v1.4.5 • Autenticación Remota Protegida</p>
                </div>
            </div>
        </div>
        `;

        const styleHtml = `
        <style id="tavlive-auth-styles">
            .tavlive-auth-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(5, 5, 8, 0.88);
                backdrop-filter: blur(28px);
                -webkit-backdrop-filter: blur(28px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: opacity 0.3s ease, visibility 0.3s ease;
            }

            .tavlive-auth-overlay.hidden {
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
            }

            .tavlive-auth-glass-card {
                width: 100%;
                max-width: 420px;
                padding: 35px 30px;
                background: rgba(18, 18, 28, 0.75);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 24px;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                animation: tavliveCardPop 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }

            @keyframes tavliveCardPop {
                from { transform: scale(0.94); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }

            .tavlive-auth-header { text-align: center; margin-bottom: 24px; }
            .tavlive-auth-logo { font-size: 32px; font-weight: 800; letter-spacing: -0.5px; }
            .logo-tav { color: #ffffff; }
            .logo-live { color: #00ffcc; text-shadow: 0 0 12px rgba(0, 255, 204, 0.5); }
            .tavlive-auth-subtitle { font-size: 13px; color: #a0aec0; margin-top: 6px; }

            .tavlive-auth-banner {
                padding: 12px 16px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 500;
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .tavlive-auth-banner.error {
                background: rgba(255, 59, 48, 0.15);
                border: 1px solid rgba(255, 59, 48, 0.3);
                color: #ff453a;
            }

            .tavlive-auth-form { display: flex; flex-direction: column; gap: 16px; }
            .tavlive-form-group { display: flex; flex-direction: column; gap: 6px; }
            .tavlive-form-group label { font-size: 12px; font-weight: 600; color: #cbd5e0; text-transform: uppercase; letter-spacing: 0.5px; }

            .tavlive-input-wrapper {
                position: relative;
                display: flex;
                align-items: center;
            }
            .input-icon {
                position: absolute;
                left: 14px;
                width: 18px;
                height: 18px;
                color: #718096;
            }
            .tavlive-input-wrapper input {
                width: 100%;
                padding: 12px 14px 12px 42px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                color: #ffffff;
                font-size: 14px;
                outline: none;
                transition: all 0.2s ease;
            }
            .tavlive-input-wrapper input:focus {
                border-color: #00ffcc;
                box-shadow: 0 0 15px rgba(0, 255, 204, 0.25);
                background: rgba(255, 255, 255, 0.08);
            }

            .tavlive-auth-submit-btn {
                position: relative;
                width: 100%;
                padding: 14px;
                background: linear-gradient(135deg, #00ffcc 0%, #00b386 100%);
                border: none;
                border-radius: 12px;
                color: #050508;
                font-weight: 700;
                font-size: 14px;
                letter-spacing: 0.5px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-top: 10px;
                box-shadow: 0 4px 20px rgba(0, 255, 204, 0.3);
            }
            .tavlive-auth-submit-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 25px rgba(0, 255, 204, 0.4);
            }
            .tavlive-auth-submit-btn:disabled {
                opacity: 0.7;
                cursor: not-allowed;
                transform: none;
            }

            .tavlive-auth-divider {
                display: flex;
                align-items: center;
                margin: 24px 0;
                color: #4a5568;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 1px;
            }
            .tavlive-auth-divider::before, .tavlive-auth-divider::after {
                content: "";
                flex: 1;
                height: 1px;
                background: rgba(255, 255, 255, 0.08);
            }
            .tavlive-auth-divider span { padding: 0 12px; }

            .tavlive-google-btn {
                width: 100%;
                padding: 12px;
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                color: #ffffff;
                font-weight: 600;
                font-size: 13px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                transition: all 0.2s ease;
            }
            .tavlive-google-btn:hover {
                background: rgba(255, 255, 255, 0.12);
                border-color: rgba(255, 255, 255, 0.25);
            }

            .tavlive-auth-footer { text-align: center; margin-top: 24px; font-size: 11px; color: #718096; }

            .tavlive-spinner {
                width: 18px;
                height: 18px;
                border: 2px solid rgba(5, 5, 8, 0.2);
                border-top-color: #050508;
                border-radius: 50%;
                animation: tavliveSpin 0.8s linear infinite;
            }
            @keyframes tavliveSpin { to { transform: rotate(360deg); } }

            .tavlive-header-user-badge {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 6px 14px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 30px;
                font-size: 12px;
                margin-left: auto;
            }

            .tavlive-plan-badge {
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }
            .plan-free { background: rgba(160, 174, 192, 0.2); color: #a0aec0; border: 1px solid rgba(160, 174, 192, 0.3); }
            .plan-pro { background: rgba(0, 255, 204, 0.2); color: #00ffcc; border: 1px solid rgba(0, 255, 204, 0.4); box-shadow: 0 0 10px rgba(0, 255, 204, 0.2); }
            .plan-vip { background: rgba(255, 215, 0, 0.2); color: #ffd700; border: 1px solid rgba(255, 215, 0, 0.4); box-shadow: 0 0 12px rgba(255, 215, 0, 0.3); }

            .tavlive-logout-btn {
                background: rgba(255, 59, 48, 0.2);
                border: 1px solid rgba(255, 59, 48, 0.3);
                color: #ff453a;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .tavlive-logout-btn:hover {
                background: rgba(255, 59, 48, 0.4);
            }
        </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styleHtml);
        document.body.insertAdjacentHTML('afterbegin', overlayHtml);

        // Bind form submit event
        const form = document.getElementById('tavlive-login-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLoginSubmit();
            });
        }

        // Bind Google login click event
        const googleBtn = document.getElementById('tavlive-btn-google-login');
        if (googleBtn) {
            googleBtn.addEventListener('click', async () => {
                await this.handleGoogleLoginClick();
            });
        }
    }

    static injectHeaderUserBadge() {
        const header = document.querySelector('.header') || document.querySelector('header');
        if (!header || document.getElementById('tavlive-user-badge-container')) return;

        const badgeHtml = `
        <div id="tavlive-user-badge-container" class="tavlive-header-user-badge" style="display: none;">
            <i data-lucide="user" style="width: 14px; height: 14px; color: #00ffcc;"></i>
            <span id="tavlive-header-email-text" class="tavlive-user-email"></span>
            <span id="tavlive-header-plan-badge" class="tavlive-plan-badge plan-free">FREE</span>
            <button id="tavlive-header-logout-btn" class="tavlive-logout-btn">Cerrar Sesión</button>
        </div>
        `;

        header.insertAdjacentHTML('beforeend', badgeHtml);

        const logoutBtn = document.getElementById('tavlive-header-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (confirm('¿Deseas cerrar la sesión activa en TavLive?')) {
                    await authState.logout(true);
                }
            });
        }
    }

    static showError(message) {
        const banner = document.getElementById('tavlive-auth-error-banner');
        const text = document.getElementById('tavlive-auth-error-text');
        if (banner && text) {
            text.textContent = message;
            banner.style.display = 'flex';
        }
    }

    static hideError() {
        const banner = document.getElementById('tavlive-auth-error-banner');
        if (banner) {
            banner.style.display = 'none';
        }
    }

    static setLoading(isLoading, textOverride = null) {
        const submitBtn = document.getElementById('tavlive-btn-login');
        const googleBtn = document.getElementById('tavlive-btn-google-login');
        const btnText = document.getElementById('tavlive-btn-text');
        const spinner = document.getElementById('tavlive-btn-spinner');

        if (submitBtn && btnText && spinner) {
            submitBtn.disabled = isLoading;
            if (googleBtn) googleBtn.disabled = isLoading;
            if (isLoading) {
                btnText.textContent = textOverride ? textOverride.toUpperCase() : 'CONECTANDO CON EL SERVIDOR...';
                spinner.style.display = 'block';
            } else {
                btnText.textContent = 'INICIAR SESIÓN';
                spinner.style.display = 'none';
            }
        }
    }

    static async handleLoginSubmit() {
        const emailInput = document.getElementById('tavlive-input-email');
        const passwordInput = document.getElementById('tavlive-input-password');

        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        const rememberCheckbox = document.getElementById('tavlive-checkbox-remember');
        const rememberMe = rememberCheckbox ? rememberCheckbox.checked : true;

        if (!email || !password) {
            this.showError('Por favor completa todos los campos.');
            return;
        }

        // Purge any stale stored tokens prior to submission to prevent token collision ambiguity
        await SessionManager.clearRefreshToken().catch(() => {});

        this.hideError();
        this.setLoading(true);

        try {
            const result = await authState.login(email, password, rememberMe);
            if (!result.success) {
                this.showError(result.error || 'Credenciales incorrectas.');
            } else {
                if (passwordInput) passwordInput.value = '';
            }
        } catch (err) {
            this.showError('Error inesperado al iniciar sesión.');
        } finally {
            this.setLoading(false);
        }
    }

    static async handleGoogleLoginClick() {
        this.hideError();

        const promptToken = prompt('Ingresa tu Token de Google OIDC para probar la autenticación:');
        if (!promptToken) return;

        this.setLoading(true);

        try {
            const result = await authState.loginWithGoogle(promptToken.trim());
            if (!result.success) {
                this.showError(result.error || 'Error de autenticación con Google.');
            }
        } catch (err) {
            this.showError('Error de conexión durante la autenticación de Google.');
        } finally {
            this.setLoading(false);
        }
    }

    static updateFeatureAvailability() {
        const elements = document.querySelectorAll('[data-required-plan]');
        elements.forEach(el => {
            const reqPlan = el.getAttribute('data-required-plan');
            if (reqPlan) {
                const hasAccess = authState.hasPlan(reqPlan);
                if (!hasAccess) {
                    el.classList.add('tavlive-plan-locked');
                    el.setAttribute('title', `Esta función requiere Plan ${reqPlan}`);
                } else {
                    el.classList.remove('tavlive-plan-locked');
                    el.removeAttribute('title');
                }
            }
        });
    }

    static renderState(state, user, license) {
        const overlay = document.getElementById('tavlive-login-overlay');
        const badge = document.getElementById('tavlive-user-badge-container');
        const emailText = document.getElementById('tavlive-header-email-text');
        const planBadge = document.getElementById('tavlive-header-plan-badge');

        if (state === AUTH_STATES.AUTHENTICATED && user) {
            if (overlay) overlay.classList.add('hidden');
            if (badge) badge.style.display = 'flex';
            
            const displayHandle = user.tiktok_username ? `@${user.tiktok_username.replace('@', '')}` : user.email;
            if (emailText) emailText.textContent = displayHandle;

            const currentPlan = authState.getCurrentPlan();
            if (planBadge) {
                planBadge.textContent = currentPlan;
                planBadge.className = `tavlive-plan-badge plan-${currentPlan.toLowerCase()}`;
            }
            this.updateFeatureAvailability();

            // Auto-populate and lock TikTok handle inputs based on active license & session
            const userHandle = user.tiktok_username || (license && license.tiktok_username) || user.tiktokUsername;
            if (userHandle) {
                const cleanHandle = String(userHandle).replace('@', '').trim();
                
                const tiktokInput = document.getElementById('username-input');
                if (tiktokInput) {
                    tiktokInput.value = cleanHandle;
                    tiktokInput.readOnly = true;
                    tiktokInput.title = `Conexión fijada por tu licencia activa (@${cleanHandle})`;
                }

                const setupInput = document.getElementById('setup-tiktok-username');
                if (setupInput) {
                    setupInput.value = cleanHandle;
                    setupInput.readOnly = true;
                    setupInput.title = `Usuario fijado según la licencia activa de TavLive (@${cleanHandle})`;
                }
            }
        } else {
            if (overlay) overlay.classList.remove('hidden');
            if (badge) badge.style.display = 'none';
            if (planBadge) {
                planBadge.textContent = 'FREE';
                planBadge.className = 'tavlive-plan-badge plan-free';
            }
            this.updateFeatureAvailability();

            // Unlock form controls cleanly upon Logout (v1.4.3)
            const emailInput = document.getElementById('tavlive-input-email');
            const passwordInput = document.getElementById('tavlive-input-password');
            const submitBtn = document.getElementById('tavlive-btn-login');
            const googleBtn = document.getElementById('tavlive-btn-google-login');

            if (emailInput) {
                emailInput.disabled = false;
                emailInput.readOnly = false;
                emailInput.style.pointerEvents = 'auto';
                try { emailInput.blur(); } catch(e) {}
            }
            if (passwordInput) {
                passwordInput.disabled = false;
                passwordInput.readOnly = false;
                passwordInput.style.pointerEvents = 'auto';
                passwordInput.value = ''; // Ensure password field is clean, no false dots
                try { passwordInput.blur(); } catch(e) {}
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.pointerEvents = 'auto';
            }
            if (googleBtn) {
                googleBtn.disabled = false;
                googleBtn.style.pointerEvents = 'auto';
            }

            this.setLoading(false);

            const tiktokInput = document.getElementById('username-input');
            if (tiktokInput) {
                tiktokInput.readOnly = false;
                tiktokInput.title = '';
            }

            const setupInput = document.getElementById('setup-tiktok-username');
            if (setupInput) {
                setupInput.readOnly = false;
                setupInput.title = '';
            }

            // Refocus email input cleanly in Electron
            if (emailInput) {
                setTimeout(() => {
                    try { emailInput.focus(); } catch(e) {}
                }, 50);
            }
        }
    }
}
