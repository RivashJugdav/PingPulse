const rateLimit = require('express-rate-limit');

// Rate limiter for auth endpoints (login, register)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many auth attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for password reset endpoints
const resetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 requests per windowMs
  message: 'Too many password reset attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for manual pings
const manualPingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each user to 10 manual pings per windowMs
  message: 'Too many manual pings, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authRateLimiter,
  resetRateLimiter,
  manualPingLimiter
}; 