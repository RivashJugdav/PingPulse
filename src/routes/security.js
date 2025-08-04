const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const { protect, sensitiveDataRateLimiter, publicDataRateLimiter } = require('../middleware/auth');
const session = require('express-session');

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

router.use(session(sessionConfig));

// Protected route for JWT testing
router.get('/protected-route', protect, (req, res) => {
  res.json({ message: 'Protected data' });
});

// User input validation route
router.post('/user-input', [
  body('input')
    .trim()
    .escape()
    .isLength({ min: 1, max: 100 })
    .withMessage('Input must be between 1 and 100 characters')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  res.json({ message: 'Input validated successfully' });
});

// Search route with SQL injection prevention
router.post('/search', [
  body('query')
    .trim()
    .escape()
    .matches(/^[a-zA-Z0-9\s]+$/)
    .withMessage('Invalid search query')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  res.json({ message: 'Search query validated successfully' });
});

// Command execution route with command injection prevention
router.post('/execute', [
  body('command')
    .trim()
    .escape()
    .matches(/^[a-zA-Z0-9\s\-_]+$/)
    .withMessage('Invalid command')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  res.json({ message: 'Command validated successfully' });
});

// File access route with path traversal prevention
router.all('/files/*', (req, res) => {
  const filepath = req.params[0];
  // More robust path traversal check
  if (!filepath || filepath.includes('..') || filepath.includes('/') || filepath.includes('\\') || filepath.includes('%2f') || filepath.includes('%5c')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  res.json({ message: 'Filename validated successfully' });
});

// Data route with prototype pollution prevention
router.post('/data', (req, res) => {
  const data = req.body;

  // Check for presence of potentially harmful keys
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  // Check for __proto__ at the top level (as a string key)
  if ('__proto__' in data) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  const forbiddenKeys = ['constructor', 'prototype'];
  for (const key in data) {
    if (forbiddenKeys.includes(key)) {
      return res.status(400).json({ error: 'Invalid data' });
    }
  }

  // Additional check specifically for prototype pollution attempts via __proto__
  // This handles cases where __proto__ might be set directly, even if not iterated by for...in
  if (Object.prototype.hasOwnProperty.call(data, '__proto__')){
      return res.status(400).json({ error: 'Invalid data: __proto__ key detected' });
  }

  // If checks pass, proceed (or return success)
  res.status(200).json({ message: 'Data validated successfully' });
});

// Upload route with file size and type restrictions
router.post('/upload', upload.single('file'), (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ message: 'File uploaded successfully' });
});

// Sensitive data route with rate limiting
router.get('/sensitive-data', protect, sensitiveDataRateLimiter, (req, res) => {
  res.json({ message: 'Sensitive data' });
});

// Public data route with rate limiting
router.get('/public-data', publicDataRateLimiter, (req, res) => {
  res.json({ message: 'Public data' });
});

// Error handling route
router.get('/error-test', (req, res) => {
  if (req.headers['x-test-error']) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
  res.json({ message: 'Data retrieved successfully' });
});

module.exports = router; 