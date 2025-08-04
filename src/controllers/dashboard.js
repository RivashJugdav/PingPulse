// src/controllers/dashboard.js
const PingService = require('../models/PingService');
const logger = require('../utils/logger');

// Get dashboard overview statistics
exports.getDashboardStats = async (req, res) => {
  try {
    // Get all user services
    const services = await PingService.find({ userId: req.user._id });
    
    // Calculate basic stats
    const totalServices = services.length;
    const activeServices = services.filter(s => s.active).length;
    const inactiveServices = totalServices - activeServices;
    
    // Count services by status
    const healthyServices = services.filter(s => s.lastStatus === 'success').length;
    const errorServices = services.filter(s => s.lastStatus === 'error').length;
    const pendingServices = services.filter(s => !s.lastStatus || s.lastStatus === 'pending').length;
    
    // Calculate ping frequency (pings per day)
    const pingsPerDay = services.reduce((total, service) => {
      if (service.active) {
        // Calculate pings per day based on interval (minutes)
        return total + Math.round((24 * 60) / service.interval);
      }
      return total;
    }, 0);
    
    // Get recent logs (across all services)
    const recentLogs = services.reduce((logs, service) => {
      if (service.logs && service.logs.length > 0) {
        const serviceLogs = service.logs.map(log => ({
          serviceId: service._id,
          serviceName: service.name,
          serviceUrl: service.url,
          timestamp: log.timestamp,
          status: log.status,
          responseTime: log.responseTime,
          message: log.message
        }));
        return logs.concat(serviceLogs);
      }
      return logs;
    }, []);
    
    // Sort logs by timestamp (newest first) and limit to 20
    recentLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedLogs = recentLogs.slice(0, 20);
    
    res.json({
      totalServices,
      activeServices,
      inactiveServices,
      healthyServices,
      errorServices,
      pendingServices,
      pingsPerDay,
      recentLogs: limitedLogs
    });
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Failed to get dashboard stats', error: error.message });
  }
};

// Get service status summary
exports.getServiceStatusSummary = async (req, res) => {
  try {
    // Get all active user services
    const services = await PingService.find({ 
      userId: req.user._id,
      active: true 
    });
    
    // Prepare service status summary
    const serviceStatus = services.map(service => ({
      id: service._id,
      name: service.name,
      url: service.url,
      status: service.lastStatus || 'pending',
      lastPinged: service.lastPinged,
      interval: service.interval,
      uptime: service.uptime
    }));
    
    res.json(serviceStatus);
  } catch (error) {
    logger.error('Get service status summary error:', error);
    res.status(500).json({ message: 'Failed to get service status', error: error.message });
  }
};