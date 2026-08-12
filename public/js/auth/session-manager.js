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
     */
    static async saveRefreshToken(refreshToken) {
        if (!refreshToken) return;
        inMemoryRefreshToken = refreshToken;

        if (window.electronBridge && typeof window.electronBridge.saveSecureToken === 'function') {
            await window.electronBridge.saveSecureToken('refresh_token', refreshToken);
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
        return inMemoryRefreshToken;
    }

    /**
     * Delete stored Refresh Token on logout or session revocation.
     */
    static async clearRefreshToken() {
        inMemoryRefreshToken = null;
        if (window.electronBridge && typeof window.electronBridge.deleteSecureToken === 'function') {
            await window.electronBridge.deleteSecureToken('refresh_token');
        }
    }
}
