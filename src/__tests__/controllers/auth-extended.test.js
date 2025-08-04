const authController = require('../../controllers/auth');
const User = require('../../models/User');
const jwtUtils = require('../../utils/jwt');
const { validationResult } = require('express-validator');
const logger = require('../../utils/logger');
const { sendVerificationEmail } = require('../../utils/email');

// Mock dependencies
jest.mock('../../models/User');
jest.mock('../../utils/jwt');
jest.mock('express-validator');
jest.mock('../../utils/logger');
jest.mock('../../utils/email');

// Create mock response object
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('Auth Controller Extended Tests', () => {
  let req, res;
  
  beforeEach(() => {
    jest.clearAllMocks();
    res = mockResponse();
    validationResult.mockReturnValue({ isEmpty: () => true });
  });
  
  describe('Email Verification', () => {
    beforeEach(() => {
      req = {
        body: {
          email: 'test@example.com',
          code: '123456'
        }
      };
    });
    
    test('should verify email successfully', async () => {
      // Mock user with verification code
      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        verified: false,
        verificationCode: 123456,
        subscription: { plan: 'free', active: true },
        save: jest.fn().mockResolvedValue(true)
      };
      
      // Mock User.findOne
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      
      // Mock token generation
      jwtUtils.generateToken = jest.fn().mockReturnValue('mock.jwt.token');
      
      await authController.verifyEmail(req, res);
      
      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUser.verified).toBe(true);
      expect(mockUser.verificationCode).toBeUndefined();
      expect(mockUser.save).toHaveBeenCalled();
      expect(jwtUtils.generateToken).toHaveBeenCalledWith(mockUser);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        token: 'mock.jwt.token',
        message: 'Email verified successfully.'
      }));
    });
    
    test('should return 404 if user not found', async () => {
      // Mock User.findOne to return null
      User.findOne = jest.fn().mockResolvedValue(null);
      
      await authController.verifyEmail(req, res);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found.'
      }));
    });
  });
  
  describe('Profile Management', () => {
    describe('getProfile', () => {
      beforeEach(() => {
        req = {
          user: {
            _id: 'user123',
            name: 'Test User',
            email: 'test@example.com',
            subscription: { plan: 'basic', active: true }
          }
        };
      });
      
      test('should return user profile', async () => {
        await authController.getProfile(req, res);
        
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          id: 'user123',
          name: 'Test User',
          email: 'test@example.com',
          subscription: expect.objectContaining({
            plan: 'basic',
            active: true
          })
        }));
      });
    });
    
    describe('updateProfile', () => {
      beforeEach(() => {
        req = {
          user: {
            _id: 'user123',
            name: 'Test User',
            email: 'test@example.com'
          },
          body: {
            name: 'Updated Name'
          }
        };
      });
      
      test('should update profile with name change', async () => {
        // Mock User.findByIdAndUpdate
        User.findByIdAndUpdate = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            _id: 'user123',
            name: 'Updated Name',
            email: 'test@example.com'
          })
        });
        
        await authController.updateProfile(req, res);
        
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
          'user123',
          { $set: { name: 'Updated Name' } },
          expect.objectContaining({ new: true, runValidators: true })
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          user: expect.objectContaining({
            name: 'Updated Name'
          }),
          message: 'Profile updated successfully'
        }));
      });
    });
  });
  
  describe('Password Management', () => {
    describe('changePassword', () => {
      beforeEach(() => {
        req = {
          user: {
            _id: 'user123'
          },
          body: {
            currentPassword: 'password123',
            newPassword: 'newPassword123'
          }
        };
      });
      
      test('should change password with correct current password', async () => {
        // Mock user with comparePassword
        const mockUser = {
          _id: 'user123',
          comparePassword: jest.fn().mockResolvedValue(true),
          save: jest.fn().mockResolvedValue(true)
        };
        
        // Mock User.findById
        User.findById = jest.fn().mockResolvedValue(mockUser);
        
        await authController.changePassword(req, res);
        
        expect(User.findById).toHaveBeenCalledWith('user123');
        expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
        expect(mockUser.password).toBe('newPassword123');
        expect(mockUser.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          message: 'Password updated successfully'
        }));
      });
      
      test('should return 401 if current password is incorrect', async () => {
        // Mock user with comparePassword
        const mockUser = {
          _id: 'user123',
          comparePassword: jest.fn().mockResolvedValue(false)
        };
        
        // Mock User.findById
        User.findById = jest.fn().mockResolvedValue(mockUser);
        
        await authController.changePassword(req, res);
        
        expect(User.findById).toHaveBeenCalledWith('user123');
        expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          message: 'Current password is incorrect'
        }));
      });
    });
    
    describe('forgotPassword', () => {
      beforeEach(() => {
        req = {
          body: {
            email: 'test@example.com'
          }
        };
      });
      
      test('should send reset code for existing user', async () => {
        // Mock user
        const mockUser = {
          email: 'test@example.com',
          save: jest.fn().mockResolvedValue(true)
        };
        
        // Mock User.findOne
        User.findOne = jest.fn().mockResolvedValue(mockUser);
        
        // Mock email sending
        sendVerificationEmail.mockResolvedValue(true);
        
        await authController.forgotPassword(req, res);
        
        expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
        expect(mockUser.resetPasswordToken).toBeDefined();
        expect(mockUser.resetPasswordExpires).toBeDefined();
        expect(mockUser.save).toHaveBeenCalled();
        expect(sendVerificationEmail).toHaveBeenCalledWith('test@example.com', expect.any(Number));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          message: expect.stringContaining('If the email exists')
        }));
      });
    });
    
    describe('resetPassword', () => {
      beforeEach(() => {
        req = {
          body: {
            email: 'test@example.com',
            code: '123456',
            newPassword: 'newPassword123'
          }
        };
      });
      
      test('should reset password with valid code', async () => {
        // Mock user with reset token
        const mockUser = {
          email: 'test@example.com',
          resetPasswordToken: 123456,
          resetPasswordExpires: Date.now() + 3600000, // 1 hour from now
          save: jest.fn().mockResolvedValue(true)
        };
        
        // Mock User.findOne
        User.findOne = jest.fn().mockResolvedValue(mockUser);
        
        await authController.resetPassword(req, res);
        
        expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
        expect(mockUser.password).toBe('newPassword123');
        expect(mockUser.resetPasswordToken).toBeUndefined();
        expect(mockUser.resetPasswordExpires).toBeUndefined();
        expect(mockUser.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          message: 'Password reset successfully.'
        }));
      });
    });
  });
}); 