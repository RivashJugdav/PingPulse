'use strict';
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../models/User');
const PingService = require('../../models/PingService');
const { createTestApp } = require('../helpers/testApp');
const { generateToken } = require('../mocks/jwt');
const logger = require('../../utils/logger');

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Mock the JWT verification
jest.mock('../../utils/jwt', () => require('../mocks/jwt'));

let mongoServer;
let app;
let adminToken;
let regularUserToken;

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
  await User.deleteMany({});
  await PingService.deleteMany({});

  // Create admin user and get token
  const adminUser = await User.create({
    email: 'admin@example.com',
    name: 'Admin User',
    password: 'Admin123!@#',
    role: 'admin'
  });
  adminToken = await generateToken(adminUser);

  // Create regular user and get token
  const regularUser = await User.create({
    email: 'user@example.com',
    name: 'Regular User',
    password: 'User123!@#',
    role: 'user',
    subscription: { plan: 'free' }
  });
  regularUserToken = await generateToken(regularUser);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Admin Controller', () => {
  describe('isAdmin middleware', () => {
    test('should allow admin user', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
    });

    test('should reject non-admin user', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${regularUserToken}`);
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized as admin');
    });
  });

  describe('getStats', () => {
    test('should return correct stats for all user types', async () => {
      // Create test users with different subscription plans
      const users = await User.create([
        { 
          email: 'free@example.com',
          name: 'Free User',
          password: 'Free123!@#',
          subscription: { plan: 'free', active: true }
        },
        { 
          email: 'basic@example.com',
          name: 'Basic User',
          password: 'Basic123!@#',
          subscription: { plan: 'basic', active: true }
        },
        { 
          email: 'premium@example.com',
          name: 'Premium User',
          password: 'Premium123!@#',
          subscription: { plan: 'premium', active: true }
        }
      ]);

      // Create test services with userId
      await PingService.create([
        { url: 'http://test1.com', active: true, userId: users[0]._id },
        { url: 'http://test2.com', active: false, userId: users[1]._id }
      ]);

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users.total).toBe(5); // 3 test users + admin + regular user
      expect(response.body.users.byPlan).toEqual({
        free: 1,
        basic: 1,
        premium: 1
      });
      expect(response.body.services.total).toBe(2);
      expect(response.body.services.active).toBe(1);
      expect(response.body.revenue.monthly).toBe(20); // (1 * $5) + (1 * $15)
    });

    test('should handle errors gracefully', async () => {
      // Mock logger.error for this specific test
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      
      // Mock User.countDocuments to throw an error
      jest.spyOn(User, 'countDocuments').mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to get stats');
      // No need to explicitly restore errorSpy, afterEach handles it
    });
  });

  describe('getAllUsers', () => {
    test('should return paginated users', async () => {
      // Create test users
      await User.create([
        { email: 'user1@example.com', name: 'User 1', password: 'User1123!@#', createdAt: new Date() },
        { email: 'user2@example.com', name: 'User 2', password: 'User2123!@#', createdAt: new Date() },
        { email: 'user3@example.com', name: 'User 3', password: 'User3123!@#', createdAt: new Date() }
      ]);

      const response = await request(app)
        .get('/api/admin/users?page=1&limit=2&sort=-createdAt')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        total: 5, // 3 test users + admin + regular user
        page: 1,
        limit: 2,
        pages: 3
      });
    });

    test('should exclude password field from response', async () => {
      await User.create({
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        role: 'user',
        subscription: { plan: 'free' },
        createdAt: new Date()
      });

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users[0]).not.toHaveProperty('password');
    });

    test('should handle errors gracefully', async () => {
      // Mock logger.error for this specific test
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      
      jest.spyOn(User, 'find').mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to get users');
    });
  });

  describe('getAllServices', () => {
    test('should return paginated services with user info', async () => {
      // Create test user and services
      const user = await User.create({
        email: 'test@example.com',
        name: 'Test User',
        password: 'Test123!@#',
        subscription: { plan: 'basic' }
      });

      await PingService.create([
        { url: 'http://test1.com', userId: user._id },
        { url: 'http://test2.com', userId: user._id }
      ]);

      const response = await request(app)
        .get('/api/admin/services?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.services).toHaveLength(2);
      expect(response.body.services[0].userId).toHaveProperty('name', 'Test User');
      expect(response.body.services[0].userId).toHaveProperty('email', 'test@example.com');
      expect(response.body.services[0].userId).toHaveProperty('subscription');
    });

    test('should handle errors gracefully', async () => {
      // Mock logger.error for this specific test
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      
      jest.spyOn(PingService, 'find').mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/admin/services')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        message: 'Failed to get services'
      });
    });
  });
}); 