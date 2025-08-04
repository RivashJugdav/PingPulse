'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const PingService = require('../../models/PingService');
const User = require('../../models/User');
const { createTestApp } = require('../helpers/testApp');
const { generateToken } = require('../mocks/jwt');
const logger = require('../../utils/logger');

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Mock the JWT verification
jest.mock('../../utils/jwt', () => require('../mocks/jwt'));

let mongoServer;
let app;
let userToken;
let mockUser;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  app = createTestApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all collections
  await Promise.all([
    PingService.deleteMany({}),
    User.deleteMany({})
  ]);
  
  // Create a test user and generate token
  mockUser = await User.create({
    email: 'test@example.com',
    name: 'Test User',
    password: 'Test123!@#',
    role: 'user',
    subscription: { plan: 'free', active: true }
  });
  
  // Generate token with the user's ID
  userToken = await generateToken(mockUser);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Dashboard Controller', () => {
  describe('getDashboardStats', () => {
    test('should return correct dashboard statistics', async () => {
      // Create test services with different statuses
      const services = await PingService.create([
        {
          userId: mockUser._id,
          name: 'Service 1',
          url: 'http://test1.com',
          active: true,
          interval: 5, // 288 pings per day
          lastStatus: 'success',
          logs: [
            { timestamp: new Date(), status: 'success', responseTime: 100 }
          ]
        },
        {
          userId: mockUser._id,
          name: 'Service 2',
          url: 'http://test2.com',
          active: true,
          interval: 10, // 144 pings per day
          lastStatus: 'error',
          logs: [
            { timestamp: new Date(), status: 'error', responseTime: 200 }
          ]
        },
        {
          userId: mockUser._id,
          name: 'Service 3',
          url: 'http://test3.com',
          active: false,
          interval: 15,
          lastStatus: 'pending',
          logs: [
            { timestamp: new Date(), status: 'pending', responseTime: 300 }
          ]
        }
      ]);

      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({
        totalServices: 3,
        activeServices: 2,
        inactiveServices: 1,
        healthyServices: 1,
        errorServices: 1,
        pendingServices: 1,
        pingsPerDay: 432, // 288 + 144
        recentLogs: expect.any(Array)
      });
    });

    test('should return recent logs sorted by timestamp', async () => {
      const now = new Date();
      await PingService.create({
        userId: mockUser._id,
        name: 'Test Service',
        url: 'http://test.com',
        active: true,
        interval: 5,
        lastStatus: 'success',
        logs: [
          { timestamp: new Date(now - 1000), status: 'success', responseTime: 100 },
          { timestamp: new Date(now - 2000), status: 'error', responseTime: 200 },
          { timestamp: new Date(now - 3000), status: 'success', responseTime: 150 }
        ]
      });

      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.recentLogs).toHaveLength(3);
      expect(new Date(response.body.recentLogs[0].timestamp).getTime()).toBeGreaterThan(
        new Date(response.body.recentLogs[1].timestamp).getTime()
      );
    });

    test('should limit recent logs to 20 entries', async () => {
      const logs = Array(25).fill().map((_, i) => ({
        timestamp: new Date(Date.now() - i * 1000),
        status: 'success',
        responseTime: 100
      }));

      await PingService.create({
        userId: mockUser._id,
        name: 'Test Service',
        url: 'http://test.com',
        active: true,
        interval: 5,
        lastStatus: 'success',
        logs
      });

      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.recentLogs).toHaveLength(20);
    });

    test('should handle errors gracefully', async () => {
      // Mock logger.error for this specific test
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      
      jest.spyOn(PingService, 'find').mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe('Failed to get dashboard stats');
    });
  });

  describe('getServiceStatusSummary', () => {
    test('should return status summary for active services', async () => {
      await PingService.create([
        {
          userId: mockUser._id,
          name: 'Service 1',
          url: 'http://test1.com',
          active: true,
          interval: 5,
          lastStatus: 'success',
          lastPinged: new Date()
        },
        {
          userId: mockUser._id,
          name: 'Service 2',
          url: 'http://test2.com',
          active: true,
          interval: 10,
          lastStatus: 'error',
          lastPinged: new Date()
        },
        {
          userId: mockUser._id,
          name: 'Service 3',
          url: 'http://test3.com',
          active: false,
          interval: 15,
          lastStatus: 'pending',
          lastPinged: new Date()
        }
      ]);

      const response = await request(app)
        .get('/api/dashboard/service-status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveLength(2); // Only active services
      expect(response.body[0]).toMatchObject({
        name: expect.any(String),
        url: expect.any(String),
        status: expect.any(String),
        lastPinged: expect.any(String),
        interval: expect.any(Number)
      });
    });

    test('should handle services without lastStatus', async () => {
      await PingService.create({
        userId: mockUser._id,
        name: 'Test Service',
        url: 'http://test.com',
        active: true,
        interval: 5,
        lastPinged: new Date()
      });

      const response = await request(app)
        .get('/api/dashboard/service-status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body[0].status).toBe('pending');
    });

    test('should handle errors gracefully', async () => {
      // Mock logger.error for this specific test
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      
      jest.spyOn(PingService, 'find').mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/dashboard/service-status')
        .set('Authorization', `Bearer ${userToken}`);
      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe('Failed to get service status');
    });
  });
}); 