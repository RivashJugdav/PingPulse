const jwt = require('jsonwebtoken');

// Use a fixed secret for testing
const TEST_JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only';

const mockVerifyTokenWithRotation = async (token) => {
  try {
    const decoded = jwt.verify(token, TEST_JWT_SECRET);
    return {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      plan: decoded.plan
    };
  } catch (error) {
    throw error;
  }
};

const mockLoadSecrets = async () => {
  return {
    jwt: {
      current: TEST_JWT_SECRET,
      previous: null
    }
  };
};

const mockGenerateToken = async (user) => {
  // Ensure role is included in token
  const tokenData = {
    id: user._id.toString(), // Convert ObjectId to string
    email: user.email,
    role: user.role || 'user',
    plan: user.subscription?.plan || 'free'
  };

  return jwt.sign(
    tokenData,
    TEST_JWT_SECRET,
    { 
      expiresIn: '24h'
    }
  );
};

module.exports = {
  verifyTokenWithRotation: mockVerifyTokenWithRotation,
  loadSecrets: mockLoadSecrets,
  generateToken: mockGenerateToken,
  saveSecrets: jest.fn(),
  generateSecureSecret: jest.fn(),
  TEST_JWT_SECRET // Export for use in other test files
}; 