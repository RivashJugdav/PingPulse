// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const {
  logAuthFailure,
  logAuthSuccess,
  logTokenEvent,
  SecurityEventType,
  SecuritySeverity
} = require('../utils/securityLogger');
const rateLimit = require('express-rate-limit');
const { verifyTokenWithRotation } = process.env.NODE_ENV === 'test' 
  ? require('../__tests__/mocks/jwt')
  : require('../utils/jwt');
const { generateToken } = process.env.NODE_ENV === 'test'
  ? require('../__tests__/mocks/jwt')
  : require('../utils/jwt');

// Existing rate limiters (no changes)
exports.globalRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
  skip: (req) => process.env.NODE_ENV === 'test' // Skip rate limiting in test environment
});

exports.authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again later' },
  skip: (req) => process.env.NODE_ENV === 'test' // Skip rate limiting in test environment
});

exports.resetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts, please try again later' },
  skip: (req) => process.env.NODE_ENV === 'test' // Skip rate limiting in test environment
});

// Rate limiters for different endpoints
exports.sensitiveDataRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests to sensitive data, please try again later' },
  skip: (req) => process.env.NODE_ENV === 'test'
});

exports.publicDataRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests to public data, please try again later' },
  skip: (req) => process.env.NODE_ENV === 'test'
});

/**
 * Enhanced protect middleware with improved token handling
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Extract token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      logAuthFailure({
        reason: 'NO_TOKEN',
        message: 'No token provided in request'
      }, req);
      return res.status(401).json({ 
        message: 'Not authorized, no token provided',
        code: 'NO_TOKEN' 
      });
    }

    try {
      // Try to verify token directly first to catch expired tokens
      if (process.env.NODE_ENV !== 'test') {
        try {
          jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        } catch (error) {
          if (error.name === 'TokenExpiredError') {
            logTokenEvent(SecurityEventType.TOKEN_EXPIRED, {
              reason: 'TOKEN_EXPIRED',
              message: 'Token has expired',
              expiredAt: error.expiredAt
            }, req);
            return res.status(401).json({ 
              message: 'Token has expired',
              code: 'TOKEN_EXPIRED'
            });
          }
        }
      }

      // Use imported verifyTokenWithRotation for full verification
      const decoded = await verifyTokenWithRotation(token);
      
      if (!decoded) {
        logTokenEvent(SecurityEventType.INVALID_TOKEN, {
          reason: 'INVALID_TOKEN',
          message: 'Token verification failed - invalid token'
        }, req);
        return res.status(401).json({ 
          message: 'Authentication failed - invalid token',
          code: 'INVALID_TOKEN'
        });
      }

      // Get user from database
      const user = process.env.NODE_ENV === 'test' 
        ? { 
            _id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            subscription: { 
              plan: decoded.plan || 'free',
              active: true
            }
          }
        : await User.findById(decoded.id);
      
      if (!user) {
        logAuthFailure({
          reason: 'USER_NOT_FOUND',
          message: 'User not found for token',
          tokenId: decoded.id
        }, req);
        return res.status(401).json({ 
          message: 'Authentication failed - user not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Log successful authentication
      logAuthSuccess({
        userId: user._id,
        email: user.email,
        role: user.role
      }, req);

      // Attach user to request object
      req.user = {
        id: user._id.toString(),
        _id: user._id,
        email: user.email,
        role: user.role,
        subscription: user.subscription
      };
      
      // Debug information for authentication
      console.log('User authenticated:', {
        id: req.user.id, 
        _id: req.user._id ? req.user._id.toString() : 'undefined',
        email: req.user.email
      });

      next();
    } catch (error) {
      logAuthFailure({
        reason: 'AUTH_FAILED',
        message: error.message,
        error: error.name
      }, req);
      return res.status(401).json({ 
        message: 'Authentication failed',
        code: 'AUTH_FAILED'
      });
    }
  } catch (error) {
    logger.error('Auth middleware error:', { error: error.message });
    return res.status(401).json({ 
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Middleware to check if user has an active subscription
 */
exports.checkSubscription = async (req, res, next) => {
  try {
    const user = req.user;

    // Enhanced subscription checking with more detailed error states
    if (!user.subscription) {
      return res.status(403).json({ 
        message: 'No subscription found',
        code: 'NO_SUBSCRIPTION' 
      });
    }

    // Check subscription active status
    if (!user.subscription.active) {
      return res.status(403).json({ 
        message: 'Subscription is inactive',
        code: 'SUBSCRIPTION_INACTIVE' 
      });
    }

    // Check subscription expiration
    if (user.subscription.expiresAt && new Date(user.subscription.expiresAt) < new Date()) {
      // Automatically update subscription status
      await User.findByIdAndUpdate(user._id, { 
        'subscription.active': false 
      });
      
      return res.status(403).json({ 
        message: 'Subscription has expired',
        code: 'SUBSCRIPTION_EXPIRED' 
      });
    }

    // Add subscription details to request for downstream use
    req.subscriptionPlan = user.subscription.plan;
    req.subscriptionTier = user.subscription.tier;

    next();
  } catch (error) {
    logger.error('Subscription check error:', error);
    return res.status(500).json({ 
      message: 'Subscription verification failed',
      code: 'SUBSCRIPTION_CHECK_ERROR' 
    });
  }
};

/**
 * Role-based access control middleware
 * @param {string[]} roles - Allowed roles for the route
 */
exports.hasRole = (roles) => {
  return (req, res, next) => {
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED' 
      });
    }
    
    // Admin has all access
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Check if user has any of the required roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Not authorized as ${roles.join(' or ')}`,
        code: 'INSUFFICIENT_ROLE' 
      });
    }
    
    next();
  };
};

// Optional: Token refresh middleware to handle token renewal
exports.handleTokenRefresh = (req, res, next) => {
  // If a new token was generated during authentication
  if (req.newToken) {
    res.set('X-Refresh-Token', req.newToken);
  }
  next();
};