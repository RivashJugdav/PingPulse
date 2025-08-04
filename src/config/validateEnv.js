const Joi = require('joi');
const logger = require('../utils/logger');

// Define the validation schema
const envSchema = Joi.object({
  // Server settings
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number()
    .port()
    .default(3000),
  API_VERSION: Joi.string()
    .pattern(/^v\d+$/)
    .default('v1'),
  REQUEST_TIMEOUT: Joi.number()
    .integer()
    .min(1000)
    .max(30000)
    .default(5000),

  // MongoDB settings
  MONGODB_URI: Joi.string()
    .uri()
    .required()
    .messages({
      'string.uri': 'MONGODB_URI must be a valid MongoDB connection string',
      'any.required': 'MONGODB_URI is required'
    }),

  // Email settings
  EMAIL_USER: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'EMAIL_USER must be a valid email address',
      'any.required': 'EMAIL_USER is required'
    }),

  // JWT settings
  JWT_EXPIRATION: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('7d')
    .messages({
      'string.pattern.base': 'JWT_EXPIRATION must be in format: number followed by s(seconds), m(minutes), h(hours), or d(days)'
    }),

  // Logging settings
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'trace')
    .default('info'),

  // Secrets rotation settings
  SECRET_ROTATION_SCHEDULE: Joi.string()
    .pattern(/^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])) (\*|([0-6]))$/)
    .default('0 0 1 * *')
    .messages({
      'string.pattern.base': 'SECRET_ROTATION_SCHEDULE must be a valid cron expression'
    }),

  // Feature flags
  ENABLE_SWAGGER: Joi.boolean()
    .default(false),

  // Optional settings with defaults
  CORS_ORIGIN: Joi.string()
    .uri()
    .default('http://localhost:3000'),
  
  // Rate limiting settings
  RATE_LIMIT_WINDOW_MS: Joi.number()
    .integer()
    .min(1000)
    .default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number()
    .integer()
    .min(1)
    .default(60),
  RATE_LIMIT_AUTH_WINDOW_MS: Joi.number()
    .integer()
    .min(1000)
    .default(900000),
  RATE_LIMIT_AUTH_MAX_REQUESTS: Joi.number()
    .integer()
    .min(1)
    .default(5)
}).unknown(true); // Allow unknown env vars

/**
 * Validates environment variables against the schema
 * @returns {Object} Validated environment variables
 * @throws {Error} If validation fails
 */
const validateEnv = () => {
  const { error, value: validatedEnv } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    logger.error('Environment validation failed:', {
      errors: errorMessages
    });
    throw new Error(`Environment validation failed: ${errorMessages.join(', ')}`);
  }

  // Log validated environment (excluding sensitive data)
  const safeEnv = { ...validatedEnv };
  delete safeEnv.JWT_SECRET;
  delete safeEnv.EMAIL_PASSWORD;
  logger.info('Environment validated successfully', {
    environment: safeEnv
  });

  return validatedEnv;
};

module.exports = validateEnv; 