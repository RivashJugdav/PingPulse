import './testUtils';

describe('Security Test Setup', () => {
  test('should have security test utilities available', () => {
    expect(global.securityTestUtils).toBeDefined();
    expect(typeof global.securityTestUtils.generateTestData).toBe('function');
    expect(typeof global.securityTestUtils.checkSecurityHeaders).toBe('function');
  });

  test('should generate valid test data', () => {
    const testData = global.securityTestUtils.generateTestData();
    expect(testData.valid).toBeDefined();
    expect(testData.malicious).toBeDefined();
    expect(testData.valid.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(testData.valid.password.length).toBeGreaterThan(8);
  });

  test('should check security headers correctly', () => {
    const mockResponse = {
      headers: {
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'x-xss-protection': '1; mode=block',
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'content-security-policy': "default-src 'self'",
        'referrer-policy': 'strict-origin-when-cross-origin',
        'permissions-policy': 'geolocation=(), microphone=()'
      }
    };

    const result = global.securityTestUtils.checkSecurityHeaders(mockResponse);
    expect(result.hasAllHeaders).toBe(true);
    expect(result.missingHeaders).toHaveLength(0);
  });
}); 