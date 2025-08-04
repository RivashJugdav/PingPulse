// src/routes/auth.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect, checkSubscription } = require('../middleware/auth');
const { validate } = require('../middleware/validator');
const { authRateLimiter, resetRateLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/auth');

// Validation schemas
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .escape(),
  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number and one special character')
];

const loginValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
];

const emailValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail()
];

const verifyEmailValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('code')
    .isNumeric().withMessage('Verification code must be numeric')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
    .escape()
];

const loginVerificationValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('code')
    .isNumeric().withMessage('Verification code must be numeric')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
    .escape()
];

const autoLoginValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('code')
    .isNumeric().withMessage('Verification code must be numeric')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
    .escape()
];

const resetPasswordValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('code')
    .isNumeric().withMessage('Reset code must be numeric')
    .isLength({ min: 6, max: 6 }).withMessage('Reset code must be 6 digits')
    .escape(),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number and one special character')
];

const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .escape(),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail()
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number and one special character')
];

const subscriptionValidation = [
  body('plan')
    .isIn(['free', 'basic', 'premium']).withMessage('Invalid subscription plan')
];

// Public routes
router.post('/register', authRateLimiter, validate(registerValidation), authController.register);

// Handle both new user verification and login verification with the same endpoint
router.post('/verify', validate(verifyEmailValidation), authController.verifyEmail);

// Keep this endpoint for backward compatibility, but use the same controller method
router.post('/verify-login', validate(loginVerificationValidation), authController.verifyEmail);

router.post('/resend-code', validate(emailValidation), authController.resendVerificationCode);
router.post('/login', authRateLimiter, validate(loginValidation), authController.login);
router.post('/auto-login', validate(autoLoginValidation), authController.autoLogin);
router.post('/forgot-password', resetRateLimiter, validate(emailValidation), authController.forgotPassword);
router.post('/reset-password', resetRateLimiter, validate(resetPasswordValidation), authController.resetPassword);
router.post('/check-user-type', validate(emailValidation), authController.checkUserType);

// Add these routes after your other public routes
router.get('/google', authController.googleLogin);
router.get('/google/callback', authController.googleCallback);

// Protected routes (require authentication)
router.get('/profile', protect, authController.getProfile);
router.put('/profile', protect, validate(updateProfileValidation), authController.updateProfile);
router.put('/change-password', protect, validate(changePasswordValidation), authController.changePassword);
router.put('/subscription', protect, validate(subscriptionValidation), authController.updateSubscription);

// Auth check endpoint for debugging
router.get('/check', protect, (req, res) => {
  // Return the user information that was attached by the protect middleware
  res.json({
    isAuthenticated: true,
    user: {
      id: req.user.id || req.user._id,
      email: req.user.email,
      role: req.user.role,
      subscription: req.user.subscription
    }
  });
});

// Premium features (example of subscription-based route restriction)
router.get('/premium-features', 
    protect, 
    checkSubscription, 
    (req, res) => {
      // Check subscription plan after middleware adds it to req
      if (req.subscriptionPlan !== 'premium') {
        return res.status(403).json({ message: 'This feature requires a premium subscription' });
      }
      res.json({ features: ['Advanced analytics', 'Priority support', 'Custom domains'] });
    }
);

// Basic and premium features
router.get('/basic-features', 
    protect, 
    checkSubscription, 
    (req, res) => {
      // Check subscription plan after middleware adds it to req
      if (req.subscriptionPlan !== 'basic' && req.subscriptionPlan !== 'premium') {
        return res.status(403).json({ message: 'This feature requires a basic or premium subscription' });
      }
      res.json({ features: ['5 ping services', 'Hourly checks', 'Email notifications'] });
    }
);

module.exports = router;