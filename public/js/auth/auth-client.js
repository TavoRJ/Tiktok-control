/**
 * auth-client.js
 * Client wrapper for communicating with TavLive Remote Authentication API
 * featuring AbortController support for cancelling in-flight requests.
 */
export const AUTH_SERVER_URL = window.AUTH_SERVER_URL || 'http://127.0.0.1:4000';

let activeAbortController = null;

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

    static async login({ tiktokUsername, email, identifier, password, deviceIdentifier = 'TAVLIVE-DESKTOP-CLIENT', deviceName = 'Desktop PC', osPlatform = 'win32' }) {
        const signal = this._createSignal();
        try {
            const targetIdentifier = tiktokUsername || identifier || email;
            const response = await fetch(`${AUTH_SERVER_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tiktokUsername: targetIdentifier, email: targetIdentifier, identifier: targetIdentifier, password, deviceIdentifier, deviceName, osPlatform }),
                signal
            });

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
            return {
                success: false,
                status: 0,
                error: 'Servidor de autenticación no disponible. Verifica tu conexión.'
            };
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

    static async getProfile(accessToken) {
        const signal = this._createSignal();
        try {
            const response = await fetch(`${AUTH_SERVER_URL}/api/auth/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                signal
            });

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
