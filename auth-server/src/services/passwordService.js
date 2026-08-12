const crypto = require('crypto');
const { argon2id } = require('hash-wasm');

/**
 * Service for secure password hashing and verification using Argon2id.
 */
const passwordService = {
  /**
   * Hash password using Argon2id with random salt and standard parameters.
   * @param {string} password 
   * @returns {Promise<string>} Encoded Argon2id hash string ($argon2id$v=19$m=65536,t=3,p=1$...)
   */
  async hashPassword(password) {
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const salt = crypto.randomBytes(16); // 128-bit salt
    const hash = await argon2id({
      password,
      salt,
      parallelism: 1,
      memorySize: 65536, // 64 MB memory
      iterations: 3,      // 3 passes
      hashLength: 32,     // 256-bit hash
      outputType: 'encoded'
    });

    return hash;
  },

  /**
   * Verify password against an Argon2id hash.
   * @param {string} password 
   * @param {string} storedHash 
   * @returns {Promise<boolean>}
   */
  async verifyPassword(password, storedHash) {
    if (!password || !storedHash) return false;
    try {
      // Parse encoded Argon2id PHC format string: $argon2id$v=19$m=65536,t=3,p=1$salt$hash
      const parts = storedHash.split('$');
      if (parts.length < 6 || parts[1] !== 'argon2id') {
        return false;
      }

      const paramsStr = parts[3]; // e.g. m=65536,t=3,p=1
      const params = {};
      paramsStr.split(',').forEach((p) => {
        const [k, v] = p.split('=');
        params[k] = parseInt(v, 10);
      });

      // Extract raw salt from base64 string or regenerate
      const saltB64 = parts[4];
      const saltBuffer = Buffer.from(saltB64, 'base64');

      const newHash = await argon2id({
        password,
        salt: saltBuffer,
        parallelism: params.p || 1,
        memorySize: params.m || 65536,
        iterations: params.t || 3,
        hashLength: 32,
        outputType: 'encoded'
      });

      // Constant-time buffer comparison to prevent timing attacks
      const b1 = Buffer.from(newHash);
      const b2 = Buffer.from(storedHash);

      if (b1.length !== b2.length) return false;
      return crypto.timingSafeEqual(b1, b2);
    } catch (err) {
      return false;
    }
  }
};

module.exports = passwordService;
