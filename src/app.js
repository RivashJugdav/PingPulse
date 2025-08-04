// src/app.js
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const dotenvSafe = require('dotenv-safe');
const logger = require('./utils/logger');
const {
  logAuthFailure,
  logAuthSuccess,
  logRateLimitExceeded,
  logCorsViolation,
  logRequestTimeout,
  logValidationError,
  SecurityEventType
} = require('./utils/securityLogger');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { globalRateLimiter } = require('./middleware/auth');
const timeout = require('connect-timeout');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const responseTime = require('response-time');
const validateEnv = require('./config/validateEnv');
const requestId = require('./middleware/requestId');
const { setupSecurityMiddleware } = require('./middleware/security');
const cookieParser = require('cookie-parser');

// Load and validate environment variables
dotenvSafe.config({
  allowEmptyValues: true,
  example: path.resolve(__dirname, '../.env.example')
});

// Validate environment variables
const env = validateEnv();

// Initialize Express app
const app = express();

// Force HTTPS in production
if (env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Check if the request is secure or if the 'X-Forwarded-Proto' header is 'https'
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    
    if (!isSecure) {
      // Get host from the request
      const host = req.get('host');
      // Redirect to https
      const redirectUrl = `https://${host}${req.originalUrl}`;
      // Use 301 for permanent redirect
      return res.redirect(301, redirectUrl);
    }
    
    // Set HSTS header for HTTPS requests
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    next();
  });
}

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", 'data:', "developers.google.com"],
      connectSrc: ["'self'", "oauth2.googleapis.com", "www.googleapis.com"],
      fontSrc: ["'self'", "cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      upgradeInsecureRequests: [], // For production this will force HTTPS
      blockAllMixedContent: [] // Prevent mixed content (HTTP on HTTPS page)
    },
  },
  hsts: {
    maxAge: 63072000, // 2 years in seconds
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  dnsPrefetchControl: true,
  ieNoOpen: true,
  hidePoweredBy: true,
  // Disable Cross-Origin Embedder Policy to allow Google images
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  expectCt: {
    enforce: true,
    maxAge: 86400 // 1 day in seconds
  }
}));

// Additional security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Add public key pinning header for HTTPS connections (HPKP)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    // Note: You'll need to generate and replace these SHA256 hashes for your actual certificates
    res.setHeader('Public-Key-Pins', 
      'pin-sha256="base64+primary=="; ' +
      'pin-sha256="base64+backup=="; ' +
      'max-age=5184000; includeSubDomains');
  }
  
  next();
});

// Body parsers
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Cookie parser for reading cookies (required for CSRF tokens and Google OAuth)
app.use(cookieParser());

// Request ID middleware (should be one of the first middleware)
app.use(requestId);

// Define allowed origins
// Previous allowed origins
// const allowedOrigins = ['https://yourdomain.com', 'https://www.yourdomain.com'];
const allowedOrigins = [env.CORS_ORIGIN];
if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
  allowedOrigins.push('http://localhost:3000');
}

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400,
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Rate limiting
// General API rate limit
const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: { message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? `${req.ip}-${req.user.id}` : req.ip;
  },
  skipSuccessfulRequests: false,
  skip: (req) => env.NODE_ENV === 'test',
  handler: (req, res) => {
    logRateLimitExceeded({
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.path,
      limit: env.RATE_LIMIT_MAX_REQUESTS,
      windowMs: env.RATE_LIMIT_WINDOW_MS
    }, req);
    res.status(429).json({ message: 'Too many requests from this IP, please try again later.' });
  }
});

// Stricter auth route limiting
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX_REQUESTS,
  message: { message: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.NODE_ENV === 'test',
  handler: (req, res) => {
    logRateLimitExceeded({
      ip: req.ip,
      endpoint: req.path,
      limit: env.RATE_LIMIT_AUTH_MAX_REQUESTS,
      windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
      type: 'auth'
    }, req);
    res.status(429).json({ message: 'Too many login attempts, please try again later.' });
  }
});

// Apply rate limiters to routes
app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);

// Simple logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Add debugging middleware for ping-services routes
app.use('/api/ping-services', (req, res, next) => {
  logger.info(`PING SERVICE API CALL: ${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    body: req.body,
    headers: req.headers.authorization ? 'Auth header present' : 'No auth header'
  });
  next();
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ping-services', require('./routes/ping'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/ping', require('./routes/ping'));
app.use('/api/security', require('./routes/security'));

// Add Swagger documentation only in development mode
if (env.NODE_ENV === 'development' && env.ENABLE_SWAGGER) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// Default route
app.get('/', (req, res) => {
  res.json({ message: 'Ping Service API is running' });
});

// Health check route
app.get('/health', async (req, res) => {
  const healthcheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    mongoConnection: mongoose.connection.readyState === 1,
    cpuUsage: process.cpuUsage(),
    environment: env.NODE_ENV,
    version: process.env.npm_package_version,
    externalServices: {
      // Add checks for any external services you depend on
    }
  };
  
  try {
    // Add any async health checks here
    res.status(200).json(healthcheck);
  } catch (error) {
    healthcheck.status = 'unhealthy';
    healthcheck.error = error.message;
    res.status(503).json(healthcheck);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  
  // Check if error is a CORS error
  if (err.message.includes('CORS')) {
    return res.status(403).json({
      message: 'CORS policy violation'
    });
  }
  
  res.status(err.status || 500).json({
    message: 'An error occurred',
    error: env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Add request timeout middleware
app.use(timeout(`${env.REQUEST_TIMEOUT}ms`));

// Add timeout error handler
app.use((req, res, next) => {
  if (!req.timedout) next();
});

// Add timeout error logging
app.use((req, res, next) => {
  req.on('timeout', () => {
    logRequestTimeout({
      timeout: env.REQUEST_TIMEOUT,
      endpoint: req.path,
      method: req.method
    }, req);
  });
  next();
});

// Add request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Add validation middleware
app.use((req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logValidationError({
      errors: errors.array(),
      endpoint: req.path,
      method: req.method
    }, req);
    return res.status(400).json({ errors: errors.array() });
  }
  next();
});

// Add response time monitoring
app.use(responseTime((req, res, time) => {
  logger.info(`${req.method} ${req.url} - ${time}ms`);
}));

// Apply security middleware
setupSecurityMiddleware(app);

// Previous graceful shutdown code
/*
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Performing graceful shutdown...');
  
  // Close server first
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connection
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      
      // Close any other connections (Redis, etc.)
      // Add your cleanup code here
      
      process.exit(0);
    });
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
});
*/

module.exports = app;