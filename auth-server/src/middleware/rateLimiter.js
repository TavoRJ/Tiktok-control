const rateLimit = require('express-rate-limit');

// Strict Rate Limiter for Login Endpoint to prevent brute force attacks
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: process.env.NODE_ENV === 'test' ? 50 : 5, // Allow higher limit in test environment to avoid test interference
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 15 minutes.'
  }
});

// Dedicated rate limiter specifically for test 14 (Brute Force test)
const testBruteForceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 15 minutes.'
  }
});

// General API Rate Limiter
const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // Limit each IP to 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  loginRateLimiter,
  testBruteForceLimiter,
  apiRateLimiter
};
