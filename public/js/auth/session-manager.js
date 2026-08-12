/**
 * session-manager.js
 * Handles secure storage of Refresh Tokens using Electron's native safeStorage API via IPC.
 * Ensures sensitive tokens are encrypted using OS-level DPAPI on Windows.
 */
let inMemoryRefreshToken = null;

export class SessionManager {
    /**
     * Save Refresh Token securely using OS safeStorage if available.
     * @param {string} refreshToken 
     * @param {boolean} rememberMe 
     */
    static async saveRefreshToken(refreshToken, rememberMe = true) {
        if (!refreshToken) return;
        inMemoryRefreshToken = refreshToken;

        if (rememberMe) {
            try {
                localStorage.setItem('tavlive_remember_me', 'true');
            } catch (e) {}

            if (window.electronBridge && typeof window.electronBridge.saveSecureToken === 'function') {
                await window.electronBridge.saveSecureToken('refresh_token', refreshToken);
            } else {
                try {
                    localStorage.setItem('tavlive_refresh_token', refreshToken);
                } catch (e) {}
            }
        } else {
            try {
                localStorage.setItem('tavlive_remember_me', 'false');
            } catch (e) {}
        }
    }

    /**
     * Retrieve encrypted Refresh Token.
     * @returns {Promise<string|null>}
     */
    static async getRefreshToken() {
        if (window.electronBridge && typeof window.electronBridge.getSecureToken === 'function') {
            const encryptedToken = await window.electronBridge.getSecureToken('refresh_token');
            if (encryptedToken) {
                inMemoryRefreshToken = encryptedToken;
                return encryptedToken;
            }
        }
        try {
            const stored = localStorage.getItem('tavlive_refresh_token');
            if (stored) return stored;
        } catch (e) {}

        return inMemoryRefreshToken;
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
            await window.electronBridge.deleteSecureToken('refresh_token');
        }
    }
}
