// src/routes/ping.js
const express = require('express');
const router = express.Router();
const pingController = require('../controllers/ping');
const { protect, checkSubscription } = require('../middleware/auth');
const { createServiceValidation } = require('../utils/validation');
const { validate } = require('../middleware/validator');
const { sendMessage } = require('../utils/anthropic');

router.post('/test-claude', async (req, res) => {
  try {
    const response = await sendMessage(req.body.prompt);
    res.json({ response: response.content[0].text });
  } catch (error) {
    res.status(500).json({ error: 'Failed to communicate with Claude' });
  }
});


// All routes require authentication
router.use(protect);

// Diagnostic route should be defined before parameterized routes
const diagnosticHandler = async (req, res) => {
    try {
      const PingService = require('../models/PingService');
      const User = require('../models/User');
      
      // Get counts
      const totalServices = await PingService.countDocuments({});
      const activeServices = await PingService.countDocuments({ active: true });
      
      // Get users with active subscriptions
      const activeUsers = await User.countDocuments({ 'subscription.active': true });
      
      // Get services that should be monitored
      const services = await PingService.find({ active: true })
        .populate('userId', 'subscription');
        
      const validServices = services.filter(service => {
        const user = service.userId;
        return user && 
               user.subscription && 
               user.subscription.active && 
               (!user.subscription.expiresAt || new Date(user.subscription.expiresAt) > new Date());
      });
      
      // Get pingScheduler metrics
      const pingScheduler = require('../services/pingScheduler');
      const metrics = pingScheduler.getMetrics();
      
      res.json({
        counts: {
          totalServices,
          activeServices,
          activeUsers,
          validServices: validServices.length
        },
        scheduler: {
          isRunning: metrics.isRunning,
          activeJobs: metrics.activeJobs,
          totalPings: metrics.totalPings,
          successfulPings: metrics.successfulPings,
          failedPings: metrics.failedPings
        },
        // Include the first few valid services for inspection
        sampleServices: validServices.slice(0, 3).map(s => ({
          id: s._id,
          url: s.url,
          interval: s.interval,
          active: s.active,
          userId: s.userId._id,
          subscriptionActive: s.userId.subscription.active
        }))
      });
    } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

router.get('/diagnostic', diagnosticHandler);

// Service logs
router.get('/logs', pingController.getAllLogs);
router.get('/:id/logs', pingController.getServiceLogs);

// Service management routes
router.get('/', pingController.getAllServices);
router.post('/', checkSubscription, validate(createServiceValidation), pingController.createService);
router.get('/:id', pingController.getServiceById);
router.put('/:id', checkSubscription, pingController.updateService);
router.delete('/:id', pingController.deleteService);

// Manual ping (for testing)
router.post('/:id/ping', checkSubscription, pingController.pingServiceManually);



module.exports = router;