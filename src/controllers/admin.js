// src/controllers/admin.js
const User = require('../models/User');
const PingService = require('../models/PingService');
const logger = require('../utils/logger');

// Get system stats
exports.getStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const freeUsers = await User.countDocuments({ 
      'subscription.plan': 'free',
      role: 'user',
      'subscription.active': true
    });
    const basicUsers = await User.countDocuments({ 
      'subscription.plan': 'basic',
      role: 'user',
      'subscription.active': true
    });
    const premiumUsers = await User.countDocuments({ 
      'subscription.plan': 'premium',
      role: 'user',
      'subscription.active': true
    });
    
    const totalServices = await PingService.countDocuments();
    const activeServices = await PingService.countDocuments({ active: true });
    
    // Calculate revenue (basic plan: $5, premium plan: $15)
    const monthlyRevenue = (basicUsers * 5) + (premiumUsers * 15);
    
    res.json({
      users: {
        total: totalUsers,
        byPlan: {
          free: freeUsers,
          basic: basicUsers,
          premium: premiumUsers
        }
      },
      services: {
        total: totalServices,
        active: activeServices
      },
      revenue: {
        monthly: monthlyRevenue
      }
    });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ message: 'Failed to get stats' });
  }
};

// Get all users (with pagination)
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const users = await User.find()
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await User.countDocuments();
    
    res.json({
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get all users error:', error);
    res.status(500).json({ message: 'Failed to get users' });
  }
};

// Get all ping services (with pagination)
exports.getAllServices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const services = await PingService.find()
      .populate('userId', 'name email subscription')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await PingService.countDocuments();
    
    res.json({
      services,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get all services error:', error);
    res.status(500).json({ message: 'Failed to get services' });
  }
};