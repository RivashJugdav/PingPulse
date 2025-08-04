// src/routes/subscription.js
const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Subscription management
router.get('/', subscriptionController.getSubscription);
router.post('/update', subscriptionController.updateSubscription);
router.post('/cancel', subscriptionController.cancelSubscription);

module.exports = router;