const { protect, checkSubscription, hasRole, handleTokenRefresh } = require('../../middleware/auth');
const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger');
const { logAuthFailure, logAuthSuccess, logTokenEvent } = require('../../utils/securityLogger');

// Set environment to test
process.env.NODE_ENV = 'test';

// Mock the security logger
jest.mock('../../utils/securityLogger', () => ({
  logAuthFailure: jest.fn(),
  logAuthSuccess: jest.fn(),
  logTokenEvent: jest.fn(),
  SecurityEventType: {
    AUTH_FAILURE: 'AUTH_FAILURE',
    AUTH_SUCCESS: 'AUTH_SUCCESS',
    INVALID_TOKEN: 'INVALID_TOKEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED'
  },
  SecuritySeverity: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
  }
}));

// Mock the logger
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock the User model
jest.mock('../../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

// Mock the jwt module
jest.mock('../../__tests__/mocks/jwt', () => ({
  verifyTokenWithRotation: jest.fn(),
  generateToken: jest.fn()
}));

const { verifyTokenWithRotation } = require('../../__tests__/mocks/jwt');

describe('Auth Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      headers: {},
      user: null,
      id: 'test-request-id',
      method: 'GET',
      url: '/test',
      ip: '127.0.0.1',
      get: jest.fn()
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Setup verifyTokenWithRotation mock
    verifyTokenWithRotation.mockImplementation(async (token) => {
      if (!token) {
        return null;
      }
      if (token === 'invalidtoken') {
        return null;
      }
      if (token === 'validtoken') {
        return {
          id: 'user123',
          email: 'test@example.com',
          role: 'user',
          plan: 'free'
        };
      }
      return null;
    });

    // Setup logAuthFailure mock
    logAuthFailure.mockImplementation((data, req) => {
      // Mock implementation to help with test verification
      return;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('protect middleware', () => {
    test('should return 401 if no token is provided', async () => {
      await protect(req, res, next);
      
      expect(logAuthFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'NO_TOKEN',
          message: 'No token provided in request'
        }),
        req
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Not authorized, no token provided',
        code: 'NO_TOKEN'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if token is invalid', async () => {
      req.headers.authorization = 'Bearer invalidtoken';

      await protect(req, res, next);
      
      expect(verifyTokenWithRotation).toHaveBeenCalledWith('invalidtoken');
      expect(logTokenEvent).toHaveBeenCalledWith(
        'INVALID_TOKEN',
        expect.objectContaining({
          reason: 'INVALID_TOKEN',
          message: 'Token verification failed - invalid token'
        }),
        req
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Authentication failed - invalid token',
        code: 'INVALID_TOKEN'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if user not found', async () => {
      req.headers.authorization = 'Bearer malformedtoken';
      
      // Mock verifyTokenWithRotation to return a decoded token
      verifyTokenWithRotation.mockResolvedValueOnce({
        id: 'nonexistentuser',
        email: 'test@example.com',
        role: 'user',
        plan: 'free'
      });
      
      // Force test environment to false to test database lookup
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      // Mock User.findById to return null
      User.findById.mockResolvedValueOnce(null);

      await protect(req, res, next);
      
      expect(verifyTokenWithRotation).toHaveBeenCalledWith('malformedtoken');
      expect(logAuthFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'USER_NOT_FOUND',
          message: 'User not found for token',
          tokenId: 'nonexistentuser'
        }),
        expect.objectContaining({
          headers: { authorization: 'Bearer malformedtoken' },
          id: 'test-request-id',
          ip: '127.0.0.1',
          method: 'GET',
          url: '/test',
          get: expect.any(Function)
        })
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Authentication failed - user not found',
        code: 'USER_NOT_FOUND'
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.user).toBe(null);
      
      // Restore test environment
      process.env.NODE_ENV = originalEnv;
    });

    test('should set req.user and call next if token is valid', async () => {
      req.headers.authorization = 'Bearer validtoken';
      
      // Mock verifyTokenWithRotation to return a decoded token
      verifyTokenWithRotation.mockResolvedValueOnce({
        id: 'user123',
        email: 'test@example.com',
        role: 'user',
        plan: 'free'
      });

      await protect(req, res, next);
      
      expect(verifyTokenWithRotation).toHaveBeenCalledWith('validtoken');
      expect(logAuthSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          email: 'test@example.com',
          role: 'user'
        }),
        req
      );
      expect(req.user).toEqual({
        id: 'user123',
        _id: 'user123',
        email: 'test@example.com',
        role: 'user',
        subscription: {
          plan: 'free',
          active: true
        }
      });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should handle thrown errors during verification', async () => {
      req.headers.authorization = 'Bearer malformedtoken';
      verifyTokenWithRotation.mockRejectedValueOnce(new Error('Verification failed'));

      await protect(req, res, next);
      
      expect(verifyTokenWithRotation).toHaveBeenCalledWith('malformedtoken');
      expect(logAuthFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'AUTH_FAILED',
          message: 'Verification failed',
          error: 'Error'
        }),
        req
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Authentication failed',
        code: 'AUTH_FAILED'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle unexpected errors', async () => {
      req.headers = null; // This will cause an error when trying to access req.headers
      
      await protect(req, res, next);
      
      expect(logger.error).toHaveBeenCalledWith(
        'Auth middleware error:',
        expect.objectContaining({
          error: expect.any(String)
        })
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Authentication failed',
        code: 'AUTH_FAILED'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('checkSubscription middleware', () => {
    test('should return 403 if no subscription found', async () => {
      req.user = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user'
      };

      await checkSubscription(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'No subscription found',
        code: 'NO_SUBSCRIPTION'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 403 if subscription is inactive', async () => {
      req.user = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user',
        subscription: {
          active: false,
          plan: 'free'
        }
      };

      await checkSubscription(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Subscription is inactive',
        code: 'SUBSCRIPTION_INACTIVE'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 403 if subscription has expired', async () => {
      req.user = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user',
        subscription: {
          active: true,
          plan: 'free',
          expiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
        }
      };

      await checkSubscription(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Subscription has expired',
        code: 'SUBSCRIPTION_EXPIRED'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next for valid subscription with no expiration', async () => {
      req.user = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user',
        subscription: {
          active: true,
          plan: 'free'
        }
      };

      await checkSubscription(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should call next for valid subscription that has not expired', async () => {
      req.user = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user',
        subscription: {
          active: true,
          plan: 'free',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) // Expires in 24 hours
        }
      };

      await checkSubscription(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should handle unexpected errors', async () => {
      req.user = null; // This will cause an error when trying to access req.user.subscription

      await checkSubscription(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Subscription verification failed',
        code: 'SUBSCRIPTION_CHECK_ERROR'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('hasRole middleware', () => {
    test('should return 401 if user is not authenticated', () => {
      const middleware = hasRole(['user', 'manager']);
      
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next if user is admin, regardless of specified roles', () => {
      req.user = { role: 'admin' };
      const middleware = hasRole(['user', 'manager']);
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should call next if user role is in allowed roles', () => {
      req.user = { role: 'manager' };
      const middleware = hasRole(['user', 'manager']);
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 if user role is not in allowed roles', () => {
      req.user = { role: 'user' };
      const middleware = hasRole(['manager', 'admin']);
      
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Not authorized as manager or admin',
        code: 'INSUFFICIENT_ROLE'
      }));
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('handleTokenRefresh middleware', () => {
    test('should set X-Refresh-Token header if req.newToken exists', () => {
      req.newToken = 'refreshed-token';
      res.set = jest.fn();
      
      handleTokenRefresh(req, res, next);
      
      expect(res.set).toHaveBeenCalledWith('X-Refresh-Token', 'refreshed-token');
      expect(next).toHaveBeenCalled();
    });

    test('should not set header if req.newToken does not exist', () => {
      res.set = jest.fn();
      
      handleTokenRefresh(req, res, next);
      
      expect(res.set).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });
});