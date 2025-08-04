const generateTestData = () => {
  return {
    valid: {
      email: 'test@example.com',
      password: 'ValidPassword123!',
      name: 'Test User'
    },
    malicious: {
      email: 'test@example.com<script>alert("xss")</script>',
      password: 'password123',
      name: '<script>alert("xss")</script>'
    }
  };
};

const checkSecurityHeaders = (response) => {
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
};

global.securityTestUtils = {
  generateTestData,
  checkSecurityHeaders
}; 