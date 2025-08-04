const { logValidationError } = require('../utils/securityLogger');

/**
 * Error handler middleware
 * Formats error responses consistently
 */
const errorHandler = (err, req, res, next) => {
  // Log validation errors
  if (err.name === 'ValidationError') {
    logValidationError({
      errors: err.errors,
      message: err.message
    }, req);
  }

  // Default error status and message
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  // Create error response
  const errorResponse = {
    message,
    code: err.code || 'INTERNAL_ERROR',
    requestId: req.id // Include request ID in error response
  };

  // Add validation errors if present
  if (err.errors) {
    errorResponse.errors = err.errors;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(status).json(errorResponse);
};

module.exports = { errorHandler }; 