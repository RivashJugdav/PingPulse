const { 
  getSubscription, 
  updateSubscription, 
  cancelSubscription 
} = require('../../controllers/subscription');
const User = require('../../models/User');
const logger = require('../../utils/logger');

// Mock dependencies
jest.mock('../../models/User');
jest.mock('../../utils/logger');

describe('Subscription Controller', () => {
  let req;
  let res;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup request and response objects
    req = {
      user: { 
        id: 'user123'
      },
      body: {}
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });
  
  describe('getSubscription', () => {
    test('should return subscription details for the authenticated user', async () => {
      const mockSubscription = { 
        plan: 'basic', 
        active: true, 
        expiresAt: new Date() 
      };
      
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          subscription: mockSubscription
        })
      });
      
      await getSubscription(req, res);
      
      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(res.json).toHaveBeenCalledWith(mockSubscription);
    });
    
    test('should handle errors correctly', async () => {
      const mockError = new Error('Database error');
      
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockRejectedValue(mockError)
      });
      
      await getSubscription(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Get subscription error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Failed to get subscription', 
        error: mockError.message 
      });
    });
  });
  
  describe('updateSubscription', () => {
    test('should update subscription to a valid plan', async () => {
      // Use a specific value for Date.now instead of mocking the entire Date
      const mockTimestamp = 1234567890;
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockTimestamp);
      
      req.body.plan = 'premium';
      
      const mockUpdatedSubscription = {
        plan: 'premium',
        active: true,
        expiresAt: new Date(), // Any date will do for the response
        paymentID: 'mock-payment-1234567890'
      };
      
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          subscription: mockUpdatedSubscription
        })
      });
      
      await updateSubscription(req, res);
      
      // Check that findByIdAndUpdate was called with the right user ID and update is partial object matching
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          $set: expect.objectContaining({
            'subscription.plan': 'premium',
            'subscription.active': true
          })
        }),
        { new: true }
      );
      
      // Verify the expiresAt was set (without checking the exact value)
      const updateCall = User.findByIdAndUpdate.mock.calls[0][1];
      expect(updateCall.$set['subscription.expiresAt']).toBeInstanceOf(Date);
      
      // Verify paymentID was set and contains the mock-payment prefix
      expect(updateCall.$set['subscription.paymentID']).toMatch(/^mock-payment-/);
      
      expect(res.json).toHaveBeenCalledWith(mockUpdatedSubscription);
      
      // Clean up
      Date.now = originalDateNow;
    });
    
    test('should update to free plan without expiration', async () => {
      req.body.plan = 'free';
      
      const mockUpdatedSubscription = {
        plan: 'free',
        active: true,
        expiresAt: null
      };
      
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          subscription: mockUpdatedSubscription
        })
      });
      
      await updateSubscription(req, res);
      
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        {
          $set: {
            'subscription.plan': 'free',
            'subscription.active': true,
            'subscription.expiresAt': null,
            'subscription.paymentID': expect.stringContaining('mock-payment-')
          }
        },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(mockUpdatedSubscription);
    });
    
    test('should reject invalid plans', async () => {
      req.body.plan = 'invalid-plan';
      
      await updateSubscription(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid plan' });
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
    
    test('should handle errors correctly', async () => {
      req.body.plan = 'basic';
      const mockError = new Error('Database error');
      
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockRejectedValue(mockError)
      });
      
      await updateSubscription(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Update subscription error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Failed to update subscription', 
        error: mockError.message 
      });
    });
  });
  
  describe('cancelSubscription', () => {
    test('should cancel subscription successfully', async () => {
      const mockUpdatedSubscription = {
        plan: 'free',
        active: true,
        expiresAt: null
      };
      
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          subscription: mockUpdatedSubscription
        })
      });
      
      await cancelSubscription(req, res);
      
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        {
          $set: {
            'subscription.plan': 'free',
            'subscription.active': true,
            'subscription.expiresAt': null
          }
        },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Subscription cancelled successfully', 
        subscription: mockUpdatedSubscription 
      });
    });
    
    test('should handle errors correctly', async () => {
      const mockError = new Error('Database error');
      
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockRejectedValue(mockError)
      });
      
      await cancelSubscription(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Cancel subscription error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Failed to cancel subscription', 
        error: mockError.message 
      });
    });
  });
}); 