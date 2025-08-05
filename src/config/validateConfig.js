const Joi = require('joi');
const logger = require('../utils/logger');

// Define the configuration schema
const configSchema = Joi.object({
  // Server configuration
  server: Joi.object({
    port: Joi.number().port().required(),
    nodeEnv: Joi.string().valid('development', 'production', 'test').required(),
    apiVersion: Joi.string().pattern(/^v\d+$/).required(),
    requestTimeout: Joi.number().integer().min(1000).max(30000).required(),
    enableSwagger: Joi.boolean().required(),
  }).required(),

  // Database configuration
  database: Joi.object({
    uri: Joi.string().uri().required(),
    options: Joi.object({
      useNewUrlParser: Joi.boolean().required(),
      useUnifiedTopology: Joi.boolean().required(),
    }).required(),
  }).required(),

  // Email configuration
  email: Joi.object({
    user: Joi.string().email().required(),
    password: Joi.string().min(1).required(),
  }).required(),

  // JWT configuration
  jwt: Joi.object({
    secret: Joi.string().required(),
    expiration: Joi.string().pattern(/^\d+[smhd]$/).required(),
  }).required(),

  // Logging configuration
  logging: Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').required(),
  }).required(),

  // Security configuration
  security: Joi.object({
    corsOrigin: Joi.string().uri().required(),
    rateLimit: Joi.object({
      windowMs: Joi.number().integer().min(1000).required(),
      maxRequests: Joi.number().integer().min(1).required(),
      authWindowMs: Joi.number().integer().min(1000).required(),
      authMaxRequests: Joi.number().integer().min(1).required(),
    }).required(),
  }).required(),

  // Secrets rotation configuration
  secrets: Joi.object({
    rotationSchedule: Joi.string().pattern(/^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])) (\*|([0-6]))$/).required(),
  }).required(),
});

/**
 * Validates the application configuration
 * @returns {Object} Validated configuration object
 * @throws {Error} If validation fails
 */
const validateConfig = () => {
  const config = {
    server: {
      port: parseInt(process.env.PORT, 10),
      nodeEnv: process.env.NODE_ENV,
      apiVersion: process.env.API_VERSION,
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10),
      enableSwagger: process.env.ENABLE_SWAGGER === 'true',
    },
    database: {
      uri: process.env.MONGODB_URI,
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      },
    },
    email: {
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASSWORD,
    },
    jwt: {
      secret: (() => {
        try {
          const secretsPath = require('path').join(__dirname, '../../secrets.json');
          const secrets = require(secretsPath);
          return secrets.jwt.current;
        } catch (error) {
          return process.env.JWT_SECRET;
        }
      })(),
      expiration: process.env.JWT_EXPIRATION,
    },
    logging: {
      level: process.env.LOG_LEVEL,
    },
    security: {
      corsOrigin: process.env.CORS_ORIGIN,
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10),
        authWindowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 10),
        authMaxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS, 10),
      },
    },
    secrets: {
      rotationSchedule: process.env.SECRET_ROTATION_SCHEDULE,
    },
  };

  const { error, value: validatedConfig } = configSchema.validate(config, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    logger.error('Configuration validation failed:', {
      errors: errorMessages,
    });
    throw new Error(`Configuration validation failed: ${errorMessages.join(', ')}`);
  }

  // Log validated configuration (excluding sensitive data)
  const safeConfig = { ...validatedConfig };
  delete safeConfig.email.password;
  delete safeConfig.jwt.secret;
  logger.info('Configuration validated successfully', {
    config: safeConfig,
  });

  return validatedConfig;
};

module.exports = validateConfig; 