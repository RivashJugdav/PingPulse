// src/services/pingScheduler.js
const cron = require('node-cron');
const axios = require('axios');
const PingService = require('../models/PingService');
const User = require('../models/User');
const logger = require('../utils/logger');
const net = require('net'); // For TCP connections
const { promisify } = require('util');
const ping = require('ping'); // Add this to package.json: "ping": "^0.4.2"

class PingScheduler {
  constructor() {
    this.cronJobs = {};
    this.metrics = {
      totalPings: 0,
      successfulPings: 0,
      failedPings: 0,
      avgResponseTime: 0
    };
    this.isRunning = false;
    this.healthCheckInterval = null;
  }

  // Initialize and start all scheduled pings
  async init() {
    try {
      logger.info('Initializing ping scheduler');
      this.isRunning = true;
      await this.refreshSchedules();
      
      // Set up a job to refresh schedules every hour
      // This ensures new ping services are picked up
      cron.schedule('0 * * * *', async () => {
        logger.info('Refreshing ping schedules (hourly)');
        await this.refreshSchedules();
      });
      
      // Set up a job to clean up old logs every day at midnight
      cron.schedule('0 0 * * *', async () => {
        logger.info('Running daily log cleanup');
        await this.cleanupOldLogs();
      });
      
      // Set up health check
      this.healthCheckInterval = setInterval(() => this.performHealthCheck(), 3 * 60 * 1000); // Every 3 minutes
      
      logger.info('Ping scheduler initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize ping scheduler:', error);
      this.isRunning = false;
      return false;
    }
  }

  // Graceful shutdown
  async shutdown() {
    logger.info('Shutting down ping scheduler');
    this.isRunning = false;
    
    // Stop all cron jobs
    Object.values(this.cronJobs).forEach(job => job.stop());
    this.cronJobs = {};
    
    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    logger.info('Ping scheduler shut down successfully');
  }

  // For backwards compatibility and explicit API
  async refreshSchedules() {
    try {
      logger.info('Manual refresh of ping schedules triggered');
      
      if (!this.isRunning) {
        logger.warn('Cannot refresh schedules - scheduler is not running');
        return false;
      }
      
      // Stop all existing cron jobs
      Object.values(this.cronJobs).forEach(job => job.stop());
      this.cronJobs = {};
      
      // Group active ping services by interval (for logging/metrics only)
      const servicesByInterval = await this.getActiveServicesByInterval();
      
      // Create a single cron job that runs every minute to check for services that are due
      this.cronJobs['minuteChecker'] = cron.schedule('* * * * *', async () => {
        await this.checkDueServices();
      });
      
      // Log total number of services being monitored
      const totalServices = Object.values(servicesByInterval).reduce((sum, services) => sum + services.length, 0);
      logger.info(`Total services being monitored: ${totalServices}`);
      
      // Log breakdown by interval for monitoring purposes
      for (const interval in servicesByInterval) {
        logger.info(`Services with ${interval} minute interval: ${servicesByInterval[interval].length}`);
      }
      
      return true;
    } catch (error) {
      logger.error('Error refreshing ping schedules:', error);
      return false;
    }
  }

  // New method to check all services and process those that are due
  async checkDueServices() {
    try {
      if (!this.isRunning) {
        logger.warn('Skipping service check - scheduler is not running');
        return;
      }
      
      // Find all active services that are due for a ping
      const now = new Date();
      const dueServices = await PingService.find({
        active: true,
        nextPingDue: { $lte: now }
      }).populate('userId', 'subscription');
      
      if (dueServices.length === 0) {
        // No services due, no need to log every minute
        return;
      }
      
      logger.info(`Found ${dueServices.length} services due for ping`);
      
      // Group by interval for processing (maintain existing processing logic)
      const servicesByInterval = {};
      for (const service of dueServices) {
        const interval = service.interval.toString();
        if (!servicesByInterval[interval]) {
          servicesByInterval[interval] = [];
        }
        servicesByInterval[interval].push(service);
      }
      
      // Process each interval group
      for (const interval in servicesByInterval) {
        const services = servicesByInterval[interval];
        logger.info(`Processing ${services.length} services with ${interval} minute interval`);
        
        // Process services in batches to avoid overwhelming the system
        const batchSize = 10;
        const batches = Math.ceil(services.length / batchSize);
        
        for (let i = 0; i < batches; i++) {
          const batchStart = i * batchSize;
          const batchEnd = Math.min((i + 1) * batchSize, services.length);
          const serviceBatch = services.slice(batchStart, batchEnd);
          
          // Process batch with concurrency limit
          await Promise.all(serviceBatch.map(async (service) => {
            // Verify subscription is still active
            const user = service.userId;
            if (!user || 
                !user.subscription || 
                !user.subscription.active || 
                (user.subscription.expiresAt && new Date(user.subscription.expiresAt) < new Date())) {
              return;
            }
            
            try {
              await this.pingService(service);
            } catch (error) {
              logger.error(`Error pinging service ${service._id}:`, error);
            }
          }));
          
          // Brief pause between batches to avoid overwhelming the system
          if (i < batches - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    } catch (error) {
      logger.error('Error checking due services:', error);
    }
  }

  // Process a batch of pings for a specific interval
  // Note: This method is kept for backward compatibility but is no longer used directly
  // by the cron scheduler - it's now called by checkDueServices when needed
  async processPingBatch(interval) {
    try {
      if (!this.isRunning) {
        logger.warn(`Skipping ping batch for ${interval} minute interval - scheduler is not running`);
        return;
      }
      
      logger.info(`Running ping batch for ${interval} minute interval`);
      
      // Get current services for this interval
      // We query again to ensure we have the most up-to-date list
      const activeServices = await PingService.find({ 
        interval: parseInt(interval), 
        active: true 
      }).populate('userId', 'subscription');
      
      // Filter out services that aren't due yet
      const now = new Date();
      const dueServices = activeServices.filter(service => {
        if (!service.nextPingDue) {
          // If nextPingDue is not set, consider it due
          return true;
        }
        // Service is due if nextPingDue is now or in the past
        return service.nextPingDue <= now;
      });
      
      if (dueServices.length === 0) {
        logger.info(`No services due for ping in ${interval} minute interval`);
        return;
      }
      
      logger.info(`Processing ${dueServices.length} services due for ping in ${interval} minute interval`);
      
      // Process services in batches to avoid overwhelming the system
      const batchSize = 10;
      const batches = Math.ceil(dueServices.length / batchSize);
      
      for (let i = 0; i < batches; i++) {
        const batchStart = i * batchSize;
        const batchEnd = Math.min((i + 1) * batchSize, dueServices.length);
        const serviceBatch = dueServices.slice(batchStart, batchEnd);
        
        // Process batch with concurrency limit
        await Promise.all(serviceBatch.map(async (service) => {
          // Verify subscription is still active
          const user = service.userId;
          if (!user || 
              !user.subscription || 
              !user.subscription.active || 
              (user.subscription.expiresAt && new Date(user.subscription.expiresAt) < new Date())) {
            return;
          }
          
          try {
            await this.pingService(service);
          } catch (error) {
            logger.error(`Error pinging service ${service._id}:`, error);
          }
        }));
        
        // Brief pause between batches to avoid overwhelming the system
        if (i < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      logger.info(`Completed ping batch for ${interval} minute interval`);
    } catch (error) {
      logger.error(`Error processing ping batch for interval ${interval}:`, error);
    }
  }

  // Get all active services grouped by interval
  async getActiveServicesByInterval() {
    const servicesByInterval = {};
    
    try {
      // Find all active ping services with active subscriptions
      const activeServices = await PingService.find({ active: true })
        .populate('userId', 'subscription');
      
      // Group by interval
      for (const service of activeServices) {
        // Skip if user's subscription is inactive
        const user = service.userId;
        if (!user || 
            !user.subscription || 
            !user.subscription.active || 
            (user.subscription.expiresAt && new Date(user.subscription.expiresAt) < new Date())) {
          continue;
        }
        
        // Update nextPingDue if it's not set properly
        if (!service.nextPingDue) {
          // If no next ping time or it's in the past, calculate next ping time
          // Set it to 1 minute earlier than the actual interval to ensure timely pings
          const now = new Date();
          const lastPinged = service.lastPinged || service.createdAt || now;
          const intervalMs = (service.interval - 1) * 60 * 1000; // Subtract 1 minute from interval
          service.nextPingDue = new Date(Math.max(
            now.getTime(),
            lastPinged.getTime() + intervalMs
          ));
          await service.save();
          logger.info(`Updated missing nextPingDue for service ${service._id} to ${service.nextPingDue} (1 minute early)`);
        }
        
        const interval = service.interval.toString();
        if (!servicesByInterval[interval]) {
          servicesByInterval[interval] = [];
        }
        
        servicesByInterval[interval].push(service._id);
      }
    } catch (error) {
      logger.error('Error grouping services by interval:', error);
      throw error; // Re-throw the error
    }
    
    return servicesByInterval;
  }

  // Ping an individual service
  async pingService(service) {
    try {
      const startTime = Date.now();
      this.metrics.totalPings++;
      
      let response;
      let isSuccess = false;
      let responseBody = null;
      let responseStatus = null;
      let validationSuccess = true;
      let validationMessage = "";
      let responseTime = 0;
      
      // Handle different monitor types
      switch(service.monitorType) {
        case 'tcp':
          // TCP port check
          try {
            const result = await this.checkTcpPort(service.url, service.port, service.timeoutSeconds * 1000);
            isSuccess = result.open;
            responseTime = result.responseTime;
            responseBody = result.message;
          } catch (error) {
            isSuccess = false;
            responseBody = error.message;
          }
          break;
          
        case 'ping':
          // ICMP ping
          try {
            const result = await this.pingHost(service.url, service.packetCount, service.timeoutSeconds);
            isSuccess = result.alive;
            responseTime = result.time;
            responseBody = result.output;
          } catch (error) {
            isSuccess = false;
            responseBody = error.message;
          }
          break;
          
        case 'http':
        default:
          // Set up request headers
          const requestHeaders = {
            'User-Agent': 'PingService/1.0 (https://example.com)'
          };
          
          // Add any custom headers from the service
          if (service.headers && service.headers.size > 0) {
            for (const [key, value] of service.headers.entries()) {
              requestHeaders[key] = value;
            }
          }
          
          // Make HTTP request
          const requestConfig = { 
            timeout: 60000, // 60 seconds timeout (increased from 30 seconds)
            validateStatus: false, // Accept any status code
            headers: requestHeaders,
            maxRedirects: 5
          };
          
          // Prepare request data for POST
          let requestData = {};
          if (service.method === 'POST' && service.requestBody) {
            try {
              requestData = JSON.parse(service.requestBody);
            } catch (e) {
              // If parsing fails, use the requestBody as-is
              requestData = service.requestBody;
            }
          }
          
          if (service.method === 'POST') {
            response = await axios.post(service.url, requestData, requestConfig);
          } else if (service.method === 'HEAD') {
            response = await axios.head(service.url, requestConfig);
          } else {
            // Default to GET
            response = await axios.get(service.url, requestConfig);
          }
          
          responseTime = Date.now() - startTime;
          isSuccess = response.status >= 200 && response.status < 400;
          responseStatus = response.status;
          
          // Apply response body validation if enabled
          if (service.validateResponse && service.responseValidationValue && response.data) {
            validationSuccess = false;
            const responseBodyData = typeof response.data === 'object' 
              ? JSON.stringify(response.data) 
              : String(response.data);
            
            switch(service.responseValidationRule) {
              case 'contains':
                validationSuccess = responseBodyData.includes(service.responseValidationValue);
                break;
              case 'equals':
                validationSuccess = responseBodyData === service.responseValidationValue;
                break;
              case 'startsWith':
                validationSuccess = responseBodyData.startsWith(service.responseValidationValue);
                break;
              case 'endsWith':
                validationSuccess = responseBodyData.endsWith(service.responseValidationValue);
                break;
              case 'regex':
                try {
                  const regex = new RegExp(service.responseValidationValue);
                  validationSuccess = regex.test(responseBodyData);
                } catch (e) {
                  validationMessage = `Invalid regex: ${e.message}`;
                }
                break;
            }
            
            if (!validationSuccess) {
              validationMessage = validationMessage || 
                `Response validation failed: ${service.responseValidationRule} "${service.responseValidationValue}"`;
            }
          }
          
          // Prepare response body to store
          if (response.data) {
            try {
              if (typeof response.data === 'object') {
                responseBody = JSON.stringify(response.data).substring(0, 1000); // Limit size
              } else {
                responseBody = String(response.data).substring(0, 1000); // Limit size
              }
            } catch (e) {
              responseBody = "Error processing response body";
            }
          }
          break;
      }
      
      // Final success determination
      const finalSuccess = service.monitorType === 'http' ? 
                           (isSuccess && validationSuccess) : 
                           isSuccess;
      
      // Update metrics
      if (finalSuccess) {
        this.metrics.successfulPings++;
      } else {
        this.metrics.failedPings++;
      }
      
      // Update running average response time
      this.metrics.avgResponseTime = (this.metrics.avgResponseTime * (this.metrics.totalPings - 1) + responseTime) / this.metrics.totalPings;
      
      // Create log entry
      const logEntry = {
        timestamp: new Date(),
        status: finalSuccess ? 'success' : 'error',
        responseTime: responseTime,
        responseStatus: responseStatus,
        responseBody: responseBody,
        message: finalSuccess ? 
          (service.monitorType === 'http' ? `HTTP ${responseStatus}` : `${service.monitorType.toUpperCase()} check successful`) : 
          (validationMessage || `Error: ${service.monitorType === 'http' ? `HTTP ${responseStatus}` : 'Connection failed'}`)
      };
      
      // Update service with ping results
      const currentTime = new Date();
      service.lastPinged = currentTime;
      // Set nextPingDue to 1 minute earlier than the actual interval
      const intervalMs = (service.interval - 1) * 60 * 1000; // Subtract 1 minute from interval
      service.nextPingDue = new Date(currentTime.getTime() + intervalMs);
      service.lastStatus = logEntry.status;
      service.logs.push(logEntry);
      
      // Apply log retention limit based on subscription plan
      // First, fetch the user to get subscription info if not already populated
      if (!service.userId || typeof service.userId === 'string') {
        const User = require('../models/User');
        const user = await User.findById(service.userId).select('subscription');
        if (user && user.subscription) {
          // Set retention limit based on subscription plan
          let retentionLimit = 100; // Default/free tier (~7 days at 10min intervals)
          
          if (user.subscription.plan === 'premium') {
            retentionLimit = 500; // ~90 days at 5min intervals
          } else if (user.subscription.plan === 'basic') {
            retentionLimit = 300; // ~30 days at 10min intervals
          }
          
          // Apply retention limit
          if (service.logs.length > retentionLimit) {
            service.logs = service.logs.slice(-retentionLimit);
          }
        }
      }
      
      // Calculate uptime based on the appropriate number of logs 
      const successfulPings = service.logs.filter(log => log.status === 'success').length;
      service.uptime = Number((successfulPings / service.logs.length * 100).toFixed(1));
      
      await service.save();
      logger.info(`Pinged ${service.url} (${service.monitorType}) - Status: ${logEntry.status} (${responseTime}ms), Next ping due: ${service.nextPingDue} (1 minute early)`);
      
    } catch (error) {
      this.metrics.failedPings++;
      
      // Handle ping error
      const logEntry = {
        timestamp: new Date(),
        status: 'error',
        message: error.message || 'Ping failed' 
      };
      
      // Update service with ping results even on error
      const currentTime = new Date();
      service.lastPinged = currentTime;
      // Set nextPingDue to 1 minute earlier than the actual interval
      const intervalMs = (service.interval - 1) * 60 * 1000; // Subtract 1 minute from interval
      service.nextPingDue = new Date(currentTime.getTime() + intervalMs);
      service.lastStatus = 'error'; // Set status to error
      service.logs.push(logEntry);
      
      // Apply log retention limit based on subscription plan
      if (!service.userId || typeof service.userId === 'string') {
        const User = require('../models/User');
        const user = await User.findById(service.userId).select('subscription');
        if (user && user.subscription) {
          // Set retention limit based on subscription plan
          let retentionLimit = 100; // Default/free tier (~7 days at 10min intervals)
          
          if (user.subscription.plan === 'premium') {
            retentionLimit = 500; // ~90 days at 5min intervals
          } else if (user.subscription.plan === 'basic') {
            retentionLimit = 300; // ~30 days at 10min intervals
          }
          
          // Apply retention limit
          if (service.logs.length > retentionLimit) {
            service.logs = service.logs.slice(-retentionLimit);
          }
        }
      }
      
      // Calculate uptime based on the logs
      const successfulPings = service.logs.filter(log => log.status === 'success').length;
      service.uptime = Number((successfulPings / service.logs.length * 100).toFixed(1));
      
      try {
        await service.save(); // Save the service state
        logger.error(`Failed to ping ${service.url} (${service.monitorType}): ${logEntry.message}, Next ping due: ${service.nextPingDue} (1 minute early)`);
      } catch (saveError) {
        logger.error(`Failed to save error state for service ${service._id}:`, saveError);
      }
    }
  }
  
  // TCP port check implementation
  async checkTcpPort(host, port, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      let resolved = false;
      
      // Remove http:// or https:// from the host if present
      const cleanHost = host.replace(/^https?:\/\//, '');
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        const responseTime = Date.now() - startTime;
        socket.destroy();
        if (!resolved) {
          resolved = true;
          resolve({
            open: true,
            responseTime,
            message: `Port ${port} is open on ${cleanHost}`
          });
        }
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        if (!resolved) {
          resolved = true;
          resolve({
            open: false,
            responseTime: timeout,
            message: `Timeout connecting to ${cleanHost}:${port}`
          });
        }
      });
      
      socket.on('error', (error) => {
        socket.destroy();
        if (!resolved) {
          resolved = true;
          resolve({
            open: false,
            responseTime: Date.now() - startTime,
            message: `Error connecting to ${cleanHost}:${port}: ${error.message}`
          });
        }
      });
      
      // Attempt to connect
      socket.connect(port, cleanHost);
    });
  }
  
  // ICMP ping implementation
  async pingHost(host, count = 3, timeout = 5) {
    // Remove http:// or https:// from the host if present
    const cleanHost = host.replace(/^https?:\/\//, '');
    
    const pingConfig = {
      timeout: timeout,
      extra: ['-c', count]
    };
    
    try {
      const result = await ping.promise.probe(cleanHost, pingConfig);
      return {
        alive: result.alive,
        time: parseFloat(result.time) || 0,
        output: result.output
      };
    } catch (error) {
      return {
        alive: false,
        time: 0,
        output: error.message
      };
    }
  }

  // Clean up old logs to prevent database bloat
  async cleanupOldLogs() {
    try {
      logger.info('Starting log cleanup process');
      
      // Get all services with subscription info
      const services = await PingService.find({}).populate('userId', 'subscription');
      let totalLogsRemoved = 0;
      
      for (const service of services) {
        // Skip if service has no user (shouldn't happen, but just in case)
        if (!service.userId) {
          continue;
        }
        
        // Set retention limit based on subscription plan
        let retentionLimit = 100; // Default/free tier (~7 days at 10min intervals)
        
        if (service.userId.subscription && service.userId.subscription.plan) {
          if (service.userId.subscription.plan === 'premium') {
            retentionLimit = 500; // ~90 days at 5min intervals  
          } else if (service.userId.subscription.plan === 'basic') {
            retentionLimit = 300; // ~30 days at 10min intervals
          }
        }
        
        // Keep only the logs within the retention limit
        if (service.logs.length > retentionLimit) {
          const logsToRemove = service.logs.length - retentionLimit;
          service.logs = service.logs.slice(-retentionLimit);
          await service.save();
          totalLogsRemoved += logsToRemove;
        }
      }
      
      logger.info(`Log cleanup complete. Removed ${totalLogsRemoved} old logs. Retention policy: Free=100, Basic=300, Premium=500 logs`);
    } catch (error) {
      logger.error('Error during log cleanup:', error);
    }
  }

  // Health check method
  performHealthCheck() {
    try {
      // Check if we're still running
      if (!this.isRunning) {
        logger.warn('Health check failed: Ping scheduler is not running');
        return false;
      }
      
      // Check if we have active cron jobs
      const activeJobs = Object.keys(this.cronJobs).length;
      if (activeJobs === 0) {
        logger.warn('Health check warning: No active cron jobs');
        // Try to refresh schedules
        this.refreshSchedules().catch(err => {
          logger.error('Failed to refresh schedules during health check:', err);
        });
      }
      
      // Log current metrics
      logger.info('Ping scheduler health check:', {
        status: 'healthy',
        activeJobs,
        metrics: this.metrics
      });
      
      return true;
    } catch (error) {
      logger.error('Error during health check:', error);
      return false;
    }
  }

  // Get current metrics
  getMetrics() {
    return {
      ...this.metrics,
      activeJobs: Object.keys(this.cronJobs).length,
      isRunning: this.isRunning
    };
  }

  // Method to manually trigger a ping for a specific service
  async triggerPing(serviceId) {
    try {
      const service = await PingService.findById(serviceId);
      
      if (!service) {
        logger.error(`Attempted to trigger ping for invalid service ID: ${serviceId}`);
        return false; // Explicitly return false
      }
      
      // Check if user subscription is active
      const user = await User.findById(service.userId);
      if (!user || 
          !user.subscription || 
          !user.subscription.active || 
          (user.subscription.expiresAt && new Date(user.subscription.expiresAt) < new Date())) {
        logger.warn(`Skipping manual ping for service ${serviceId} due to inactive subscription.`);
        // Optionally return a specific status or false
        return false; 
      }

      logger.info(`Manually triggering ping for service: ${service.url}`);
      await this.pingService(service);
      return true;
    } catch (error) {
      logger.error(`Error triggering manual ping for service ${serviceId}:`, error);
      return false; // Return false on error as well
    }
  }
}

// Export a singleton instance of PingScheduler
const pingSchedulerInstance = new PingScheduler();
module.exports = pingSchedulerInstance;