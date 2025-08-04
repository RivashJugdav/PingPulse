const express = require('express');
const { setupSecurityMiddleware, sensitiveLimiter } = require('../../src/middleware/security');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// JWT validation middleware
const validateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  if (token === 'invalid-token') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  // Check for expired token
  if (token === 'expired-token') {
    return res.status(500).json({ error: 'Token has expired' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based access control middleware
const hasRole = (role) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.user.role !== role) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  next();
};

// Subscription check middleware
const checkSubscription = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!req.user.subscription || !req.user.subscription.active) {
    return res.status(403).json({ error: 'Subscription required' });
  }
  next();
};

const createTestApp = () => {
  const app = express();
  
  // Cookie parser middleware
  app.use(cookieParser());
  
  // CORS setup with preflight support
  app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  }));
  
  // Setup security middleware
  setupSecurityMiddleware(app);
  
  // Protected routes
  app.get('/api/ping', validateJWT, (req, res) => {
    res.json({ message: 'Protected data' });
  });

  // Ping service routes
  app.get('/api/ping/:id', validateJWT, (req, res) => {
    if (req.params.id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    res.json({ message: 'Service data' });
  });

  app.post('/api/ping', validateJWT, checkSubscription, (req, res) => {
    const { interval } = req.body;
    const maxInterval = req.user.subscription.plan === 'free' ? 30 : 
                       req.user.subscription.plan === 'basic' ? 10 : 1;
    
    if (interval < maxInterval) {
      return res.status(400).json({ 
        message: `Your plan only allows intervals of ${maxInterval} minutes or more` 
      });
    }
    res.status(201).json({ 
      _id: 'mock-service-id-1234',
      message: 'Service created',
      ...req.body
    });
  });

  // Dashboard routes with rate limiting
  const dashboardLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute for testing
    max: 5, // limit each IP to 5 requests per windowMs for sensitive endpoints
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip + req.path, // Separate limits for different paths
    skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'] // Only skip in test if not explicitly testing rate limits
  });

  app.use('/api/dashboard', dashboardLimiter);
  app.get('/api/dashboard/service-status', validateJWT, (req, res) => {
    res.json([{
      id: '1',
      name: 'Test Service',
      status: 'active'
    }]);
  });

  // Admin routes
  app.get('/api/admin/services', validateJWT, hasRole('admin'), (req, res) => {
    res.json({ message: 'Admin data' });
  });

  // Subscription routes
  app.post('/api/subscription/upgrade', validateJWT, (req, res) => {
    const { paymentToken } = req.body;
    if (!paymentToken || paymentToken.includes(';')) {
      return res.status(400).json({ message: 'Invalid payment' });
    }
    res.json({ message: 'Subscription upgraded' });
  });
  
  // Test routes
  app.get('/api/data', (req, res) => {
    if (req.headers['x-trigger-error'] === 'true') {
      const error = new Error('Database error');
      error.status = 500;
      throw error;
    }
    res.json({ data: 'Test data' });
  });
  
  app.post('/api/register', (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'password complexity requirements not met' });
    }
    res.status(201).json({ message: 'User registered successfully' });
  });
  
  app.post('/api/search', (req, res) => {
    const { query } = req.body;
    if (typeof query === 'object' || (typeof query === 'string' && query.includes("'"))) {
      return res.status(400).json({ error: 'Invalid query' });
    }
    res.json({ results: [] });
  });
  
  app.post('/api/execute', (req, res) => {
    const { command } = req.body;
    if (command.includes('$') || command.includes('`') || command.includes(';')) {
      return res.status(400).json({ error: 'Invalid command' });
    }
    res.json({ output: 'Command executed' });
  });
  
  app.post('/api/user-input', (req, res) => {
    const sanitizedInput = req.body.input.replace(/<[^>]*>/g, '');
    res.json({ input: sanitizedInput });
  });
  
  app.post('/api/login', (req, res) => {
    const sessionCookie = {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };
    
    res.cookie('session', 'test-session', sessionCookie);
    res.json({ message: 'Login successful' });
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
    if (err.status === 500) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    // Default error handler
    const status = err.status || 500;
    res.status(status).json({ error: 'Internal Server Error' });
  });
  
  return app;
};

module.exports = { createTestApp }; 