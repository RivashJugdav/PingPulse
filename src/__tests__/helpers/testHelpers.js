const { generateToken } = require('../mocks/jwt');

const createTestUser = async () => {
  return {
    _id: 'testUserId',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    subscription: {
      plan: 'free',
      active: true
    }
  };
};

const generateTestToken = async (user) => {
  return generateToken(user || await createTestUser());
};

module.exports = {
  createTestUser,
  generateTestToken
};