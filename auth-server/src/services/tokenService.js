const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const tokenService = {
  /**
   * Issue a short-lived Access Token (JWT)
   * @param {Object} payload 
   * @returns {string} JWT Token
   */
  generateAccessToken(payload) {
    return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN
    });
  },

  /**
   * Issue a high-entropy Refresh Token
   * @returns {string} Raw refresh token
   */
  generateRefreshToken() {
    return crypto.randomBytes(40).toString('hex');
  },

  /**
   * Hash Refresh Token using SHA-256 so raw tokens are NEVER stored in DB
   * @param {string} rawRefreshToken 
   * @returns {string} SHA-256 hex string
   */
  hashRefreshToken(rawRefreshToken) {
    return crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  },

  /**
   * Verify Access Token JWT
   * @param {string} token 
   * @returns {Object|null}
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, config.JWT_ACCESS_SECRET);
    } catch (err) {
      return null;
    }
  }
};

module.exports = tokenService;
