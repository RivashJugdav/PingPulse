const { v4: uuidv4 } = require('uuid');
const { logSecurityEvent } = require('../utils/securityLogger');

/**
 * Middleware to add request ID to all requests
 * Generates a UUID v4 if not provided in headers
 * Adds request ID to request object and response headers
 */
const requestId = (req, res, next) => {
  // Get request ID from headers or generate new one
  const requestId = req.headers['x-request-id'] || uuidv4();
  
  // Add request ID to request object
  req.id = requestId;
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Log request ID generation
  logSecurityEvent('info', 'REQUEST_ID_GENERATED', {
    requestId,
    source: req.headers['x-request-id'] ? 'HEADER' : 'GENERATED'
  }, req);
  
  next();
};

module.exports = requestId; 