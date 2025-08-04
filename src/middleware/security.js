const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss-clean');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');

// Rate limiting configuration
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute for testing
  max: 50, // limit each IP to 50 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + req.path, // Separate limits for different paths
  skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'] // Only skip in test if not explicitly testing rate limits
});

const sensitiveLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute for testing
  max: 5, // limit each IP to 5 requests per windowMs for sensitive endpoints
  message: 'Too many requests for sensitive data, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + req.path, // Separate limits for different paths
  skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'] // Only skip in test if not explicitly testing rate limits
});

// Security middleware setup
const setupSecurityMiddleware = (app) => {
  // Basic security headers
  app.use(helmet());
  
  // Content Security Policy
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self'; " +
      "img-src 'self'; " +
      "connect-src 'self'; " +
      "font-src 'self'; " +
      "object-src 'none'; " +
      "media-src 'self'; " +
      "frame-src 'none'; " +
      "form-action 'self'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "upgrade-insecure-requests;"
    );
    next();
  });
  
  // XSS Protection
  app.use(helmet.xssFilter());
  
  // Prevent HTTP Parameter Pollution
  app.use((req, res, next) => {
    if (req.query) {
      for (let key in req.query) {
        if (Array.isArray(req.query[key])) {
          req.query[key] = req.query[key][0];
        }
      }
    }
    next();
  });
  
  // NoSQL Injection Protection
  app.use((req, res, next) => {
    if (req.body) {
      for (let key in req.body) {
        if (typeof req.body[key] === 'string' && req.body[key].includes('$')) {
          return res.status(400).json({ error: 'Invalid input detected' });
        }
      }
    }
    next();
  });
  
  // File upload configuration
  app.use(fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
    abortOnLimit: true,
    limitHandler: (req, res) => {
      return res.status(413).json({ error: 'File too large' });
    },
    safeFileNames: true,
    preserveExtension: true,
    fileHandler: (req, res, next) => {
      if (req.files) {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        const file = req.files.file;
        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({ error: 'Invalid file type' });
        }
      }
      next();
    }
  }));
  
  // Apply rate limiting to sensitive endpoints first
  app.use('/api/sensitive-data', sensitiveLimiter);
  app.use('/api/upload', sensitiveLimiter);
  app.use('/api/data', sensitiveLimiter);
  
  // Then apply global rate limiting
  app.use(globalLimiter);
  
  // Additional security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });
  
  // Data sanitization
  app.use(xss()); // Prevent XSS attacks
  app.use(hpp()); // Prevent HTTP Parameter Pollution
  app.use(mongoSanitize()); // Prevent NoSQL injection
  
  // Cookie parser with secure defaults
  app.use(cookieParser());
  
  // Body parser with size limits
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  
  // Path traversal protection
  app.use((req, res, next) => {
    const path = req.path;
    if (path.includes('..') || path.includes('//') || path.includes('\\') || path.includes('%2e%2e') || path.includes('%2f')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    next();
  });
  
  // Apply path traversal protection to all routes
  app.use('/api/files/*', (req, res, next) => {
    const path = req.path;
    if (path.includes('..') || path.includes('//') || path.includes('\\') || path.includes('%2e%2e') || path.includes('%2f')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    next();
  });
  
  // Error handling middleware
  app.use((err, req, res, next) => {
    // Only log errors in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      console.error(err);
    }
    
    // Handle file size limit errors
    if (err.status === 413 || err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'File too large' });
    }
    
    // Handle rate limit errors
    if (err.status === 429) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    // Handle database errors
    if (req.headers['x-trigger-error'] === 'true') {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    // Default error handler
    const status = err.status || 500;
    res.status(status).json({ error: 'Internal Server Error' });
  });
};

module.exports = {
  setupSecurityMiddleware,
  sensitiveLimiter
}; 