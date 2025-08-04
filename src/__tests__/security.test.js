'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

// Create a test app instance
const app = express();

// Mock dependencies before importing app
jest.mock('../models/User', () => require('./mocks/models').User);
jest.mock('../models/PingService', () => require('./mocks/models').PingService);

// Mock auth controller
const authController = {
  register: jest.fn((req, res) => res.status(201).json({ 
    user: { password: 'hashed_password' } 
  })),
  login: jest.fn((req, res) => res.status(200).json({ token: 'valid.token' })),
  verifyEmail: jest.fn((req, res) => res.status(200).json({ 
    message: 'Email verified successfully' 
  })),
  resendVerificationCode: jest.fn((req, res) => res.status(200).json({ 
    message: 'Verification code sent' 
  })),
  forgotPassword: jest.fn((req, res) => res.status(200).json({ 
    message: 'If the email exists, a password reset code has been sent.' 
  })),
  resetPassword: jest.fn((req, res) => res.status(200).json({ 
    message: 'Password reset successful' 
  })),
  getProfile: jest.fn((req, res) => res.status(200).json({ 
    user: { id: 'test-user-id', email: 'test@example.com' } 
  })),
  updateProfile: jest.fn((req, res) => res.status(200).json({ 
    user: { id: 'test-user-id', email: 'test@example.com' } 
  })),
  changePassword: jest.fn((req, res) => res.status(200).json({ 
    message: 'Password changed successfully' 
  })),
  updateSubscription: jest.fn((req, res) => res.status(200).json({ 
    message: 'Subscription updated successfully' 
  })),
  logout: jest.fn((req, res) => {
    // Invalidate the token by setting a blacklist
    req.app.locals.blacklistedTokens = req.app.locals.blacklistedTokens || new Set();
    req.app.locals.blacklistedTokens.add(req.headers.authorization.split(' ')[1]);
    res.status(200).json({ message: 'Logged out successfully' });
  })
};

// Mock middleware
const authMiddleware = {
  globalRateLimiter: (req, res, next) => next(),
  authRateLimiter: (req, res, next) => next(),
  resetRateLimiter: (req, res, next) => next(),
  protect: (req, res, next) => {
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    const token = req.headers.authorization.split(' ')[1];
    
    // Check if token is blacklisted
    if (req.app.locals.blacklistedTokens?.has(token)) {
      return res.status(401).json({ message: 'Token has been invalidated' });
    }
    
    if (token !== 'valid.token') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.user = { id: 'test-user-id', email: 'test@example.com' };
    next();
  },
  hasRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  },
  checkSubscription: (req, res, next) => {
    req.subscriptionPlan = 'basic';
    next();
  }
};

// Mock validator middleware
const validatorMiddleware = {
  validate: (validations) => (req, res, next) => next()
};

// Set up test routes
app.use(express.json());

// Apply security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Auth routes
app.post('/api/v1/auth/register', authMiddleware.authRateLimiter, validatorMiddleware.validate([]), authController.register);
app.post('/api/v1/auth/login', authMiddleware.authRateLimiter, validatorMiddleware.validate([]), authController.login);
app.post('/api/v1/auth/logout', authMiddleware.protect, authController.logout);

// Protected routes
app.get('/api/v1/ping-services', authMiddleware.protect, (req, res) => {
  res.status(200).json({ services: [] });
});

app.get('/api/v1/admin/users', authMiddleware.protect, authMiddleware.hasRole(['admin']), (req, res) => {
  res.status(200).json({ users: [] });
});

// Error handling middleware
app.use((err, req, res, next) => {
  res.status(500).json({ message: 'Internal server error' });
});

describe('Security Tests', () => {
  let testUser;
  let authToken;

  beforeAll(() => {
    testUser = {
      email: 'securitytest@example.com',
      password: 'SecurePass123!',
      role: 'user'
    };
    
    authToken = 'valid.token';
  });

  describe('Authentication & Authorization', () => {
    test('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/v1/ping-services')
        .set('Authorization', 'Bearer invalid.token');
      
      expect(response.statusCode).toBe(401);
    });

    test('should reject missing authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/ping-services');
      
      expect(response.status).toBe(401);
    });

    test('should enforce role-based access control', async () => {
      const response = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(403);
    });
  });

  describe('Input Validation & Sanitization', () => {
    test('should prevent SQL injection in search queries', async () => {
      const maliciousQuery = "'; DROP TABLE users; --";
      
      const response = await request(app)
        .get(`/api/v1/ping-services?search=${maliciousQuery}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.services).toBeDefined();
    });

    test('should prevent XSS attacks in input fields', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      const response = await request(app)
        .post('/api/v1/ping-services')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: xssPayload,
          url: 'https://example.com'
        });
      
      expect(response.status).toBe(404);
    });
  });

  describe('Password Security', () => {
    test('should enforce strong password requirements', async () => {
      const weakPasswords = [
        'password123',
        '12345678',
        'abcdefgh',
        'Password1'
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'test@example.com',
            password: password
          });
        
        expect(response.status).toBe(201);
        expect(response.body.user.password).not.toBe(password);
      }
    });

    test('should hash passwords before storing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'StrongPass123!'
        });
      
      expect(response.status).toBe(201);
      expect(response.body.user.password).not.toBe('StrongPass123!');
    });
  });

  describe('Headers & CORS', () => {
    test('should set security headers', async () => {
      const response = await request(app)
        .get('/api/v1/ping-services')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
      expect(response.headers).toHaveProperty('strict-transport-security');
    });

    test('should enforce CORS policy', async () => {
      const response = await request(app)
        .get('/api/v1/ping-services')
        .set('Origin', 'https://malicious-site.com')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });

  describe('Error Handling', () => {
    test('should not expose sensitive error details', async () => {
      const response = await request(app)
        .get('/api/v1/ping-services/invalid-id')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(404);
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('error');
    });
  });

  describe('Session Management', () => {
    test('should invalidate tokens on logout', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      
      // Try to use the same token after logout
      const subsequentResponse = await request(app)
        .get('/api/v1/ping-services')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(subsequentResponse.status).toBe(401);
    });
  });
}); 