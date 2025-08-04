const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log rotation configuration
const rotationConfig = {
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m', // Rotate when file reaches 20MB
  maxFiles: '14d', // Keep logs for 14 days
  zippedArchive: true, // Compress old log files
  createSymlink: true, // Create symlink to latest log file
  symlinkName: 'latest.log'
};

// Create the logger with rotation
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // All security events
    new DailyRotateFile({
      ...rotationConfig,
      filename: path.join(logsDir, 'security-%DATE%.log'),
      level: 'info'
    }),
    // High severity events only
    new DailyRotateFile({
      ...rotationConfig,
      filename: path.join(logsDir, 'security-error-%DATE%.log'),
      level: 'error'
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Define security event types
const SecurityEventType = {
  AUTH_FAILURE: 'AUTH_FAILURE',
  AUTH_SUCCESS: 'AUTH_SUCCESS',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CORS_VIOLATION: 'CORS_VIOLATION',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  SECRET_ROTATION: 'SECRET_ROTATION',
  IP_BLOCKED: 'IP_BLOCKED',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUEST_ID_GENERATED: 'REQUEST_ID_GENERATED'
};

// Define security event severity levels
const SecuritySeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Log a security event with structured data
 * @param {string} level - Severity level of the event
 * @param {string} eventType - Type of security event
 * @param {Object} data - Additional event data
 * @param {Object} req - Express request object (optional)
 */
const logSecurityEvent = (level, eventType, data = {}, req = null) => {
  const logData = {
    eventType,
    severity: level,
    ...data,
    timestamp: new Date().toISOString()
  };

  // Add request data if available
  if (req) {
    logData.requestContext = {
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      referer: req.get('referer'),
      origin: req.get('origin')
    };
  }

  logger.log(level, JSON.stringify(logData));
};

/**
 * Log authentication failures
 * @param {Object} data - Authentication failure data
 * @param {Object} req - Express request object
 */
const logAuthFailure = (data, req) => {
  logSecurityEvent('error', SecurityEventType.AUTH_FAILURE, data, req);
};

/**
 * Log successful authentication
 * @param {Object} data - Authentication success data
 * @param {Object} req - Express request object
 */
const logAuthSuccess = (data, req) => {
  logSecurityEvent('info', SecurityEventType.AUTH_SUCCESS, data, req);
};

/**
 * Log rate limit exceeded events
 * @param {Object} data - Rate limit data
 * @param {Object} req - Express request object
 */
const logRateLimitExceeded = (data, req) => {
  logSecurityEvent('info', SecurityEventType.RATE_LIMIT_EXCEEDED, data, req);
};

/**
 * Log CORS violations
 * @param {Object} data - CORS violation data
 * @param {Object} req - Express request object
 */
const logCorsViolation = (data, req) => {
  logSecurityEvent('info', SecurityEventType.CORS_VIOLATION, data, req);
};

/**
 * Log token-related security events
 * @param {string} eventType - Token event type
 * @param {Object} data - Token event data
 * @param {Object} req - Express request object
 */
const logTokenEvent = (eventType, data, req) => {
  logSecurityEvent('error', eventType, data, req);
};

/**
 * Log suspicious activity
 * @param {Object} data - Suspicious activity data
 * @param {Object} req - Express request object
 */
const logSuspiciousActivity = (data, req) => {
  logSecurityEvent('error', SecurityEventType.SUSPICIOUS_ACTIVITY, data, req);
};

/**
 * Log secret rotation events
 * @param {Object} data - Secret rotation data
 */
const logSecretRotation = (data) => {
  logSecurityEvent('info', SecurityEventType.SECRET_ROTATION, data);
};

/**
 * Log IP blocking events
 * @param {Object} data - IP blocking data
 * @param {Object} req - Express request object
 */
const logIpBlocked = (data, req) => {
  logSecurityEvent('error', SecurityEventType.IP_BLOCKED, data, req);
};

/**
 * Log request timeout events
 * @param {Object} data - Timeout data
 * @param {Object} req - Express request object
 */
const logRequestTimeout = (data, req) => {
  logSecurityEvent('info', SecurityEventType.REQUEST_TIMEOUT, data, req);
};

/**
 * Log validation errors
 * @param {Object} data - Validation error data
 * @param {Object} req - Express request object
 */
const logValidationError = (data, req) => {
  logSecurityEvent('info', SecurityEventType.VALIDATION_ERROR, data, req);
};

module.exports = {
  logger,
  SecurityEventType,
  SecuritySeverity,
  logSecurityEvent,
  logAuthFailure,
  logAuthSuccess,
  logRateLimitExceeded,
  logCorsViolation,
  logTokenEvent,
  logSuspiciousActivity,
  logSecretRotation,
  logIpBlocked,
  logRequestTimeout,
  logValidationError
}; 