const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { verifyTokenWithRotation, TEST_JWT_SECRET } = require('../mocks/jwt');
const multer = require('multer');
const path = require('path');

const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

const createTestApp = () => {
  const app = express();
  
  // Apply raw body parser specifically for the route FIRST
  app.use('/api/security/data', express.raw({ type: 'application/json' }));

  // Basic middleware (now after the raw parser for the specific route)
  app.use(express.json({ prototypePoisoning: 'allow' }));
  app.use(cors());
  app.use(helmet());

  // Mock auth middleware for tests - replaces the protect middleware in routes
  app.use(async (req, res, next) => {
    try {
      // Option 1: Direct user object in header (for simpler tests)
      if (req.headers.user) {
        req.user = JSON.parse(req.headers.user);
        return next();
      } 
      // Option 2: JWT token in Authorization header (for more realistic tests)
      else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        const token = req.headers.authorization.split(' ')[1];
        try {
          // Use verifyTokenWithRotation for consistency with the actual auth middleware
          const decoded = await verifyTokenWithRotation(token);
          
          if (decoded) {
            // In test environment, create a user object from the decoded token
            req.user = {
              _id: decoded.id,
              email: decoded.email,
              role: decoded.role || 'user',
              subscription: { 
                plan: decoded.plan || 'free',
                active: true
              }
            };
            return next();
          }
        } catch (error) {
          return res.status(401).json({ message: 'Authentication failed - invalid token' });
        }
      }
      
      // If no auth was found and we get to this point, return 401
      if (req.path.startsWith('/api/dashboard') || req.path.startsWith('/api/admin') || req.path.startsWith('/api/security/protected-route')) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
      }
      
      next();
    } catch (error) {
      next(error);
    }
  });

  // Routes
  app.use('/api/admin', require('../../routes/admin'));
  app.use('/api/dashboard', require('../../routes/dashboard'));

  // Test routes
  app.get('/api/security/protected-route', (req, res) => {
    res.json({ message: 'Protected data' });
  });

  app.post('/api/security/user-input', (req, res) => {
    const { input } = req.body;
    if (!input || input.length > 100) {
      return res.status(400).json({
        errors: [{ msg: 'Input must be between 1 and 100 characters' }]
      });
    }
    res.json({ message: 'Input validated successfully' });
  });

  app.post('/api/security/search', (req, res) => {
    const { query } = req.body;
    if (query.includes(';')) {
      return res.status(400).json({
        errors: [{ msg: 'Invalid search query' }]
      });
    }
    res.json({ message: 'Search query validated successfully' });
  });

  app.post('/api/security/execute', (req, res) => {
    const { command } = req.body;
    if (command.includes(';')) {
      return res.status(400).json({
        errors: [{ msg: 'Invalid command' }]
      });
    }
    res.json({ message: 'Command validated successfully' });
  });

  // Security middleware
  const securityMiddleware = {
    pathTraversal: (req, res, next) => {
      const fullPath = req.path;
      const normalizedPath = path.normalize(fullPath).replace(/\\/g, '/');
      
      // Check for path traversal in the full URL
      if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      next();
    },
    
    prototypePollution: (req, res, next) => {
      // Check if req.body is a Buffer (from express.raw())
      if (Buffer.isBuffer(req.body)) {
        const rawBodyString = req.body.toString();
        
        // Log the raw string received
        // console.log('RAW BODY STRING:', rawBodyString); // Removed log

        // Check the raw string for "__proto__" before parsing
        if (rawBodyString.includes('"__proto__"')) { 
          // console.log('FOUND "__proto__" IN RAW STRING'); // Removed log
          return res.status(400).json({ error: 'Invalid data: __proto__ key detected' });
        }

        try {
          // If the raw string is safe, parse it and attach to req.body
          const parsedBody = JSON.parse(rawBodyString);
          req.body = parsedBody; // Make parsed body available

          // Optional: Perform other checks on the parsed body if necessary
          // (e.g., check for constructor, prototype)
          const dangerousKeys = ['constructor', 'prototype'];
          for (const key of dangerousKeys) {
            if (parsedBody && typeof parsedBody === 'object' && Object.prototype.hasOwnProperty.call(parsedBody, key)) {
              return res.status(400).json({ error: `Invalid data: Forbidden key ${key} detected` });
            }
          }

        } catch (e) {
          // Handle JSON parsing error if the string wasn't valid JSON
          return res.status(400).json({ error: 'Invalid JSON data' });
        }
      } 
      // Handle cases where body is not a buffer (already parsed, or different content type)
      else if (req.body && typeof req.body === 'object') {
         // Add checks for already parsed objects if necessary, depending on other routes
         if (Object.prototype.hasOwnProperty.call(req.body, '__proto__') || 
             Object.prototype.hasOwnProperty.call(req.body, 'constructor') || 
             Object.prototype.hasOwnProperty.call(req.body, 'prototype')) {
             // This branch might be hit if express.raw() didn't apply
             return res.status(400).json({ error: 'Invalid data: Forbidden key detected (already parsed?)' });
         }
      }
      
      next(); // Proceed if no issues found
    }
  };

  // Apply security middleware to all routes under /api/security
  app.use('/api/security', securityMiddleware.pathTraversal);
  
  // File routes
  app.get('/api/security/files/:filename', (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    res.json({ message: 'Filename validated successfully' });
  });

  // Data routes with prototype pollution protection
  app.post('/api/security/data', securityMiddleware.prototypePollution, (req, res) => {
    res.json({ message: 'Data validated successfully' });
  });

  app.post('/api/security/upload', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large' });
        }
        if (err.message === 'File type not allowed') {
          return res.status(400).json({ error: 'File type not allowed' });
        }
        return res.status(400).json({ error: 'Invalid file upload' });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      res.json({ message: 'File uploaded successfully' });
    });
  });

  // Rate limiting middleware for sensitive data
  const sensitiveDataLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
    message: { message: 'Too many requests to sensitive data' },
    skip: (req) => !req.headers['x-test-rate-limit']
  });

  // Rate limiting middleware for public data
  const publicDataLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 requests per minute
    message: { message: 'Too many requests to public data' },
    skip: (req) => !req.headers['x-test-rate-limit']
  });

  app.get('/api/security/sensitive-data', sensitiveDataLimiter, (req, res) => {
    res.json({ message: 'Sensitive data' });
  });

  app.get('/api/security/public-data', publicDataLimiter, (req, res) => {
    res.json({ message: 'Public data' });
  });

  app.get('/api/security/error-test', (req, res) => {
    if (req.headers['x-test-error']) {
      throw new Error('Test error');
    }
    res.json({ message: 'Data retrieved successfully' });
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large' });
      }
      return res.status(400).json({ error: 'File type not allowed' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
};

module.exports = { createTestApp, TEST_JWT_SECRET }; 