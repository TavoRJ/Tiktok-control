/**
 * session-manager.js
 * Dual Redundant Secure Storage for Refresh Tokens using Electron's native safeStorage API via IPC
 * with localStorage fallback for 100% session persistence reliability.
 */
let inMemoryRefreshToken = null;

export class SessionManager {
    /**
     * Save Refresh Token securely using OS safeStorage AND localStorage fallback.
     * @param {string} refreshToken 
     * @param {boolean} rememberMe 
     */
    static async saveRefreshToken(refreshToken, rememberMe = true) {
        if (!refreshToken) return;
        inMemoryRefreshToken = refreshToken;

        if (rememberMe) {
            try {
                localStorage.setItem('tavlive_remember_me', 'true');
                localStorage.setItem('tavlive_refresh_token', refreshToken);
            } catch (e) {}

            if (window.electronBridge && typeof window.electronBridge.saveSecureToken === 'function') {
                try {
                    await window.electronBridge.saveSecureToken('refresh_token', refreshToken);
                } catch (e) {
                    console.warn('[SessionManager] safeStorage save warning:', e);
                }
            }
        } else {
            try {
                localStorage.setItem('tavlive_remember_me', 'false');
            } catch (e) {}
        }
    }

    /**
     * Retrieve Refresh Token with dual-fallback strategy.
     * @returns {Promise<string|null>}
     */
    static async getRefreshToken() {
        if (inMemoryRefreshToken) return inMemoryRefreshToken;

        if (window.electronBridge && typeof window.electronBridge.getSecureToken === 'function') {
            try {
                const encryptedToken = await window.electronBridge.getSecureToken('refresh_token');
                if (encryptedToken && encryptedToken.trim().length > 0) {
                    inMemoryRefreshToken = encryptedToken;
                    return encryptedToken;
                }
            } catch (e) {
                console.warn('[SessionManager] safeStorage read warning:', e);
            }
        }

        try {
            const stored = localStorage.getItem('tavlive_refresh_token');
            if (stored && stored.trim().length > 0) {
                inMemoryRefreshToken = stored;
                return stored;
            }
        } catch (e) {}

        return null;
    }

    /**
     * Delete stored Refresh Token on logout or session revocation.
     */
    static async clearRefreshToken() {
        inMemoryRefreshToken = null;
        try {
            localStorage.removeItem('tavlive_refresh_token');
            localStorage.removeItem('tavlive_remember_me');
        } catch (e) {}

        if (window.electronBridge && typeof window.electronBridge.deleteSecureToken === 'function') {
            try {
                await window.electronBridge.deleteSecureToken('refresh_token');
            } catch (e) {}
        }
    }
}
