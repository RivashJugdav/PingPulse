// src/controllers/subscription.js
const User = require('../models/User');
const logger = require('../utils/logger');

// Get subscription details
exports.getSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('subscription');
    
    res.json(user.subscription);
  } catch (error) {
    logger.error('Get subscription error:', error);
    res.status(500).json({ message: 'Failed to get subscription', error: error.message });
  }
};

// Update subscription (mock implementation)
// In a real app, this would integrate with Stripe or another payment processor
exports.updateSubscription = async (req, res) => {
  try {
    const { plan } = req.body;
    
    // Validate plan
    if (!['free', 'basic', 'premium'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan' });
    }
    
    // Calculate expiration based on plan
    let expiresAt = null;
    if (plan !== 'free') {
      // Set expiration to 30 days from now for paid plans
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
    }
    
    // Update user subscription
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          'subscription.plan': plan,
          'subscription.active': true,
          'subscription.expiresAt': expiresAt,
          'subscription.paymentID': 'mock-payment-' + Date.now() // Mock payment ID
        }
      },
      { new: true }
    ).select('subscription');
    
    res.json(user.subscription);
  } catch (error) {
    logger.error('Update subscription error:', error);
    res.status(500).json({ message: 'Failed to update subscription', error: error.message });
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
  try {
    // Update user subscription
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          'subscription.plan': 'free',
          'subscription.active': true,
          'subscription.expiresAt': null
        }
      },
      { new: true }
    ).select('subscription');
    
    res.json({ message: 'Subscription cancelled successfully', subscription: user.subscription });
  } catch (error) {
    logger.error('Cancel subscription error:', error);
    res.status(500).json({ message: 'Failed to cancel subscription', error: error.message });
  }
};