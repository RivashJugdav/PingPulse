const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { generateTestToken } = require('../helpers/testHelpers');
const path = require('path');
const fs = require('fs');

describe('Security Routes', () => {
  let app;
  let testToken;

  beforeAll(async () => {
    app = createTestApp();
    testToken = await generateTestToken({
      _id: 'testUserId',
      email: 'test@example.com',
      role: 'user',
      subscription: {
        plan: 'free',
        active: true
      }
    });
  });

  describe('Protected Routes', () => {
    test('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/security/protected-route');
      
      expect(response.status).toBe(401);
    });

    test('should allow authenticated requests', async () => {
      const response = await request(app)
        .get('/api/security/protected-route')
        .set('Authorization', `Bearer ${testToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Protected data');
    });
  });

  describe('Input Validation', () => {
    test('should validate user input length', async () => {
      const response = await request(app)
        .post('/api/security/user-input')
        .send({ input: 'a'.repeat(101) });
      
      expect(response.status).toBe(400);
      expect(response.body.errors[0].msg).toContain('Input must be between 1 and 100 characters');
    });

    test('should accept valid user input', async () => {
      const response = await request(app)
        .post('/api/security/user-input')
        .send({ input: 'Valid input' });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Input validated successfully');
    });
  });

  describe('SQL Injection Prevention', () => {
    test('should reject SQL injection attempts', async () => {
      const response = await request(app)
        .post('/api/security/search')
        .send({ query: "'; DROP TABLE users; --" });
      
      expect(response.status).toBe(400);
      expect(response.body.errors[0].msg).toBe('Invalid search query');
    });

    test('should accept valid search queries', async () => {
      const response = await request(app)
        .post('/api/security/search')
        .send({ query: 'valid search term' });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Search query validated successfully');
    });
  });

  describe('Command Injection Prevention', () => {
    test('should reject command injection attempts', async () => {
      const response = await request(app)
        .post('/api/security/execute')
        .send({ command: 'ls; rm -rf /' });
      
      expect(response.status).toBe(400);
      expect(response.body.errors[0].msg).toBe('Invalid command');
    });

    test('should accept valid commands', async () => {
      const response = await request(app)
        .post('/api/security/execute')
        .send({ command: 'valid-command' });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Command validated successfully');
    });
  });

  describe('Path Traversal Prevention', () => {
    test('should reject path traversal attempts', async () => {
      // Encode dots and slashes to bypass potential early URL normalization by Express
      const maliciousPath = '..%2f..%2f..%2fetc%2fpasswd'; 
      const response = await request(app)
        .get(`/api/security/files/${maliciousPath}`);
      
      expect(response.status).toBe(400); // Keep expectation as 400, handler should now catch it
      expect(response.body.error).toBe('Invalid filename');
    });

    test('should accept valid filenames', async () => {
      const response = await request(app)
        .get('/api/security/files/valid-file.txt');
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Filename validated successfully');
    });
  });

  describe('Prototype Pollution Prevention', () => {
    test('should reject prototype pollution attempts', async () => {
      // Send the payload as a raw JSON string to bypass supertest's serialization
      const rawPayload = '{"__proto__": {"polluted": true}}';
      const response = await request(app)
        .post('/api/security/data')
        .set('Content-Type', 'application/json') // Ensure correct Content-Type
        .send(rawPayload);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid data: __proto__ key detected');
    });

    test('should accept valid data', async () => {
      const response = await request(app)
        .post('/api/security/data')
        .send({ valid: 'data', safe: true });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Data validated successfully');
    });
  });
  describe('File Upload Security', () => {
    test('should reject oversized files', async () => {
      const largeFile = Buffer.alloc(6 * 1024 * 1024); // 6MB
      const response = await request(app)
        .post('/api/security/upload')
        .attach('file', largeFile, 'test.jpg');
      
      expect(response.status).toBe(413);
    });

    test('should reject invalid file types', async () => {
      const response = await request(app)
        .post('/api/security/upload')
        .attach('file', Buffer.from('test'), {
          filename: 'test.exe',
          contentType: 'application/x-msdownload'
        });
      
      expect(response.status).toBe(400);
    });

    test('should accept valid files', async () => {
      const response = await request(app)
        .post('/api/security/upload')
        .attach('file', Buffer.from('test'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('File uploaded successfully');
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits on sensitive data', async () => {
      const requests = Array(6).fill().map(() => 
        request(app)
          .get('/api/security/sensitive-data')
          .set('Authorization', `Bearer ${testToken}`)
          .set('x-test-rate-limit', 'true')
      );
      
      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);
      
      expect(tooManyRequests.length).toBeGreaterThan(0);
    });

    test('should enforce different rate limits for public data', async () => {
      const requests = Array(51).fill().map(() => 
        request(app)
          .get('/api/security/public-data')
          .set('x-test-rate-limit', 'true')
      );
      
      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);
      
      expect(tooManyRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle test errors', async () => {
      const response = await request(app)
        .get('/api/security/error-test')
        .set('x-test-error', 'true');
      
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
    });

    test('should handle normal requests without errors', async () => {
      const response = await request(app)
        .get('/api/security/error-test');
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Data retrieved successfully');
    });
  });
}); 