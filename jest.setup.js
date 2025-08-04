// Global security test utilities
global.securityTestUtils = {
  generateTestData: () => {
    return {
      valid: {
        email: 'test@example.com',
        password: 'ValidP@ssw0rd123',
        name: 'Test User'
      },
      malicious: {
        xss: '<script>alert("xss")</script>',
        sqlInjection: "' OR '1'='1",
        commandInjection: '$(cat /etc/passwd)',
        largePayload: 'A'.repeat(11 * 1024 * 1024), // 11MB to trigger size limit
        pathTraversal: '../../../etc/passwd',
        noSqlInjection: { $gt: '' },
        prototypePollution: JSON.parse('{"__proto__": {"polluted": true}}')
      }
    };
  },

  checkSecurityHeaders: (response) => {
    const requiredHeaders = [
      'x-frame-options',
      'x-content-type-options',
      'x-xss-protection',
      'strict-transport-security',
      'content-security-policy',
      'referrer-policy',
      'permissions-policy'
    ];
    
    const missingHeaders = requiredHeaders.filter(header => !response.headers[header]);
    return {
      hasAllHeaders: missingHeaders.length === 0,
      missingHeaders
    };
  }
}; 

// Disable automatic test running in any environment
if (typeof jest !== 'undefined') {
  // Force disable watch mode
  jest.setTimeout(60000);
  
  // Clear any mocks that might conflict with real app
  if (process.env.NODE_ENV !== 'test') {
    // This would restore any mocked modules when not in test mode
    jest.restoreAllMocks && jest.restoreAllMocks();
  }
} 