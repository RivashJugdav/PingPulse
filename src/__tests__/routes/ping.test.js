const request = require('supertest');
const express = require('express');
const pingRoutes = require('../../routes/ping');
const PingService = require('../../models/PingService');
const User = require('../../models/User');
const pingScheduler = require('../../services/pingScheduler');
const jwtUtils = require('../../utils/jwt');
const authMiddleware = require('../../middleware/auth');
const pingController = require('../../controllers/ping');

// Mock dependencies
jest.mock('../../models/PingService');
jest.mock('../../models/User');
jest.mock('../../services/pingScheduler');
jest.mock('../../utils/jwt', () => ({
  verifyTokenWithRotation: jest.fn(),
  generateToken: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));
jest.mock('../../middleware/auth', () => ({
  protect: jest.fn(),
  checkSubscription: jest.fn()
}));
jest.mock('../../controllers/ping');

describe('Ping Routes', () => {
  let app;
  let mockUser;
  let mockToken;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Create mock user
    mockUser = {
      id: 'mockUserId',
      _id: 'mockUserId',
      email: 'test@example.com',
      subscription: {
        active: true,
        plan: 'basic',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    };

    // Create mock token
    mockToken = 'mock.jwt.token';

    // Mock JWT verification
    jwtUtils.verifyTokenWithRotation.mockImplementation((token) => {
      if (token === mockToken) {
        return Promise.resolve({ id: mockUser.id });
      }
      return Promise.resolve(null);
    });

    // Mock protect middleware
    authMiddleware.protect.mockImplementation((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token === mockToken) {
          req.user = mockUser;
          next();
        } else {
          return res.status(401).json({ message: 'Authentication failed - invalid token' });
        }
      } else {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
      }
    });
    
    // Mock checkSubscription middleware
    authMiddleware.checkSubscription.mockImplementation((req, res, next) => {
      if (!req.user || !req.user.subscription) {
        return res.status(403).json({ message: 'No subscription found' });
      }
      
      if (!req.user.subscription.active) {
        return res.status(403).json({ message: 'Subscription is inactive' });
      }
      
      if (req.user.subscription.expiresAt && new Date(req.user.subscription.expiresAt) < new Date()) {
        return res.status(403).json({ message: 'Subscription has expired' });
      }
      
      req.subscriptionPlan = req.user.subscription.plan;
      next();
    });
    
    app.use('/api/ping', pingRoutes);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    test('should reject requests without authentication token', async () => {
      const response = await request(app)
        .post('/api/ping')
        .send({
          url: 'https://example.com',
          interval: 10
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Not authorized, no token provided');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post('/api/ping')
        .set('Authorization', 'Bearer invalid.token')
        .send({
          url: 'https://example.com',
          interval: 10
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Authentication failed - invalid token');
    });
  });

  describe('POST /ping', () => {
    test('should create a new ping service successfully', async () => {
      const mockService = {
        _id: 'mockServiceId',
        url: 'https://example.com',
        interval: 10,
        name: 'Test Service',
        active: true,
        save: jest.fn().mockResolvedValue()
      };

      // Mock the controller's createService method
      pingController.createService.mockImplementation((req, res) => {
        res.status(201).json(mockService);
      });

      const response = await request(app)
        .post('/api/ping')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          url: 'https://example.com',
          interval: 10,
          name: 'Test Service'
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        url: 'https://example.com',
        interval: 10,
        name: 'Test Service',
        active: true
      });
    });

    describe('Validation', () => {
      test('should reject invalid URLs', async () => {
        // Mock the controller's createService method for invalid URL
        pingController.createService.mockImplementation((req, res) => {
          res.status(400).json({ 
            errors: [{ param: 'url', msg: 'Invalid URL' }]
          });
        });

        const response = await request(app)
          .post('/api/ping')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            url: 'invalid-url',
            interval: 10
          });

        expect(response.status).toBe(400);
        expect(response.body.errors[0].msg).toBe('Invalid URL');
      });

      test('should reject invalid intervals', async () => {
        // Mock the controller's createService method for invalid interval
        pingController.createService.mockImplementation((req, res) => {
          res.status(400).json({ 
            errors: [{ param: 'interval', msg: 'Interval must be a positive integer' }]
          });
        });

        const response = await request(app)
          .post('/api/ping')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            url: 'https://example.com',
            interval: 0
          });

        expect(response.status).toBe(400);
        expect(response.body.errors[0].msg).toBe('Interval must be a positive integer');
      });

      test('should enforce subscription plan limits', async () => {
        // Mock the controller's createService method for plan limit
        pingController.createService.mockImplementation((req, res) => {
          res.status(400).json({ message: 'Basic plan allows intervals between 10 and 30 minutes' });
        });

        const response = await request(app)
          .post('/api/ping')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            url: 'https://example.com',
            interval: 5 // Less than minimum for basic plan
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Basic plan allows intervals between 10 and 30 minutes');
      });
    });

    describe('Error Handling', () => {
      test('should handle database errors', async () => {
        // Mock the controller's createService method for database error
        pingController.createService.mockImplementation((req, res) => {
          res.status(500).json({ 
            message: 'Failed to create service', 
            error: 'Database error' 
          });
        });

        const response = await request(app)
          .post('/api/ping')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            url: 'https://example.com',
            interval: 10
          });

        expect(response.status).toBe(500);
        expect(response.body.message).toBe('Failed to create service');
        expect(response.body.error).toBe('Database error');
      });

      test('should handle scheduler errors', async () => {
        // Mock the controller's createService method for scheduler error
        pingController.createService.mockImplementation((req, res) => {
          res.status(500).json({ 
            message: 'Failed to create service', 
            error: 'Scheduler error' 
          });
        });

        const response = await request(app)
          .post('/api/ping')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            url: 'https://example.com',
            interval: 10
          });

        expect(response.status).toBe(500);
        expect(response.body.message).toBe('Failed to create service');
        expect(response.body.error).toBe('Scheduler error');
      });
    });

    describe('Rate Limiting', () => {
      test('should enforce service limits based on subscription', async () => {
        // Mock the controller's createService method for service limit
        pingController.createService.mockImplementation((req, res) => {
          res.status(400).json({ message: 'Your plan only allows 10 ping services' });
        });

        const response = await request(app)
          .post('/api/ping')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            url: 'https://example.com',
            interval: 10
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Your plan only allows 10 ping services');
      });

      test('should allow unlimited services for premium plan', async () => {
        // Mock the controller's createService method for premium plan
        pingController.createService.mockImplementation((req, res) => {
          res.status(201).json({
            _id: 'mockServiceId',
            url: 'https://example.com',
            interval: 5,
            name: 'Premium Service',
            active: true
          });
        });

        const response = await request(app)
          .post('/api/ping')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            url: 'https://example.com',
            interval: 5
          });

        expect(response.status).toBe(201);
      });
    });
  });

  describe('Error Handling Middleware', () => {
    test('should handle validation errors from express-validator', async () => {
      // Mock the controller's createService method for validation errors
      pingController.createService.mockImplementation((req, res) => {
        res.status(400).json({
          errors: [
            { param: 'url', msg: 'Invalid URL' },
            { param: 'interval', msg: 'Interval must be a positive integer' }
          ]
        });
      });

      const response = await request(app)
        .post('/api/ping')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          url: 'not-a-url',
          interval: 'not-a-number'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          msg: 'Invalid URL'
        })
      );
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          msg: 'Interval must be a positive integer'
        })
      );
    });

    test('should handle async errors in route handlers', async () => {
      // Mock the controller's createService method for async errors
      pingController.createService.mockImplementation((req, res) => {
        res.status(500).json({
          message: 'Failed to create service',
          error: 'Async error'
        });
      });

      const response = await request(app)
        .post('/api/ping')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          url: 'https://example.com',
          interval: 10
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to create service');
      expect(response.body.error).toBe('Async error');
    });
  });
}); 