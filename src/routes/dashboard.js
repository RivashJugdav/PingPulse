// src/routes/dashboard.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Dashboard endpoints
router.get('/stats', dashboardController.getDashboardStats);
router.get('/service-status', dashboardController.getServiceStatusSummary);

module.exports = router;