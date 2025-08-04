const { createServiceValidation, loginValidation } = require('../../utils/validation');
const { validationResult } = require('express-validator');
const httpMocks = require('node-mocks-http');

// Helper function to run validation middleware
const runValidation = async (validationRules, body) => {
  const req = httpMocks.createRequest({
    method: 'POST',
    body
  });
  const res = httpMocks.createResponse();
  
  // Apply all validation rules sequentially
  for (const rule of validationRules) {
    await rule(req, res, () => {});
  }
  
  // Get validation result
  return validationResult(req);
};

describe('Validation Rules Tests', () => {
  describe('createServiceValidation', () => {
    test('should pass with valid HTTP service data', async () => {
      const body = {
        url: 'https://example.com',
        interval: 10,
        monitorType: 'http',
        method: 'GET'
      };
      
      const result = await runValidation(createServiceValidation, body);
      expect(result.isEmpty()).toBe(true);
    });
    
    test('should pass with valid TCP service data', async () => {
      const body = {
        url: 'https://example.com',
        interval: 10,
        monitorType: 'tcp',
        port: 443,
        timeoutSeconds: 5
      };
      
      const result = await runValidation(createServiceValidation, body);
      expect(result.isEmpty()).toBe(true);
    });
    
    test('should pass with valid ICMP ping service data', async () => {
      const body = {
        url: 'https://example.com',
        interval: 10,
        monitorType: 'ping',
        packetCount: 3,
        timeoutSeconds: 5
      };
      
      const result = await runValidation(createServiceValidation, body);
      expect(result.isEmpty()).toBe(true);
    });
    
    test('should fail with invalid URL', async () => {
      const body = {
        url: 'not-a-valid-url',
        interval: 10
      };
      
      const result = await runValidation(createServiceValidation, body);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toBe('Invalid URL');
    });
    
    test('should fail with invalid interval', async () => {
      const body = {
        url: 'https://example.com',
        interval: 0
      };
      
      const result = await runValidation(createServiceValidation, body);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toBe('Interval must be a positive integer');
    });
    
    test('should fail with invalid monitor type', async () => {
      const body = {
        url: 'https://example.com',
        interval: 10,
        monitorType: 'invalid-type'
      };
      
      const result = await runValidation(createServiceValidation, body);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toBe('Invalid monitor type');
    });
    
    test('should fail with invalid port number', async () => {
      const body = {
        url: 'https://example.com',
        interval: 10,
        monitorType: 'tcp',
        port: 70000 // Port too high
      };
      
      const result = await runValidation(createServiceValidation, body);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toBe('Port must be between 1 and 65535');
    });
    
    test('should fail with invalid packet count', async () => {
      const body = {
        url: 'https://example.com',
        interval: 10,
        monitorType: 'ping',
        packetCount: 15 // Too many packets
      };
      
      const result = await runValidation(createServiceValidation, body);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toBe('Packet count must be between 1 and 10');
    });
    
    test('should fail with invalid timeout', async () => {
      const body = {
        url: 'https://example.com',
        interval: 10,
        monitorType: 'ping',
        packetCount: 3,
        timeoutSeconds: 100 // Timeout too long
      };
      
      const result = await runValidation(createServiceValidation, body);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toBe('Timeout must be between 1 and 60 seconds');
    });
  });
  
  describe('loginValidation', () => {
    test('should pass with valid login data', async () => {
      const body = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      const result = await runValidation(loginValidation, body);
      expect(result.isEmpty()).toBe(true);
    });
    
    test('should fail with invalid email', async () => {
      const body = {
        email: 'not-an-email',
        password: 'password123'
      };
      
      const result = await runValidation(loginValidation, body);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toBe('Invalid email');
    });
    
    test('should fail with empty password', async () => {
      const body = {
        email: 'test@example.com',
        password: ''
      };
      
      const result = await runValidation(loginValidation, body);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toBe('Password is required');
    });
  });
}); 