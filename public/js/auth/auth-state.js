/**
 * auth-state.js
 * Central Auth State Machine for TavLive Client with Heartbeat Supervision,
 * Generation Counter tracking, AbortController integration, and Client License/Plan State.
 */
import { AuthClient } from './auth-client.js';
import { SessionManager } from './session-manager.js';

export const AUTH_STATES = {
    LOCKED: 'LOCKED',
    AUTHENTICATED: 'AUTHENTICATED'
};

const PLAN_WEIGHTS = {
    FREE: 1,
    PRO: 2,
    VIP: 3
};

class AuthStateManager {
    constructor() {
        this.state = AUTH_STATES.LOCKED;
        this.accessToken = null;
        this.currentUser = null;
        this.currentLicense = null;
        this.listeners = new Set();
        this.heartbeatTimer = null;
        this.consecutiveNetworkErrors = 0;
        this.maxGraceNetworkErrors = 3;
        this.heartbeatIntervalMs = window.TAVLIVE_HEARTBEAT_INTERVAL_MS || 300000; // 5 minutes (v1.4.4)
        this.heartbeatGeneration = 0;
    }

    /**
     * Subscribe to auth state changes.
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    _notify() {
        for (const listener of this.listeners) {
            try {
                listener({ state: this.state, user: this.currentUser, license: this.currentLicense });
            } catch (e) {
                console.error('Error in auth listener:', e);
            }
        }
    }

    /**
     * Start the centralized heartbeat interval timer.
     */
    startHeartbeat() {
        this.stopHeartbeat(); // Clear any existing timer to prevent duplicates
        this.consecutiveNetworkErrors = 0;
        const interval = window.TAVLIVE_HEARTBEAT_INTERVAL_MS || this.heartbeatIntervalMs;

        this.heartbeatTimer = setInterval(async () => {
            await this.performHeartbeatCheck();
        }, interval);
    }

    /**
     * Stop the heartbeat timer cleanly.
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Informational helper: Get current validated license object
     */
    getCurrentLicense() {
        return this.currentLicense;
    }

    /**
     * Informational helper: Get current active plan name
     */
    getCurrentPlan() {
        if (this.state !== AUTH_STATES.AUTHENTICATED || !this.currentLicense) {
            return 'FREE';
        }
        return this.currentLicense.plan || 'FREE';
    }

    /**
     * Informational helper: Check if client has required tier access
     */
    hasPlan(requiredPlan) {
        if (this.state !== AUTH_STATES.AUTHENTICATED || !this.currentLicense) {
            return false;
        }

        const status = this.currentLicense.status || 'active';
        const expiresAt = this.currentLicense.expires_at;
        const isExpiredByDate = expiresAt && (new Date(expiresAt).getTime() < Date.now());

        if (status === 'revoked' || status === 'paused' || status === 'expired' || isExpiredByDate) {
            return false;
        }

        const currentWeight = PLAN_WEIGHTS[this.getCurrentPlan()] || 1;
        const requiredWeight = PLAN_WEIGHTS[requiredPlan] || 1;

        return currentWeight >= requiredWeight;
    }

    /**
     * Perform periodic background heartbeat & auto-refresh token check every 5 minutes.
     */
    async performHeartbeatCheck() {
        if (this.state !== AUTH_STATES.AUTHENTICATED || !this.accessToken) {
            this.stopHeartbeat();
            return { success: false, reason: 'Client unauthenticated.' };
        }

        const currentGen = this.heartbeatGeneration;
        const profileRes = await AuthClient.getProfile(this.accessToken);

        // Guard against late responses belonging to a previous session/generation
        if (currentGen !== this.heartbeatGeneration || this.state !== AUTH_STATES.AUTHENTICATED) {
            return { success: false, reason: 'Heartbeat response discarded due to state transition.' };
        }

        if (profileRes.isAborted) {
            return { success: false, isAborted: true, reason: 'Request was aborted.' };
        }

        if (profileRes.success && profileRes.user) {
            // Case 1: Remote server confirmed valid active authorization
            this.consecutiveNetworkErrors = 0;
            this.currentUser = profileRes.user;
            if (profileRes.license) {
                this.currentLicense = profileRes.license;
            }
            this._notify();
            return { success: true, user: this.currentUser, license: this.currentLicense };
        }

        if (profileRes.status === 401) {
            // Case 2: Access token expired. Attempt silent background refresh token renewal (v1.4.4)
            console.info('[Heartbeat] Access token expirado. Intentando renovación silenciosa...');
            const refreshToken = await SessionManager.getRefreshToken().catch(() => null);
            if (refreshToken) {
                const refreshRes = await AuthClient.refreshToken(refreshToken);
                if (refreshRes.success && refreshRes.accessToken) {
                    this.accessToken = refreshRes.accessToken;
                    const profileRetry = await AuthClient.getProfile(this.accessToken);
                    if (profileRetry.success && profileRetry.user) {
                        this.consecutiveNetworkErrors = 0;
                        this.currentUser = profileRetry.user;
                        if (profileRetry.license) this.currentLicense = profileRetry.license;
                        await this._syncWithLocalServer(this.accessToken, this.currentUser);
                        this._notify();
                        return { success: true, user: this.currentUser, license: this.currentLicense };
                    }
                }
                if (refreshRes.status === 401 || refreshRes.status === 403) {
                    console.warn('[Heartbeat] Sesión o refresh token revocados explícitamente por el servidor.');
                    await this.logout(false);
                    return { success: false, reason: refreshRes.error || 'Sesión expirada.' };
                }
            }
        } else if (profileRes.status === 403) {
            // Case 3: Explicit license/account suspension by admin
            console.warn('[Heartbeat] Licencia o cuenta revocada por el servidor:', profileRes.error);
            await this.logout(false);
            return { success: false, reason: profileRes.error };
        }

        // Case 4: Transient network failure (HTTP 500, status 0, timeout, Render cold start)
        // Keep session active indefinitely during live stream (v1.4.4 keep-alive)
        this.consecutiveNetworkErrors++;
        console.warn(`[Heartbeat] Falla de red o servidor en reposo (${this.consecutiveNetworkErrors}). Manteniendo sesión activa...`);
        return { success: false, isTransient: true, consecutiveErrors: this.consecutiveNetworkErrors };
    }

    /**
     * Perform login with email and password.
     */
    async login(email, password, rememberMe = true, onRetryStatus = null) {
        this.heartbeatGeneration++;
        const response = await AuthClient.login({ email, password }, onRetryStatus);

        if (!response.success) {
            return response;
        }

        this.accessToken = response.accessToken;
        this.currentUser = response.user;
        this.currentLicense = response.license || { plan: 'FREE', status: 'active' };
        this.state = AUTH_STATES.AUTHENTICATED;

        // Persist refresh token securely via safeStorage
        if (response.refreshToken) {
            await SessionManager.saveRefreshToken(response.refreshToken, rememberMe);
        }

        // Synchronize with local server.js
        await this._syncWithLocalServer(this.accessToken, this.currentUser);

        // Start heartbeat supervision
        this.startHeartbeat();

        this._notify();
        return { success: true, user: this.currentUser, license: this.currentLicense };
    }

    /**
     * Perform login with Google OIDC Token.
     */
    async loginWithGoogle(idToken, rememberMe = true) {
        this.heartbeatGeneration++;
        const response = await AuthClient.loginWithGoogle({ idToken });

        if (!response.success) {
            return response;
        }

        this.accessToken = response.accessToken;
        this.currentUser = response.user;
        this.currentLicense = response.license || { plan: 'FREE', status: 'active' };
        this.state = AUTH_STATES.AUTHENTICATED;

        // Persist refresh token securely via safeStorage
        if (response.refreshToken) {
            await SessionManager.saveRefreshToken(response.refreshToken, rememberMe);
        }

        // Synchronize with local server.js
        await this._syncWithLocalServer(this.accessToken, this.currentUser);

        // Start heartbeat supervision
        this.startHeartbeat();

        this._notify();
        return { success: true, user: this.currentUser, license: this.currentLicense };
    }

    /**
     * Attempt restoring session on application startup using stored refresh token.
     */
    async restoreSession() {
        this.heartbeatGeneration++;
        const refreshToken = await SessionManager.getRefreshToken();
        if (!refreshToken) {
            await this.logout(false);
            return { success: false, reason: 'No stored session.' };
        }

        const refreshRes = await AuthClient.refreshToken(refreshToken);
        if (!refreshRes.success || !refreshRes.accessToken) {
            if (refreshRes.status === 401 || refreshRes.status === 403) {
                await this.logout(false);
                return { success: false, reason: refreshRes.error || 'Session expired.' };
            }
            return { success: false, isTransient: true, reason: refreshRes.error || 'Transient network error.' };
        }

        this.accessToken = refreshRes.accessToken;

        // Verify profile to get latest user status & license
        const profileRes = await AuthClient.getProfile(this.accessToken);
        if (!profileRes.success || !profileRes.user) {
            if (profileRes.status === 401 || profileRes.status === 403) {
                await this.logout(false);
                return { success: false, reason: profileRes.error || 'User suspended or inactive.' };
            }
            return { success: false, isTransient: true, reason: profileRes.error || 'Transient network error.' };
        }

        this.currentUser = profileRes.user;
        this.currentLicense = profileRes.license || { plan: 'FREE', status: 'active' };
        this.state = AUTH_STATES.AUTHENTICATED;

        // Synchronize with local server.js
        await this._syncWithLocalServer(this.accessToken, this.currentUser);

        // Start heartbeat supervision
        this.startHeartbeat();

        this._notify();
        return { success: true, user: this.currentUser, license: this.currentLicense };
    }

    /**
     * Logout and destroy session cleanly.
     */
    async logout(notifyRemote = true) {
        AuthClient.abortInFlightRequests(); // Abort any in-flight HTTP requests
        this.heartbeatGeneration++; // Increment generation to invalidate late responses
        this.stopHeartbeat(); // Stop heartbeat timer cleanly

        if (notifyRemote) {
            const refreshToken = await SessionManager.getRefreshToken();
            await AuthClient.logout(this.accessToken, refreshToken);
        }

        await SessionManager.clearRefreshToken();
        this.accessToken = null;
        this.currentUser = null;
        this.currentLicense = null;
        this.state = AUTH_STATES.LOCKED;
        this.consecutiveNetworkErrors = 0;

        // Clear local server session
        await this._clearLocalServerSession();

        this._notify();
    }

    /**
     * Sync auth state with local server.js on port 3000
     */
    async _syncWithLocalServer(accessToken, user) {
        try {
            await fetch('/api/internal/set-auth-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken, user })
            });
        } catch (err) {
            console.error('Failed to sync auth state with local server:', err);
        }
    }

    /**
     * Clear local server auth state
     */
    async _clearLocalServerSession() {
        try {
            await fetch('/api/internal/clear-auth-session', {
                method: 'POST'
            });
        } catch (err) {
            console.error('Failed to clear local server session:', err);
        }
    }

    isAuthenticated() {
        return this.state === AUTH_STATES.AUTHENTICATED && !!this.accessToken;
    }
}

export const authState = new AuthStateManager();
