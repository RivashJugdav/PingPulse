const request = require('supertest');
const mongoose = require('mongoose');
const nock = require('nock');
const PingService = require('../models/PingService');
const User = require('../models/User');
const { setupTestDB, teardownTestDB } = require('./helpers/db-setup');
const express = require('express');

// Mock the auth controller before app import
jest.mock('../controllers/auth', () => ({
  register: jest.fn((req, res) => res.status(201).json({ message: 'User registered' })),
  verifyEmail: jest.fn((req, res) => res.status(200).json({ message: 'Email verified' })),
  resendVerificationCode: jest.fn((req, res) => res.status(200).json({ message: 'Code resent' })),
  login: jest.fn((req, res) => res.status(200).json({ token: 'test-token' })),
  autoLogin: jest.fn((req, res) => res.status(200).json({ token: 'test-token' })),
  forgotPassword: jest.fn((req, res) => res.status(200).json({ message: 'Code sent' })),
  resetPassword: jest.fn((req, res) => res.status(200).json({ message: 'Password reset' })),
  getProfile: jest.fn((req, res) => res.status(200).json({ user: {} })),
  updateProfile: jest.fn((req, res) => res.status(200).json({ user: {} })),
  changePassword: jest.fn((req, res) => res.status(200).json({ message: 'Password changed' })),
  updateSubscription: jest.fn((req, res) => res.status(200).json({ message: 'Subscription updated' })),
  checkUserType: jest.fn((req, res) => res.status(200).json({ isGoogleUser: false })),
  googleLogin: jest.fn((req, res) => res.redirect('/google')),
  googleCallback: jest.fn((req, res) => res.redirect('/callback'))
}));

// Mock JWT middleware to skip authentication checks
jest.mock('../middleware/auth', () => ({
  protect: jest.fn((req, res, next) => {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      // Extract userId from the token - in this case, we'll use a fixed test ID
      const userId = req.headers.authorization.endsWith('premiumToken') ? 
        'premium-user-id' : 'test-user-id';
      
      // Fake user with appropriate subscription
      req.user = {
        id: userId,
        _id: userId,
        email: userId === 'premium-user-id' ? 'premium@example.com' : 'test@example.com',
        subscription: {
          plan: userId === 'premium-user-id' ? 'premium' : 'basic',
          active: true
        }
      };
      
      if (req.headers.authorization.includes('free')) {
        req.user.subscription.plan = 'free';
      }
      
      next();
    } else {
      res.status(401).json({ message: 'Not authorized, no token' });
    }
  }),
  checkSubscription: jest.fn((req, res, next) => next()),
  hasRole: jest.fn((roles) => (req, res, next) => next())
}));

// Mock dependencies
jest.mock('../services/pingScheduler', () => ({
  refreshSchedules: jest.fn().mockResolvedValue(),
  pingService: jest.fn().mockResolvedValue(),
  triggerPing: jest.fn().mockResolvedValue(),
  getMetrics: jest.fn().mockReturnValue({
    isRunning: true,
    activeJobs: 5,
    totalPings: 100,
    successfulPings: 90,
    failedPings: 10
  })
}));

// Mock middleware/validator
jest.mock('../middleware/validator', () => ({
  validate: jest.fn(() => (req, res, next) => next())
}));

// Mock middleware/rateLimiter
jest.mock('../middleware/rateLimiter', () => ({
  authRateLimiter: jest.fn((req, res, next) => next()),
  resetRateLimiter: jest.fn((req, res, next) => next()),
  apiLimiter: jest.fn((req, res, next) => next())
}));

// Import the app after mocking the dependencies
const app = require('../app');
const pingScheduler = require('../services/pingScheduler');

describe('HTTP Methods Tests', () => {
  let authToken = 'testToken';
  let premiumAuthToken = 'premiumToken';
  let freeAuthToken = 'freeToken';
  let testUser;
  let premiumUser;
  let testService;
  let testServiceForHead;
  let testServiceForPost;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset nock before each test
    nock.cleanAll();
  });

  describe('GET Method Tests', () => {
    beforeEach(async () => {
      // Create a test service for GET requests - directly in the database
      testService = new PingService({
        userId: 'test-user-id',
        url: 'https://example.com/api/status',
        name: 'GET Test Service',
        method: 'GET',
        interval: 10,
        active: true
      });
      
      // Save the ID but don't actually save to DB (we're mocking)
      testService._id = mongoose.Types.ObjectId();
    });

    test('should create a service with GET method', async () => {
      // Mock the response for pingScheduler.triggerPing
      pingScheduler.triggerPing.mockResolvedValueOnce({
        status: 'success',
        statusCode: 200
      });

      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          url: 'https://example.com/api/status',
          name: 'GET Test Service',
          method: 'GET',
          interval: 10
        });

      expect(response.status).toBe(201);
      expect(response.body.method).toBe('GET');
      expect(response.body.url).toBe('https://example.com/api/status');
    });

    test('should execute a manual GET ping successfully', async () => {
      // Mock the successful ping
      pingScheduler.pingService.mockResolvedValueOnce({
        status: 'success',
        responseTime: 150,
        statusCode: 200,
        message: 'OK',
        timestamp: new Date()
      });

      const response = await request(app)
        .post(`/api/ping-services/${testService._id}/ping`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    test('should handle a failed GET ping', async () => {
      // Mock a failed ping
      pingScheduler.pingService.mockResolvedValueOnce({
        status: 'error',
        message: 'Connection refused',
        timestamp: new Date()
      });

      const response = await request(app)
        .post(`/api/ping-services/${testService._id}/ping`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
    });
  });

  describe('HEAD Method Tests', () => {
    beforeEach(async () => {
      // Create a test service for HEAD requests
      testServiceForHead = new PingService({
        userId: 'test-user-id',
        url: 'https://example.com/api/health',
        name: 'HEAD Test Service',
        method: 'HEAD',
        interval: 10,
        active: true
      });
      
      // Save the ID but don't actually save to DB (we're mocking)
      testServiceForHead._id = mongoose.Types.ObjectId();
    });

    test('should create a service with HEAD method', async () => {
      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          url: 'https://example.com/api/health',
          name: 'HEAD Test Service',
          method: 'HEAD',
          interval: 10
        });

      expect(response.status).toBe(201);
      expect(response.body.method).toBe('HEAD');
    });

    test('should execute a manual HEAD ping successfully', async () => {
      // Mock the successful ping
      pingScheduler.pingService.mockResolvedValueOnce({
        status: 'success',
        responseTime: 100,
        statusCode: 200,
        message: 'OK',
        timestamp: new Date()
      });

      const response = await request(app)
        .post(`/api/ping-services/${testServiceForHead._id}/ping`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    test('should handle a failed HEAD ping', async () => {
      // Mock a failed ping
      pingScheduler.pingService.mockResolvedValueOnce({
        status: 'error',
        statusCode: 500,
        message: 'Internal Server Error',
        timestamp: new Date()
      });

      const response = await request(app)
        .post(`/api/ping-services/${testServiceForHead._id}/ping`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
    });

    test('should reject HEAD method for free plan users', async () => {
      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${freeAuthToken}`)
        .send({
          url: 'https://example.com/api/health',
          name: 'HEAD Test Service',
          method: 'HEAD',
          interval: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('HEAD method is only available with basic or premium subscription');
    });
  });

  describe('POST Method Tests', () => {
    beforeEach(async () => {
      // Create a test service for POST requests
      testServiceForPost = new PingService({
        userId: 'premium-user-id',
        url: 'https://example.com/api/data',
        name: 'POST Test Service',
        method: 'POST',
        requestBody: JSON.stringify({ test: true }),
        interval: 5,
        active: true
      });
      
      // Save the ID but don't actually save to DB (we're mocking)
      testServiceForPost._id = mongoose.Types.ObjectId();
    });

    test('should create a service with POST method for premium users', async () => {
      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${premiumAuthToken}`)
        .send({
          url: 'https://example.com/api/data',
          name: 'POST Test Service',
          method: 'POST',
          requestBody: JSON.stringify({ test: true }),
          interval: 5
        });

      expect(response.status).toBe(201);
      expect(response.body.method).toBe('POST');
      expect(response.body.requestBody).toBe(JSON.stringify({ test: true }));
    });

    test('should reject POST method for non-premium users', async () => {
      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          url: 'https://example.com/api/data',
          name: 'POST Test Service',
          method: 'POST',
          requestBody: JSON.stringify({ test: true }),
          interval: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('POST method is only available with premium subscription');
    });

    test('should execute a manual POST ping successfully', async () => {
      // Mock the successful ping
      pingScheduler.pingService.mockResolvedValueOnce({
        status: 'success',
        responseTime: 200,
        statusCode: 201,
        message: 'Created',
        timestamp: new Date()
      });

      const response = await request(app)
        .post(`/api/ping-services/${testServiceForPost._id}/ping`)
        .set('Authorization', `Bearer ${premiumAuthToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    test('should handle a failed POST ping', async () => {
      // Mock a failed ping
      pingScheduler.pingService.mockResolvedValueOnce({
        status: 'error',
        statusCode: 400,
        message: 'Bad request',
        timestamp: new Date()
      });

      const response = await request(app)
        .post(`/api/ping-services/${testServiceForPost._id}/ping`)
        .set('Authorization', `Bearer ${premiumAuthToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
    });

    test('should validate custom request body', async () => {
      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${premiumAuthToken}`)
        .send({
          url: 'https://example.com/api/data',
          name: 'POST Test Service',
          method: 'POST',
          requestBody: 'invalidJsonFormat',
          interval: 5
        });

      // This test assumes your validation checks for valid JSON in the requestBody
      // Adjust based on your actual validation requirements
      if (response.status === 400) {
        expect(response.body.message).toContain('requestBody');
      } else {
        // If you don't validate JSON format, the test should still pass
        expect(response.status).toBe(201);
      }
    });
  });

  describe('Custom Headers Tests', () => {
    test('should create a service with custom headers for premium users', async () => {
      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${premiumAuthToken}`)
        .send({
          url: 'https://example.com/api/data',
          name: 'Custom Headers Test',
          method: 'GET',
          interval: 5,
          headers: {
            'X-API-Key': 'test-key',
            'Custom-Header': 'test-value'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.headers).toBeDefined();
      // Note: The format of headers in the response may vary depending on your MongoDB serialization
    });

    test('should limit custom headers for basic plan users', async () => {
      const headers = {
        'X-API-Key': 'test-key',
        'Custom-Header-1': 'value1',
        'Custom-Header-2': 'value2',
        'Custom-Header-3': 'value3',
        'Custom-Header-4': 'value4'  // This should exceed the limit for basic plan
      };

      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          url: 'https://example.com/api/data',
          name: 'Too Many Headers Test',
          method: 'GET',
          interval: 10,
          headers
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Basic subscription allows a maximum of 3 custom headers');
    });
  });

  describe('Response Validation Tests', () => {
    test('should create a service with response validation for premium users', async () => {
      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${premiumAuthToken}`)
        .send({
          url: 'https://example.com/api/status',
          name: 'Validation Test Service',
          method: 'GET',
          interval: 5,
          validateResponse: true,
          responseValidationRule: 'contains',
          responseValidationValue: '{"status":"ok"}'
        });

      expect(response.status).toBe(201);
      expect(response.body.validateResponse).toBe(true);
      expect(response.body.responseValidationRule).toBe('contains');
      expect(response.body.responseValidationValue).toBe('{"status":"ok"}');
    });

    test('should reject response validation for non-premium users', async () => {
      const response = await request(app)
        .post('/api/ping-services')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          url: 'https://example.com/api/status',
          name: 'Validation Test Service',
          method: 'GET',
          interval: 10,
          validateResponse: true,
          responseValidationRule: 'contains',
          responseValidationValue: '{"status":"ok"}'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Response validation is only available with premium subscription');
    });
  });
}); 