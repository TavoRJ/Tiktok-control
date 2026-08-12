const config = require('../config');

/**
 * Service for verifying Google OAuth 2.0 / OpenID Connect tokens & PKCE exchanges.
 * All Google identity validation happens strictly on the backend.
 */
const googleAuthService = {
  /**
   * Verify Google ID Token or mock ID Token payload in test mode.
   * @param {string} idToken 
   * @returns {Promise<{ sub: string, email: string, name: string, picture?: string }>}
   */
  async verifyIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
      throw new Error('Invalid or missing Google ID Token.');
    }

    // Handle mock tokens for automated test suites
    if (process.env.NODE_ENV === 'test' && idToken.startsWith('mock_google_token:')) {
      try {
        const jsonStr = idToken.replace('mock_google_token:', '');
        const mockPayload = JSON.parse(jsonStr);
        return {
          sub: mockPayload.sub || '109876543219876543210',
          email: mockPayload.email ? mockPayload.email.toLowerCase().trim() : 'google_test_user@gmail.com',
          name: mockPayload.name || 'Google Streamer User',
          email_verified: true
        };
      } catch (e) {
        throw new Error('Invalid mock token format.');
      }
    }

    try {
      // Validate ID Token directly with Google's OIDC TokenInfo API
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!response.ok) {
        throw new Error('Google ID Token validation failed.');
      }

      const payload = await response.json();

      // 1. Verify Issuer
      if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
        throw new Error('Invalid token issuer (must be Google).');
      }

      // 2. Verify Audience (Client ID)
      if (config.GOOGLE_CLIENT_ID && payload.aud !== config.GOOGLE_CLIENT_ID) {
        throw new Error('Invalid token audience (Client ID mismatch).');
      }

      // 3. Verify Email Verification
      if (payload.email_verified !== true && payload.email_verified !== 'true') {
        throw new Error('Google account email is not verified.');
      }

      // 4. Verify Expiration
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp && parseInt(payload.exp, 10) < nowSeconds) {
        throw new Error('Google ID Token has expired.');
      }

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        name: payload.name || payload.email.split('@')[0],
        picture: payload.picture || null
      };
    } catch (err) {
      throw new Error(`Google authentication failed: ${err.message}`);
    }
  }
};

module.exports = googleAuthService;
