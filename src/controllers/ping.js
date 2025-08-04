// src/controllers/ping.js
const PingService = require('../models/PingService');
const logger = require('../utils/logger');
const pingScheduler = require('../services/pingScheduler');
const { sendMessage } = require('../utils/anthropic');

// Get all ping services for the authenticated user
exports.getAllServices = async (req, res) => {
  try {
    const services = await PingService.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    
    res.json(services);
  } catch (error) {
    logger.error('Get all services error:', error);
    res.status(500).json({ message: 'Failed to get services', error: error.message });
  }
};

// Get a single ping service by ID
exports.getServiceById = async (req, res) => {
  try {
    const service = await PingService.findOne({ 
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    res.json(service);
  } catch (error) {
    logger.error('Get service by ID error:', error);
    res.status(500).json({ message: 'Failed to get service', error: error.message });
  }
};

// Create a new ping service
exports.createService = async (req, res) => {
  try {
    const { 
      url, 
      name, 
      interval, 
      headers, 
      method, 
      requestBody, 
      validateResponse, 
      responseValidationRule, 
      responseValidationValue,
      monitorType,
      port,
      packetCount,
      timeoutSeconds
    } = req.body;
    
    // Debug logging
    console.log('Create service request:', {
      body: req.body,
      user: req.user,
      authHeader: req.headers.authorization ? 'Present' : 'Missing'
    });
    
    // Check URL format (basic validation)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ message: 'URL must start with http:// or https://' });
    }
    
    // Validate interval based on subscription plan
    let maxInterval = 10; // Default for free plan
    let minInterval = 10; // For free plan, only exactly 10 minutes is allowed
    let maxServices = 1;  // Default for free plan
    
    if (req.user.subscription.plan === 'basic') {
      maxInterval = 30; // Allow up to 30 minute intervals
      minInterval = 10; // Minimum 10 minutes 
      maxServices = 10;
    } else if (req.user.subscription.plan === 'premium') {
      maxInterval = 60; // Allow up to 60 minute intervals
      minInterval = 1;  // Minimum 1 minute
      maxServices = Number.MAX_SAFE_INTEGER; // Unlimited
    }
    
    // Count existing services
    const existingServicesCount = await PingService.countDocuments({ userId: req.user.id });
    
    if (existingServicesCount >= maxServices) {
      return res.status(400).json({ 
        message: `Your plan only allows ${maxServices} ping service${maxServices > 1 ? 's' : ''}` 
      });
    }
    
    // Check if interval is valid for user's plan
    if (req.user.subscription.plan === 'free' && interval !== 10) {
      return res.status(400).json({ 
        message: 'Free plan only allows exactly 10 minute intervals' 
      });
    } else if (req.user.subscription.plan === 'basic' && (interval < minInterval || interval > maxInterval)) {
      return res.status(400).json({ 
        message: `Basic plan allows intervals between ${minInterval} and ${maxInterval} minutes` 
      });
    } else if (req.user.subscription.plan === 'premium' && (interval < minInterval || interval > maxInterval)) {
      return res.status(400).json({ 
        message: `Premium plan allows intervals between ${minInterval} and ${maxInterval} minutes` 
      });
    }
    
    // Validate monitor type
    const serviceType = monitorType || 'http';
    if (!['http', 'tcp', 'ping'].includes(serviceType)) {
      return res.status(400).json({ message: 'Monitor type must be http, tcp, or ping' });
    }
    
    // Validate monitor-specific parameters
    if (serviceType === 'http') {
      // Set default method to GET if not specified
      const serviceMethod = method ? method.toUpperCase() : 'GET';
      
      // Validate HTTP method based on subscription
      if (!['GET', 'HEAD', 'POST'].includes(serviceMethod)) {
        return res.status(400).json({ message: 'Method must be GET, HEAD, or POST' });
      }

      if (serviceMethod === 'POST' && req.user.subscription.plan !== 'premium') {
        return res.status(400).json({ message: 'POST method is only available with premium subscription' });
      } else if (serviceMethod === 'HEAD' && req.user.subscription.plan === 'free') {
        return res.status(400).json({ message: 'HEAD method is only available with basic or premium subscription' });
      }
      
      // Validate response validation based on subscription plan
      if (validateResponse && req.user.subscription.plan !== 'premium') {
        return res.status(400).json({ message: 'Response validation is only available with premium subscription' });
      }
      
      // Validate custom headers based on subscription plan
      if (headers && Object.keys(headers).length > 0) {
        if (req.user.subscription.plan === 'free') {
          return res.status(400).json({ message: 'Custom headers are not available with free subscription' });
        } else if (req.user.subscription.plan === 'basic' && Object.keys(headers).length > 3) {
          return res.status(400).json({ message: 'Basic subscription allows a maximum of 3 custom headers' });
        } else if (req.user.subscription.plan === 'premium' && Object.keys(headers).length > 10) {
          return res.status(400).json({ message: 'Premium subscription allows a maximum of 10 custom headers' });
        }
      }
    } else if (serviceType === 'tcp') {
      // Validate port number for TCP monitoring
      const portNumber = port || 80;
      if (portNumber < 1 || portNumber > 65535) {
        return res.status(400).json({ message: 'Port must be between 1 and 65535' });
      }
    } else if (serviceType === 'ping') {
      // Validate packet count for ICMP ping monitoring
      const packets = packetCount || 3;
      if (packets < 1 || packets > 10) {
        return res.status(400).json({ message: 'Packet count must be between 1 and 10' });
      }
    }
    
    // Validate timeout for TCP and ICMP
    if ((serviceType === 'tcp' || serviceType === 'ping') && timeoutSeconds) {
      if (timeoutSeconds < 1 || timeoutSeconds > 60) {
        return res.status(400).json({ message: 'Timeout must be between 1 and 60 seconds' });
      }
    }
    
    // Convert headers object to Map
    const headersMap = new Map();
    if (headers && typeof headers === 'object') {
      Object.entries(headers).forEach(([key, value]) => {
        headersMap.set(key, value);
      });
    }
    
    // Create service with base properties
    const serviceData = {
      userId: req.user.id,
      url,
      name: name || url, // Use URL as name if not provided
      interval,
      active: true,
      monitorType: serviceType,
      nextPingDue: new Date(Date.now() + interval * 60 * 1000)
    };
    
    // Add type-specific properties
    if (serviceType === 'http') {
      serviceData.method = method ? method.toUpperCase() : 'GET';
      serviceData.headers = headersMap;
      serviceData.requestBody = requestBody ? String(requestBody) : '';
      serviceData.validateResponse = validateResponse || false;
      serviceData.responseValidationRule = responseValidationRule || 'contains';
      serviceData.responseValidationValue = responseValidationValue || '';
    } else if (serviceType === 'tcp') {
      serviceData.port = port || 80; // Default to port 80 if not specified
      serviceData.timeoutSeconds = timeoutSeconds || 5; // Default 5 seconds timeout
    } else if (serviceType === 'ping') {
      serviceData.packetCount = packetCount || 3; // Default to 3 packets
      serviceData.timeoutSeconds = timeoutSeconds || 5; // Default 5 seconds timeout
    }
    
    const service = new PingService(serviceData);
    
    await service.save();
    
    // Send an initial ping immediately
    try {
      logger.info(`Sending initial ping to newly added service: ${service.url}`);
      await pingScheduler.triggerPing(service._id);
    } catch (pingError) {
      logger.error('Error sending initial ping to new service:', pingError);
      // Continue processing - don't let ping error block the operation
    }
    
    // Refresh ping schedules to pick up the new service
    try {
      await pingScheduler.refreshSchedules();
    } catch (scheduleError) {
      logger.error('Error refreshing schedules after service creation:', scheduleError);
      // Continue processing - don't let schedule refresh failure block the operation
    }
    
    res.status(201).json(service);
  } catch (error) {
    logger.error('Create service error:', error);
    
    // Add detailed error for debugging
    console.error('Create service detailed error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    res.status(500).json({ message: 'Failed to create service', error: error.message });
  }
};

// Update a ping service
exports.updateService = async (req, res) => {
  try {
    const { 
      url, 
      name, 
      interval, 
      active, 
      headers, 
      method, 
      requestBody, 
      validateResponse, 
      responseValidationRule, 
      responseValidationValue,
      monitorType,
      port,
      packetCount,
      timeoutSeconds
    } = req.body;
    const updates = {};
    
    if (url) {
      // Check URL format
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).json({ message: 'URL must start with http:// or https://' });
      }
      updates.url = url;
    }
    
    if (name) updates.name = name;
    
    if (interval !== undefined) {
      // Validate interval based on subscription plan
      let maxInterval = 10; // For free plan
      let minInterval = 10; // For free plan, only exactly 10 minutes is allowed
      
      if (req.user.subscription.plan === 'basic') {
        maxInterval = 30; // Allow up to 30 minute intervals
        minInterval = 10; // Minimum 10 minutes
      } else if (req.user.subscription.plan === 'premium') {
        maxInterval = 60; // Allow up to 60 minute intervals
        minInterval = 1;  // Minimum 1 minute
      }
      
      // Check if interval is valid for user's plan
      if (req.user.subscription.plan === 'free' && interval !== 10) {
        return res.status(400).json({ 
          message: 'Free plan only allows exactly 10 minute intervals' 
        });
      } else if (req.user.subscription.plan === 'basic' && (interval < minInterval || interval > maxInterval)) {
        return res.status(400).json({ 
          message: `Basic plan allows intervals between ${minInterval} and ${maxInterval} minutes` 
        });
      } else if (req.user.subscription.plan === 'premium' && (interval < minInterval || interval > maxInterval)) {
        return res.status(400).json({ 
          message: `Premium plan allows intervals between ${minInterval} and ${maxInterval} minutes` 
        });
      }
      
      updates.interval = interval;
      
      // If interval changes, update nextPingDue
      const service = await PingService.findOne({ _id: req.params.id, userId: req.user.id });
      if (service) {
        const lastPingTime = service.lastPinged || new Date();
        updates.nextPingDue = new Date(lastPingTime.getTime() + interval * 60 * 1000);
      }
    }
    
    if (active !== undefined) {
      updates.active = active;
      if (active) {
        updates.nextPingDue = new Date(); // If activating, set next ping to now
      }
    }
    
    // Handle monitor type update
    if (monitorType) {
      if (!['http', 'tcp', 'ping'].includes(monitorType)) {
        return res.status(400).json({ message: 'Monitor type must be http, tcp, or ping' });
      }
      updates.monitorType = monitorType;
    }
    
    // Update TCP-specific fields
    if (port !== undefined) {
      if (port < 1 || port > 65535) {
        return res.status(400).json({ message: 'Port must be between 1 and 65535' });
      }
      updates.port = port;
    }
    
    // Update ICMP ping-specific fields
    if (packetCount !== undefined) {
      if (packetCount < 1 || packetCount > 10) {
        return res.status(400).json({ message: 'Packet count must be between 1 and 10' });
      }
      updates.packetCount = packetCount;
    }
    
    // Update timeout for TCP and ICMP
    if (timeoutSeconds !== undefined) {
      if (timeoutSeconds < 1 || timeoutSeconds > 60) {
        return res.status(400).json({ message: 'Timeout must be between 1 and 60 seconds' });
      }
      updates.timeoutSeconds = timeoutSeconds;
    }
    
    // HTTP-specific updates
    // Convert headers object to Map if provided
    if (headers) {
      const headersMap = new Map();
      Object.entries(headers).forEach(([key, value]) => {
        headersMap.set(key, value);
      });
      updates.headers = headersMap;
    }
    
    if (method) updates.method = method;
    if (requestBody !== undefined) updates.requestBody = requestBody;
    if (validateResponse !== undefined) updates.validateResponse = validateResponse;
    if (responseValidationRule) updates.responseValidationRule = responseValidationRule;
    if (responseValidationValue !== undefined) updates.responseValidationValue = responseValidationValue;
    
    const updatedService = await PingService.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    if (!updatedService) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    // Refresh ping schedules if interval or active status changed
    if (interval !== undefined || active !== undefined) {
      try {
        await pingScheduler.refreshSchedules();
      } catch (error) {
        logger.error('Error refreshing schedules after service update:', error);
        // Continue processing - don't let schedule refresh failure block the operation
      }
    }
    
    res.json(updatedService);
  } catch (error) {
    logger.error('Update service error:', error);
    res.status(500).json({ message: 'Failed to update service', error: error.message });
  }
};

// Delete a ping service
exports.deleteService = async (req, res) => {
  try {
    // Add debug logging
    console.log('Delete service request:', {
      params: req.params,
      id: req.params.id,
      userId: req.user.id
    });
    
    // Validate ID parameter
    if (!req.params.id) {
      console.error('Missing ID parameter in request');
      return res.status(400).json({ message: 'Missing service ID' });
    }
    
    // Directly use findOneAndDelete to match test expectations
    const service = await PingService.findOneAndDelete({ 
      _id: req.params.id,
      userId: req.user.id
    });
    
    // Debug deletion result
    console.log('Delete result:', service ? 'Successful' : 'Not Found');
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    // Refresh ping schedules to remove the deleted service
    // Use try/catch to handle potential errors in refreshSchedules
    try {
      await pingScheduler.refreshSchedules();
    } catch (scheduleError) {
      logger.error('Error refreshing schedules after delete:', scheduleError);
      // Continue processing - don't let schedule refresh failure block the delete operation
    }
    
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    logger.error('Delete service error:', error);
    res.status(500).json({ message: 'Failed to delete service', error: error.message });
  }
};

// Get service logs
exports.getServiceLogs = async (req, res) => {
  try {
    const service = await PingService.findOne({ 
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    res.json(service.logs);
  } catch (error) {
    logger.error('Get service logs error:', error);
    res.status(500).json({ message: 'Failed to get service logs', error: error.message });
  }
};

// Get logs for all services
exports.getAllLogs = async (req, res) => {
  try {
    const services = await PingService.find({ userId: req.user.id });
    
    // Collect logs from all services
    const allLogs = services.reduce((logs, service) => {
      return logs.concat(service.logs.map(log => ({
        ...log.toObject(),
        serviceName: service.name,
        serviceId: service._id
      })));
    }, []);
    
    // Sort logs by timestamp, most recent first
    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(allLogs);
  } catch (error) {
    logger.error('Get all logs error:', error);
    res.status(500).json({ message: 'Failed to get logs', error: error.message });
  }
};

// Manually ping a service once (for testing)
exports.pingServiceManually = async (req, res) => {
  try {
    const service = await PingService.findOne({ 
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    // Use the scheduler to ping the service
    await pingScheduler.pingService(service);
    
    // Fetch the updated service
    const updatedService = await PingService.findById(req.params.id);
    
    res.json({
      message: 'Service pinged successfully',
      lastStatus: updatedService.lastStatus,
      lastPinged: updatedService.lastPinged,
      nextPingDue: updatedService.nextPingDue,
      logs: updatedService.logs.slice(-1)
    });
  } catch (error) {
    logger.error('Manual ping error:', error);
    res.status(500).json({ message: 'Failed to ping service', error: error.message });
  }
};

async function analyzePingResults(pingData) {
  const prompt = `Analyze the following ping results and provide insights:
${JSON.stringify(pingData, null, 2)}`;

  try {
    const response = await sendMessage(prompt);
    return response.content[0].text;
  } catch (error) {
    console.error('Error analyzing ping results with Claude:', error);
    return 'Unable to analyze results at this time.';
  }
}