const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const jwtUtils = require('../../utils/jwt');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn()
  }
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('JWT Utilities', () => {
  // Mock data
  const mockUser = {
    _id: 'user123',
    email: 'test@example.com',
    subscription: { plan: 'basic' }
  };
  
  const mockToken = 'mock.jwt.token';
  const mockExpiredToken = 'expired.jwt.token';
  const mockInvalidToken = 'invalid.format.token';
  
  const mockSecrets = {
    jwt: {
      current: 'currentSecret',
      previous: 'previousSecret'
    }
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementations
    fs.readFile.mockResolvedValue(JSON.stringify(mockSecrets));
    fs.writeFile.mockResolvedValue();
    
    // Mock JWT sign and verify methods
    jwt.sign.mockReturnValue(mockToken);
    jwt.verify.mockImplementation((token, secret, options) => {
      if (token === mockExpiredToken) {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      } else if (token === mockInvalidToken) {
        throw new jwt.JsonWebTokenError('invalid token');
      } else if (token === mockToken) {
        if (secret === mockSecrets.jwt.current || secret === mockSecrets.jwt.previous) {
          return { id: mockUser._id, email: mockUser.email, plan: mockUser.subscription.plan };
        }
      }
      throw new Error('Invalid token or secret');
    });
  });

  describe('Token Generation', () => {
    test('should generate a valid token for a user', async () => {
      const token = await jwtUtils.generateToken(mockUser);
      
      expect(token).toBe(mockToken);
      expect(jwt.sign).toHaveBeenCalledWith(
        {
          id: mockUser._id,
          email: mockUser.email,
          plan: mockUser.subscription.plan
        },
        mockSecrets.jwt.current,
        expect.objectContaining({
          expiresIn: expect.any(String),
          algorithm: 'HS256'
        })
      );
      expect(fs.readFile).toHaveBeenCalled();
    });

    test('should handle users without subscription plans', async () => {
      const userWithoutSub = { _id: 'user456', email: 'noplan@example.com' };
      
      const token = await jwtUtils.generateToken(userWithoutSub);
      
      expect(token).toBe(mockToken);
      expect(jwt.sign).toHaveBeenCalledWith(
        {
          id: userWithoutSub._id,
          email: userWithoutSub.email,
          plan: 'free'
        },
        mockSecrets.jwt.current,
        expect.any(Object)
      );
    });
  });

  describe('Token Validation', () => {
    test('should successfully validate a valid token', async () => {
      const result = await jwtUtils.verifyTokenWithRotation(mockToken);
      
      expect(result).toEqual({
        id: mockUser._id,
        email: mockUser.email,
        plan: mockUser.subscription.plan
      });
      expect(jwt.verify).toHaveBeenCalledWith(
        mockToken, 
        mockSecrets.jwt.current, 
        expect.objectContaining({ ignoreExpiration: false })
      );
    });

    test('should validate token with previous secret if current fails', async () => {
      // Mock jwt.verify to fail with current secret but succeed with previous
      jwt.verify
        .mockImplementationOnce(() => {
          throw new Error('Invalid signature');
        })
        .mockImplementation((token, secret, options) => {
          if (secret === mockSecrets.jwt.previous) {
            return { id: mockUser._id, email: mockUser.email, plan: mockUser.subscription.plan };
          }
          throw new Error('Invalid token or secret');
        });
      
      const result = await jwtUtils.verifyTokenWithRotation(mockToken);
      
      expect(result).toEqual({
        id: mockUser._id,
        email: mockUser.email,
        plan: mockUser.subscription.plan
      });
      expect(jwt.verify).toHaveBeenCalledTimes(2);
      expect(jwt.verify).toHaveBeenNthCalledWith(
        1, 
        mockToken, 
        mockSecrets.jwt.current, 
        expect.objectContaining({ ignoreExpiration: false })
      );
      expect(jwt.verify).toHaveBeenNthCalledWith(
        2, 
        mockToken, 
        mockSecrets.jwt.previous, 
        expect.objectContaining({ ignoreExpiration: false })
      );
    });

    test('should return null for invalid token format', async () => {
      const result = await jwtUtils.verifyTokenWithRotation(null);
      
      expect(result).toBeNull();
      expect(jwt.verify).not.toHaveBeenCalled();
    });
  });

  describe('Token Expiration', () => {
    test('should handle expired tokens', async () => {
      jwt.verify
        .mockImplementationOnce(() => {
          throw new jwt.TokenExpiredError('jwt expired', new Date());
        })
        .mockImplementationOnce(() => {
          throw new jwt.TokenExpiredError('jwt expired', new Date());
        });

      const result = await jwtUtils.verifyTokenWithRotation(mockExpiredToken);
      
      expect(result).toBeNull();
      expect(jwt.verify).toHaveBeenCalledWith(
        mockExpiredToken, 
        mockSecrets.jwt.current, 
        expect.objectContaining({ ignoreExpiration: false })
      );
    });

    test('should try previous secret for expired tokens', async () => {
      // Set up jwt.verify to throw TokenExpiredError for first call, then succeed
      jwt.verify
        .mockImplementationOnce(() => {
          throw new jwt.TokenExpiredError('jwt expired', new Date());
        })
        .mockImplementation((token, secret, options) => {
          if (secret === mockSecrets.jwt.previous) {
            return { id: mockUser._id, email: mockUser.email, plan: mockUser.subscription.plan };
          }
          throw new Error('Invalid token or secret');
        });
      
      const result = await jwtUtils.verifyTokenWithRotation(mockToken);
      
      expect(result).toEqual({
        id: mockUser._id,
        email: mockUser.email,
        plan: mockUser.subscription.plan
      });
      expect(jwt.verify).toHaveBeenCalledTimes(2);
    });
  });

  describe('Invalid Token Scenarios', () => {
    test('should handle malformed tokens', async () => {
      jwt.verify
        .mockImplementationOnce(() => {
          throw new jwt.JsonWebTokenError('invalid token');
        })
        .mockImplementationOnce(() => {
          throw new jwt.JsonWebTokenError('invalid token');
        });

      const result = await jwtUtils.verifyTokenWithRotation(mockInvalidToken);
      
      expect(result).toBeNull();
      expect(jwt.verify).toHaveBeenCalledWith(
        mockInvalidToken, 
        mockSecrets.jwt.current, 
        expect.objectContaining({ ignoreExpiration: false })
      );
    });

    test('should handle empty tokens', async () => {
      const result = await jwtUtils.verifyTokenWithRotation('');
      
      expect(result).toBeNull();
      expect(jwt.verify).not.toHaveBeenCalled();
    });

    test('should handle non-string tokens', async () => {
      const result = await jwtUtils.verifyTokenWithRotation(123);
      
      expect(result).toBeNull();
      expect(jwt.verify).not.toHaveBeenCalled();
    });
  });

  describe('Secret Management', () => {
    test('should load secrets from file', async () => {
      const secrets = await jwtUtils.loadSecrets();
      
      expect(secrets).toEqual(mockSecrets);
      expect(fs.readFile).toHaveBeenCalled();
    });

    test('should create new secrets if file does not exist', async () => {
      // Simulate file not found error
      fs.readFile.mockRejectedValueOnce({ code: 'ENOENT' });
      fs.writeFile.mockResolvedValueOnce();
      
      const secrets = await jwtUtils.loadSecrets();
      
      expect(secrets).toHaveProperty('jwt');
      expect(secrets.jwt).toHaveProperty('current');
      expect(secrets.jwt.previous).toBeNull();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('should save secrets to file', async () => {
      await jwtUtils.saveSecrets(mockSecrets);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(mockSecrets, null, 2),
        expect.objectContaining({ encoding: 'utf8', mode: 0o600 })
      );
    });
  });

  describe('Token Refresh Mechanism', () => {
    test('should refresh tokens by rotating secrets', async () => {
      const rotatedSecrets = {
        jwt: {
          current: 'newSecret',
          previous: mockSecrets.jwt.current
        }
      };
      
      fs.readFile.mockResolvedValueOnce(JSON.stringify(rotatedSecrets));
      
      jwt.verify
        .mockImplementationOnce(() => {
          throw new Error('Invalid signature with new key');
        })
        .mockImplementationOnce((token, secret, options) => {
          if (secret === rotatedSecrets.jwt.previous) {
            return { id: mockUser._id, email: mockUser.email, plan: mockUser.subscription.plan };
          }
          throw new Error('Invalid token or secret');
        });
      
      const result = await jwtUtils.verifyTokenWithRotation(mockToken);
      
      expect(result).toEqual({
        id: mockUser._id,
        email: mockUser.email,
        plan: mockUser.subscription.plan
      });
      expect(jwt.verify).toHaveBeenCalledTimes(2);
      expect(jwt.verify).toHaveBeenNthCalledWith(
        1, 
        mockToken, 
        rotatedSecrets.jwt.current, 
        expect.objectContaining({ ignoreExpiration: false })
      );
      expect(jwt.verify).toHaveBeenNthCalledWith(
        2, 
        mockToken, 
        rotatedSecrets.jwt.previous, 
        expect.objectContaining({ ignoreExpiration: false })
      );
    });

    test('should generate new token with current secret', async () => {
      // Simulate secret rotation
      const rotatedSecrets = {
        jwt: {
          current: 'newSecret',
          previous: mockSecrets.jwt.current
        }
      };
      
      // Update mock to return rotated secrets
      fs.readFile.mockResolvedValueOnce(JSON.stringify(rotatedSecrets));
      
      const newToken = await jwtUtils.generateToken(mockUser);
      
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        rotatedSecrets.jwt.current,
        expect.any(Object)
      );
    });
  });

  describe('Token Revocation', () => {
    test('should handle revoked token by rotating secrets', async () => {
      // Simulate complete secret rotation (both current and previous changed)
      const newSecrets = {
        jwt: {
          current: 'completelyNewSecret',
          previous: 'anotherNewSecret'
        }
      };
      
      // Update mock to return new secrets
      fs.readFile.mockResolvedValueOnce(JSON.stringify(newSecrets));
      
      // Previous token should no longer be valid
      jwt.verify
        .mockImplementationOnce(() => {
          throw new Error('Invalid signature with new key');
        })
        .mockImplementationOnce(() => {
          throw new Error('Invalid signature with previous key');
        });
      
      const result = await jwtUtils.verifyTokenWithRotation(mockToken);
      
      expect(result).toBeNull();
      expect(jwt.verify).toHaveBeenCalledTimes(2);
    });

    test('should generate secure secrets of proper length', () => {
      const secret = jwtUtils.generateSecureSecret();
      
      // Should be a hex string representation of 64 bytes (128 chars)
      expect(secret).toHaveLength(128);
    });

    test('should generate secure secrets with custom length', () => {
      const secret = jwtUtils.generateSecureSecret(32);
      
      // Should be a hex string representation of 32 bytes (64 chars)
      expect(secret).toHaveLength(64);
    });
  });
});