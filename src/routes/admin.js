const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin');
const { protect, hasRole } = require('../middleware/auth');

// All routes require authentication and admin role
router.use(protect);
router.use(hasRole(['admin']));

// Admin routes
router.get('/stats', adminController.getStats);
router.get('/users', adminController.getAllUsers);
router.get('/services', adminController.getAllServices);

module.exports = router; 