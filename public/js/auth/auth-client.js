/**
 * auth-client.js
 * Client wrapper for communicating with TavLive Remote Authentication API
 * featuring HTTP 401 Interceptor for automatic background token refresh,
 * AbortController support, Cold Start retries for Render instances,
 * and robust error handling.
 */
import { SessionManager } from './session-manager.js';

export const AUTH_SERVER_URL = window.AUTH_SERVER_URL || 'https://tavlive-auth-server.onrender.com';

let activeAbortController = null;
let isRefreshingToken = false;
let refreshQueue = [];

export class AuthClient {
    /**
     * Cancel any active in-flight authentication requests.
     */
    static abortInFlightRequests() {
        if (activeAbortController) {
            try {
                activeAbortController.abort();
            } catch (e) {}
            activeAbortController = null;
        }
    }

    static _createSignal() {
        this.abortInFlightRequests();
        activeAbortController = new AbortController();
        return activeAbortController.signal;
    }

    /**
     * Authenticate user credentials with silent background Cold Start retries.
     */
    static async login({ tiktokUsername, email, identifier, password, deviceIdentifier = 'TAVLIVE-DESKTOP-CLIENT', deviceName = 'Desktop PC', osPlatform = 'win32' }) {
        const signal = this._createSignal();
        const targetIdentifier = tiktokUsername || identifier || email;
        const maxRetries = 4;
        const retryDelayMs = 3000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(`${AUTH_SERVER_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tiktokUsername: targetIdentifier, email: targetIdentifier, identifier: targetIdentifier, password, deviceIdentifier, deviceName, osPlatform }),
                    signal
                });

                // Render Cold Start HTTP 502 / 503 / 504 silent retry
                if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, retryDelayMs));
                    continue;
                }

                const data = await response.json().catch(() => ({ success: false, error: 'Respuesta inválida del servidor.' }));

                if (!response.ok) {
                    return {
                        success: false,
                        status: response.status,
                        error: data.error || 'Error de autenticación.',
                        details: data.details || null
                    };
                }

                return data;
            } catch (err) {
                if (err.name === 'AbortError') {
                    return { success: false, status: -1, isAborted: true, error: 'Request aborted.' };
                }

                // Silent network error retry for Render instance cold start
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, retryDelayMs));
                    continue;
                }

                return {
                    success: false,
                    status: 0,
                    error: 'Servidor de autenticación no disponible. Verifica tu conexión.'
                };
            }
        }
    }

    static async loginWithGoogle({ idToken, deviceIdentifier = 'TAVLIVE-DESKTOP-CLIENT', deviceName = 'Desktop PC', osPlatform = 'win32' }) {
        const signal = this._createSignal();
        try {
            const response = await fetch(`${AUTH_SERVER_URL}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, deviceIdentifier, deviceName, osPlatform }),
                signal
            });

            const data = await response.json().catch(() => ({ success: false, error: 'Respuesta inválida del servidor.' }));

            if (!response.ok) {
                return {
                    success: false,
                    status: response.status,
                    error: data.error || 'Error de autenticación con Google.'
                };
            }

            return data;
        } catch (err) {
            if (err.name === 'AbortError') {
                return { success: false, status: -1, isAborted: true, error: 'Request aborted.' };
            }
            return {
                success: false,
                status: 0,
                error: 'Servidor de autenticación no disponible.'
            };
        }
    }

    /**
     * Get User Profile with 401 Interceptor and Automatic Token Renewal
     */
    static async getProfile(accessToken) {
        const signal = this._createSignal();
        try {
            let response = await fetch(`${AUTH_SERVER_URL}/api/auth/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                signal
            });

            // 401 Interceptor: If access token expired, attempt silent refresh
            if (response.status === 401) {
                console.info('[AuthClient] 401 Unauthorized recibido en /me. Intentando auto-refresh silencioso...');
                const refreshToken = await SessionManager.getRefreshToken();
                if (refreshToken) {
                    const refreshRes = await this.refreshToken(refreshToken);
                    if (refreshRes.success && refreshRes.accessToken) {
                        console.info('[AuthClient] Token renovado con éxito. Reintentando consulta de perfil...');
                        // Retry request with new token
                        response = await fetch(`${AUTH_SERVER_URL}/api/auth/me`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${refreshRes.accessToken}`
                            },
                            signal
                        });
                        const retryData = await response.json().catch(() => ({ success: false }));
                        if (response.ok && retryData.success) {
                            retryData.accessToken = refreshRes.accessToken; // Attach new token
                            return retryData;
                        }
                    }
                }
            }

            const data = await response.json().catch(() => ({ success: false, error: 'Respuesta inválida del servidor.' }));

            if (!response.ok) {
                return {
                    success: false,
                    status: response.status,
                    error: data.error || 'Sesión expirada o no válida.'
                };
            }

            return data;
        } catch (err) {
            if (err.name === 'AbortError') {
                return { success: false, status: -1, isAborted: true, error: 'Request aborted.' };
            }
            return {
                success: false,
                status: 0,
                error: 'Error de red al consultar estado de sesión.'
            };
        }
    }

    /**
     * Refresh Access Token using stored Refresh Token
     */
    static async refreshToken(refreshToken) {
        const signal = this._createSignal();
        try {
            const response = await fetch(`${AUTH_SERVER_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
                signal
            });

            const data = await response.json().catch(() => ({ success: false, error: 'Respuesta inválida del servidor.' }));

            if (!response.ok) {
                return {
                    success: false,
                    status: response.status,
                    error: data.error || 'Refresh token expirado o no válido.'
                };
            }

            return data;
        } catch (err) {
            if (err.name === 'AbortError') {
                return { success: false, status: -1, isAborted: true, error: 'Request aborted.' };
            }
            return {
                success: false,
                status: 0,
                error: 'Error de red al refrescar token.'
            };
        }
    }

    static async logout(accessToken, refreshToken) {
        const signal = this._createSignal();
        try {
            await fetch(`${AUTH_SERVER_URL}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ refreshToken }),
                signal
            }).catch(() => {});
        } catch (e) {}
    }
}
