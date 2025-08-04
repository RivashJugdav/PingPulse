const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createTestApp } = require('./testApp');
const { securityTestUtils } = global;

describe('API Security Tests', () => {
  let app;
  let testUser;
  let adminUser;
  let freeUser;
  let basicUser;
  let premiumUser;

  beforeAll(() => {
    app = createTestApp();
    
    // Create test users with different roles and subscriptions
    testUser = {
      id: '1',
      email: 'test@example.com',
      role: 'user',
      subscription: { active: true, plan: 'basic' }
    };
    
    adminUser = {
      id: '2',
      email: 'admin@example.com',
      role: 'admin',
      subscription: { active: true, plan: 'premium' }
    };
    
    freeUser = {
      id: '3',
      email: 'free@example.com',
      role: 'user',
      subscription: { active: true, plan: 'free' }
    };
    
    basicUser = {
      id: '4',
      email: 'basic@example.com',
      role: 'user',
      subscription: { active: true, plan: 'basic' }
    };
    
    premiumUser = {
      id: '5',
      email: 'premium@example.com',
      role: 'user',
      subscription: { active: true, plan: 'premium' }
    };
  });

  describe('Authentication Tests', () => {
    it('should reject requests without JWT token', async () => {
      const response = await request(app)
        .get('/api/ping')
        .expect(401);
      expect(response.body.error).toBe('No token provided');
    });

    it('should reject requests with invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/ping')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should handle expired JWT tokens', async () => {
      const response = await request(app)
        .get('/api/ping')
        .set('Authorization', 'Bearer expired-token')
        .expect(500);
      expect(response.body.error).toBe('Token has expired');
    });
  });

  describe('Authorization Tests', () => {
    it('should prevent unauthorized access to user-specific data', async () => {
      const token = jwt.sign(testUser, process.env.JWT_SECRET || 'test-secret');
      const response = await request(app)
        .get(`/api/ping/${adminUser.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(response.body.message).toBe('Not authorized');
    });

    it('should prevent standard users from accessing admin routes', async () => {
      const token = jwt.sign(testUser, process.env.JWT_SECRET || 'test-secret');
      const response = await request(app)
        .get('/api/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(response.body.error).toBe('Not authorized');
    });

    it('should allow admin users to access admin routes', async () => {
      const token = jwt.sign(adminUser, process.env.JWT_SECRET || 'test-secret');
      const response = await request(app)
        .get('/api/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.message).toBe('Admin data');
    });
  });

  describe('Subscription Tests', () => {
    it('should enforce subscription-based service limits', async () => {
      const token = jwt.sign(freeUser, process.env.JWT_SECRET || 'test-secret');
      const response = await request(app)
        .post('/api/ping')
        .set('Authorization', `Bearer ${token}`)
        .send({ interval: 5 })
        .expect(400);
      expect(response.body.message).toBe('Your plan only allows intervals of 30 minutes or more');
    });

    it('should allow premium users to create services with shorter intervals', async () => {
      const token = jwt.sign(premiumUser, process.env.JWT_SECRET || 'test-secret');
      const response = await request(app)
        .post('/api/ping')
        .set('Authorization', `Bearer ${token}`)
        .send({ 
          url: 'https://example.com',
          name: 'Test Service', 
          interval: 1,
          monitorType: 'http'
        })
        .expect(201);
      expect(response.body).toHaveProperty('_id');
    });
  });

  describe('Input Validation Tests', () => {
    it('should prevent XSS in user input', async () => {
      const response = await request(app)
        .post('/api/user-input')
        .send({ input: '<script>alert("xss")</script>' })
        .expect(200);
      expect(response.body.input).toBe('alert("xss")');
    });

    it('should validate payment tokens', async () => {
      const token = jwt.sign(testUser, process.env.JWT_SECRET || 'test-secret');
      const response = await request(app)
        .post('/api/subscription/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentToken: 'invalid;token' })
        .expect(400);
      expect(response.body.message).toBe('Invalid payment');
    });
  });

  describe('Rate Limiting Tests', () => {
    it('should enforce rate limits on sensitive endpoints', async () => {
      const token = jwt.sign(testUser, process.env.JWT_SECRET || 'test-secret');
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get('/api/dashboard/service-status')
          .set('Authorization', `Bearer ${token}`)
          .set('x-test-rate-limit', 'true');
      }
      const response = await request(app)
        .get('/api/dashboard/service-status')
        .set('Authorization', `Bearer ${token}`)
        .set('x-test-rate-limit', 'true')
        .expect(429);
      expect(response.body.error).toBe('Too many requests');
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle database errors gracefully', async () => {
      const response = await request(app)
        .get('/api/data')
        .set('x-trigger-error', 'true')
        .expect(500);
      expect(response.body.error).toBe('Internal Server Error');
    });
  });
});