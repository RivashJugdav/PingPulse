const { 
  getAllServices, 
  getServiceById, 
  createService, 
  updateService, 
  deleteService, 
  getServiceLogs, 
  getAllLogs,
  pingServiceManually,
  analyzePingResults
} = require('../../controllers/ping');
const PingService = require('../../models/PingService');
const pingScheduler = require('../../services/pingScheduler');
const logger = require('../../utils/logger');
const { sendMessage } = require('../../utils/anthropic');

// Mock dependencies
jest.mock('../../models/PingService');
jest.mock('../../services/pingScheduler', () => ({
  refreshSchedules: jest.fn().mockResolvedValue(),
  pingService: jest.fn().mockResolvedValue(),
  triggerPing: jest.fn().mockResolvedValue()
}));
jest.mock('../../utils/logger');
jest.mock('../../utils/anthropic');

describe('Ping Controller', () => {
  let req;
  let res;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup request and response objects
    req = {
      user: { 
        id: 'user123',
        _id: 'user123',
        subscription: {
          plan: 'free'
        }
      },
      params: {},
      body: {},
      headers: {
        authorization: 'Bearer fake-token'
      }
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });
  
  // Define a mock ping service for reuse in tests
  const mockPingService = {
    _id: 'service123',
    userId: 'user123',
    name: 'Test Service',
    url: 'https://example.com',
    interval: 10,
    active: true,
    lastStatus: 'success',
    lastPinged: new Date(),
    nextPingDue: new Date(),
    logs: [],
    save: jest.fn().mockResolvedValue(true)
  };
  
  describe('getAllServices', () => {
    test('should return all services for the authenticated user', async () => {
      const mockServices = [
        { _id: 'service1', name: 'Service 1' },
        { _id: 'service2', name: 'Service 2' }
      ];
      
      PingService.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockServices)
      });
      
      await getAllServices(req, res);
      
      expect(PingService.find).toHaveBeenCalledWith({ userId: 'user123' });
      expect(res.json).toHaveBeenCalledWith(mockServices);
    });
    
    test('should handle errors correctly', async () => {
      const mockError = new Error('Database error');
      
      PingService.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockRejectedValue(mockError)
      });
      
      await getAllServices(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Get all services error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Failed to get services', 
        error: mockError.message 
      });
    });
  });
  
  describe('getServiceById', () => {
    test('should return the requested service', async () => {
      const mockService = { _id: 'service1', name: 'Service 1' };
      req.params.id = 'service1';
      
      PingService.findOne = jest.fn().mockResolvedValue(mockService);
      
      await getServiceById(req, res);
      
      expect(PingService.findOne).toHaveBeenCalledWith({ 
        _id: 'service1',
        userId: 'user123'
      });
      expect(res.json).toHaveBeenCalledWith(mockService);
    });
    
    test('should return 404 if service not found', async () => {
      req.params.id = 'nonexistent';
      
      PingService.findOne = jest.fn().mockResolvedValue(null);
      
      await getServiceById(req, res);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Service not found' });
    });
    
    test('should handle errors correctly', async () => {
      req.params.id = 'service1';
      const mockError = new Error('Database error');
      
      PingService.findOne = jest.fn().mockRejectedValue(mockError);
      
      await getServiceById(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Get service by ID error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Failed to get service', 
        error: mockError.message 
      });
    });
  });
  
  describe('createService', () => {
    beforeEach(() => {
      req.body = {
        url: 'https://example.com',
        name: 'Example',
        interval: 30
      };
      
      // Mock the PingService constructor and its methods
      PingService.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({}),
        _id: 'new-service',
        userId: 'user123',
        url: 'https://example.com',
        name: 'Example',
        interval: 30,
        active: true
      }));
      
      // Mock console.log to avoid test output noise
      console.log = jest.fn();
      console.error = jest.fn();
      
      PingService.countDocuments = jest.fn().mockResolvedValue(0);
    });
    
    test('should create a new service successfully', async () => {
      // Set the interval to 10 for free plan
      req.body.interval = 10;
      
      // Mock the service instance and its save method to return a proper response
      const mockServiceInstance = {
        _id: 'new-service',
        userId: 'user123',
        url: 'https://example.com',
        name: 'Example',
        interval: 10,
        active: true,
        nextPingDue: new Date(),
        monitorType: 'http', // Default monitor type
        port: null,
        packetCount: null,
        timeoutSeconds: 5,
        save: jest.fn().mockResolvedValue({
          _id: 'new-service',
          message: 'Service created'
        })
      };
      
      // Setup the PingService constructor mock
      PingService.mockImplementation(() => mockServiceInstance);
      
      // Mock res.json to return the expected response format
      res.json.mockImplementation(() => ({ message: 'Service created' }));
      
      await createService(req, res);
      
      expect(PingService).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user123',
        url: 'https://example.com',
        name: 'Example',
        interval: 10,
        active: true,
        nextPingDue: expect.any(Date)
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });
    
    test('should create TCP and ICMP monitoring services', async () => {
      // Test TCP service creation
      req.body = {
        url: 'https://example.com', // Use proper URL format
        name: 'TCP Service',
        interval: 10,
        monitorType: 'tcp',
        port: 80,
        timeoutSeconds: 3
      };

      // Reset mock implementation
      jest.clearAllMocks();

      // Create a mock service instance that will return what we need
      const mockTcpService = {
        _id: 'tcp-service',
        userId: 'user123',
        url: 'https://example.com',
        name: 'TCP Service',
        interval: 10,
        active: true,
        monitorType: 'tcp',
        port: 80,
        timeoutSeconds: 3,
        nextPingDue: new Date(),
        save: jest.fn().mockResolvedValue({
          _id: 'tcp-service'
        })
      };

      // Use a different approach - mock the constructor directly
      PingService.mockImplementation(() => mockTcpService);
      
      await createService(req, res);

      // Check that the service was created with correct props
      expect(PingService).toHaveBeenCalled();
      const constructorCall = PingService.mock.calls[0][0];
      expect(constructorCall).toMatchObject({
        userId: 'user123',
        url: 'https://example.com',
        name: 'TCP Service',
        interval: 10,
        active: true,
        monitorType: 'tcp',
        port: 80,
        timeoutSeconds: 3
      });
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
      
      // Reset mocks for ICMP test
      jest.clearAllMocks();
      
      // Test ICMP service creation
      req.body = {
        url: 'https://example.com', // Use proper URL format
        name: 'ICMP Service',
        interval: 10,
        monitorType: 'ping',
        packetCount: 3,
        timeoutSeconds: 2
      };

      // Mock a successful ICMP service creation
      const mockIcmpService = {
        _id: 'icmp-service',
        userId: 'user123',
        url: 'https://example.com',
        name: 'ICMP Service',
        interval: 10,
        active: true,
        monitorType: 'ping',
        packetCount: 3,
        timeoutSeconds: 2,
        nextPingDue: new Date(),
        save: jest.fn().mockResolvedValue({
          _id: 'icmp-service'
        })
      };
      
      PingService.mockImplementation(() => mockIcmpService);
      
      await createService(req, res);
      
      // Check that the service was created with correct props
      expect(PingService).toHaveBeenCalled();
      const icmpConstructorCall = PingService.mock.calls[0][0];
      expect(icmpConstructorCall).toMatchObject({
        userId: 'user123',
        url: 'https://example.com',
        name: 'ICMP Service',
        interval: 10,
        active: true,
        monitorType: 'ping',
        packetCount: 3,
        timeoutSeconds: 2
      });
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });
    
    test('should reject invalid URLs', async () => {
      req.body.url = 'invalid-url';
      
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'URL must start with http:// or https://' 
      });
      expect(PingService.prototype.save).not.toHaveBeenCalled();
    });
    
    test('should enforce interval limits based on subscription plan', async () => {
      // Test for free plan
      req.user.subscription.plan = 'free';
      req.body.interval = 15; // Not 10 minutes for free plan
      
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Free plan only allows exactly 10 minute intervals' 
      });
      
      // Test for free plan with interval less than 10
      req.body.interval = 5;
      
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Free plan only allows exactly 10 minute intervals' 
      });
      
      // Test for basic plan with interval below minimum
      req.user.subscription.plan = 'basic';
      req.body.interval = 5; // Less than minimum for basic
      
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Basic plan allows intervals between 10 and 30 minutes' 
      });
      
      // Test for basic plan with interval above maximum
      req.body.interval = 40; // More than maximum for basic
      
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Basic plan allows intervals between 10 and 30 minutes' 
      });
      
      // Test for premium plan with interval below minimum
      req.user.subscription.plan = 'premium';
      req.body.interval = 0; // Less than minimum for premium
      
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Premium plan allows intervals between 1 and 60 minutes' 
      });
      
      // Test for premium plan with interval above maximum
      req.body.interval = 70; // More than maximum for premium
      
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Premium plan allows intervals between 1 and 60 minutes' 
      });
    });
    
    test('should enforce service count limits based on subscription plan', async () => {
      PingService.countDocuments = jest.fn().mockResolvedValue(1); // At free plan limit
      req.body.interval = 10; // Valid interval for free plan
      
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Your plan only allows 1 ping service' 
      });
    });
    
    test('should use URL as name if name not provided', async () => {
      req.body.name = undefined;
      req.body.interval = 10; // Valid interval for free plan
      
      await createService(req, res);
      
      expect(PingService).toHaveBeenCalledWith(expect.objectContaining({
        name: 'https://example.com'
      }));
    });
    
    test('should handle different subscription plans - basic', async () => {
      req.user.subscription.plan = 'basic';
      req.body.interval = 15; // Valid for basic as it's greater than 10 (should not be rejected)
      
      // Make sure we're using a valid interval
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(201);
    });
    
    test('should handle different subscription plans - premium', async () => {
      req.user.subscription.plan = 'premium';
      req.body.interval = 1; // Exactly the minimum allowed for premium plan
      
      await createService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(201);
    });
    
    test('should handle errors during save', async () => {
      req.body = {
        url: 'https://example.com',
        name: 'Example',
        interval: 10 // Valid for free plan
      };
      
      // Mock a service instance that throws an error during save
      const mockError = new Error('Database connection failed');
      const mockServiceWithError = {
        _id: 'new-service',
        userId: 'user123',
        url: 'https://example.com',
        name: 'Example',
        interval: 10,
        active: true,
        nextPingDue: new Date(),
        monitorType: 'http',
        save: jest.fn().mockRejectedValue(mockError)
      };
      
      // Setup the PingService constructor mock
      PingService.mockImplementation(() => mockServiceWithError);
      
      await createService(req, res);
      
      // Verify error handling
      expect(logger.error).toHaveBeenCalledWith('Create service error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Failed to create service',
        error: 'Database connection failed'
      });
    });
  });
  
  describe('updateService', () => {
    // Define a local mockPingService for the updateService tests
    const mockTcpPingService = {
      _id: 'service123',
      userId: 'user123',
      name: 'Test Service',
      url: 'https://example.com',
      interval: 10,
      active: true,
      lastStatus: 'success',
      lastPinged: new Date(),
      nextPingDue: new Date(),
      logs: [],
      save: jest.fn().mockResolvedValue(true)
    };
    
    beforeEach(() => {
      req.params.id = 'service1';
      req.body = {
        url: 'https://updated.com',
        name: 'Updated Service',
        interval: 30,
        active: true
      };
      
      PingService.findOneAndUpdate = jest.fn().mockResolvedValue({
        _id: 'service1',
        ...req.body
      });

      // Mock findOne for when nextPingDue calculation is needed
      PingService.findOne = jest.fn().mockResolvedValue({
        _id: 'service1',
        lastPinged: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
        interval: 10
      });
    });
    
    test('should update a service successfully', async () => {
      req.params.id = 'service1';
      req.body = { name: 'Updated Service', interval: 10 }; // Valid interval for free plan
      
      // Mock the current service - important to return something for tests
      PingService.findOne = jest.fn().mockResolvedValue({
        _id: 'service1',
        lastPinged: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
        interval: 10
      });
      
      // Mock successful update
      const mockUpdatedService = {
        _id: 'service1',
        name: 'Updated Service',
        interval: 10,
        nextPingDue: new Date(),
        active: true
      };
      
      PingService.findOneAndUpdate = jest.fn().mockResolvedValue(mockUpdatedService);
      
      await updateService(req, res);
      
      // Instead of checking exact call parameters, check that the function was called
      expect(PingService.findOneAndUpdate).toHaveBeenCalled();
      
      // Check parameters separately
      const callArgs = PingService.findOneAndUpdate.mock.calls[0];
      expect(callArgs[0]).toEqual({ _id: 'service1', userId: 'user123' });
      expect(callArgs[1].$set).toHaveProperty('name', 'Updated Service');
      expect(callArgs[1].$set).toHaveProperty('interval', 10);
      
      // The response should get the returned service directly
      expect(res.json).toHaveBeenCalledWith(mockUpdatedService);
    });
    
    test('should update TCP port monitor settings', async () => {
      req.params.id = 'tcp-service';
      req.body = { 
        monitorType: 'tcp',
        port: 443,
        timeoutSeconds: 10
      };
      
      // Mock successful update
      const mockUpdatedTcpService = {
        _id: 'tcp-service',
        name: 'TCP Service',
        url: 'example.com',
        monitorType: 'tcp',
        port: 443,
        timeoutSeconds: 10
      };
      
      PingService.findOneAndUpdate = jest.fn().mockResolvedValue(mockUpdatedTcpService);
      
      await updateService(req, res);
      
      // Check parameters
      const callArgs = PingService.findOneAndUpdate.mock.calls[0];
      expect(callArgs[0]).toEqual({ _id: 'tcp-service', userId: 'user123' });
      expect(callArgs[1].$set).toHaveProperty('monitorType', 'tcp');
      expect(callArgs[1].$set).toHaveProperty('port', 443);
      expect(callArgs[1].$set).toHaveProperty('timeoutSeconds', 10);
      
      expect(res.json).toHaveBeenCalledWith(mockUpdatedTcpService);
    });
    
    test('should update ICMP ping monitor settings', async () => {
      req.params.id = 'ping-service';
      req.body = { 
        monitorType: 'ping',
        packetCount: 5,
        timeoutSeconds: 3
      };
      
      // Mock successful update
      const mockUpdatedPingService = {
        _id: 'ping-service',
        name: 'ICMP Ping Service',
        url: 'example.com',
        monitorType: 'ping',
        packetCount: 5,
        timeoutSeconds: 3
      };
      
      PingService.findOneAndUpdate = jest.fn().mockResolvedValue(mockUpdatedPingService);
      
      await updateService(req, res);
      
      // Check parameters
      const callArgs = PingService.findOneAndUpdate.mock.calls[0];
      expect(callArgs[0]).toEqual({ _id: 'ping-service', userId: 'user123' });
      expect(callArgs[1].$set).toHaveProperty('monitorType', 'ping');
      expect(callArgs[1].$set).toHaveProperty('packetCount', 5);
      expect(callArgs[1].$set).toHaveProperty('timeoutSeconds', 3);
      
      expect(res.json).toHaveBeenCalledWith(mockUpdatedPingService);
    });
    
    test('should reject invalid monitor type', async () => {
      req.body = { monitorType: 'invalid-type' };
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Monitor type must be http, tcp, or ping' 
      });
      expect(PingService.findOneAndUpdate).not.toHaveBeenCalled();
    });
    
    test('should reject invalid port number', async () => {
      req.body = { 
        monitorType: 'tcp',
        port: 70000 // Invalid port number
      };
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Port must be between 1 and 65535' 
      });
      expect(PingService.findOneAndUpdate).not.toHaveBeenCalled();
    });
    
    test('should reject invalid packet count', async () => {
      req.body = { 
        monitorType: 'ping',
        packetCount: 15 // Too many packets
      };
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Packet count must be between 1 and 10' 
      });
      expect(PingService.findOneAndUpdate).not.toHaveBeenCalled();
    });
    
    test('should reject invalid timeout value', async () => {
      req.body = { 
        monitorType: 'ping',
        timeoutSeconds: 100 // Too long timeout
      };
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Timeout must be between 1 and 60 seconds' 
      });
      expect(PingService.findOneAndUpdate).not.toHaveBeenCalled();
    });
    
    test('should handle partial updates', async () => {
      req.body = { name: 'Only Name Updated' };
      
      await updateService(req, res);
      
      expect(PingService.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'service1', userId: 'user123' },
        { $set: { name: 'Only Name Updated' } },
        { new: true, runValidators: true }
      );
    });
    
    test('should update nextPingDue when interval changes', async () => {
      // Test for free plan with valid interval
      req.user.subscription.plan = 'free';
      req.body = { interval: 10 }; // Valid for free plan
      
      // Mock current service
      const mockService = {
        _id: 'service123',
        lastPinged: new Date(Date.now() - 5000), // 5 seconds ago
      };
      PingService.findOne = jest.fn().mockResolvedValue(mockService);
      
      await updateService(req, res);
      
      // Expect that the next ping due time is calculated correctly
      expect(PingService.findOneAndUpdate).toHaveBeenCalled();
      const updateCall = PingService.findOneAndUpdate.mock.calls[0];
      expect(updateCall[1].$set).toHaveProperty('nextPingDue');
      
      // Try with invalid interval for free plan
      req.body = { interval: 15 }; // Not 10 minutes
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Free plan only allows exactly 10 minute intervals' 
      });
    });
    
    test('should set nextPingDue to now when service is activated', async () => {
      req.body = { active: true };
      
      await updateService(req, res);
      
      expect(PingService.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'service1', userId: 'user123' },
        { $set: expect.objectContaining({ 
          active: true,
          nextPingDue: expect.any(Date)
        })},
        { new: true, runValidators: true }
      );
    });
    
    test('should reject invalid URLs', async () => {
      req.body = { url: 'invalid-url' };
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'URL must start with http:// or https://' 
      });
      expect(PingService.findOneAndUpdate).not.toHaveBeenCalled();
    });
    
    test('should enforce interval limits based on subscription plan', async () => {
      req.params.id = 'service1';
      
      // Test for free plan (non-10 interval)
      req.user.subscription.plan = 'free';
      req.body = { interval: 15 }; // Not the exact 10 required for free
      
      // Mock the current service
      PingService.findOne = jest.fn().mockResolvedValue({
        _id: 'service1',
        lastPinged: new Date()
      });
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Free plan only allows exactly 10 minute intervals' 
      });
      
      // Test for basic plan with interval below minimum
      req.user.subscription.plan = 'basic';
      req.body = { interval: 5 }; // Below the minimum for basic plan
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Basic plan allows intervals between 10 and 30 minutes' 
      });
      
      // Test for basic plan with interval above maximum
      req.body = { interval: 40 }; // Above the maximum for basic plan
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Basic plan allows intervals between 10 and 30 minutes' 
      });
      
      // Test for premium plan with interval below minimum
      req.user.subscription.plan = 'premium';
      req.body = { interval: 0 }; // Below the minimum for premium plan
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Premium plan allows intervals between 1 and 60 minutes' 
      });
      
      // Test for premium plan with interval above maximum
      req.body = { interval: 70 }; // Above the maximum for premium plan
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Premium plan allows intervals between 1 and 60 minutes' 
      });
    });
    
    test('should return 404 if service not found', async () => {
      req.params.id = 'nonexistent';
      req.body = { name: 'Updated Name', interval: 10 }; // Valid interval to avoid rejection
      
      // Mock that findOne returns null (service not found)
      PingService.findOne = jest.fn().mockResolvedValue(null);
      
      // Mock findOneAndUpdate to avoid hitting the validation check in that method
      PingService.findOneAndUpdate = jest.fn().mockResolvedValue(null);
      
      await updateService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Service not found' });
    });
    
    test('should handle errors correctly', async () => {
      req.params.id = 'service1';
      req.body = { name: 'Updated Service', interval: 10 }; // Valid interval for free plan
      
      // Mock the current service
      PingService.findOne = jest.fn().mockResolvedValue({
        _id: 'service1',
        lastPinged: new Date()
      });
      
      const mockError = new Error('Database error');
      PingService.findOneAndUpdate = jest.fn().mockRejectedValue(mockError);
      
      await updateService(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Update service error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Failed to update service',
        error: 'Database error'
      });
    });
  });
  
  describe('deleteService', () => {
    test('should delete a service successfully', async () => {
      req.params.id = 'service1';
      PingService.findOneAndDelete = jest.fn().mockResolvedValue({ _id: 'service1' });
      
      await deleteService(req, res);
      
      expect(PingService.findOneAndDelete).toHaveBeenCalledWith({ 
        _id: 'service1',
        userId: 'user123'
      });
      expect(pingScheduler.refreshSchedules).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Service deleted successfully' });
    });
    
    test('should return 404 if service not found', async () => {
      req.params.id = 'nonexistent';
      PingService.findOneAndDelete = jest.fn().mockResolvedValue(null);
      
      await deleteService(req, res);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Service not found' });
    });
    
    test('should handle errors correctly', async () => {
      req.params.id = 'service1';
      const mockError = new Error('Database error');
      PingService.findOneAndDelete = jest.fn().mockRejectedValue(mockError);
      
      await deleteService(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Delete service error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Failed to delete service', 
        error: mockError.message 
      });
    });
  });
  
  describe('getServiceLogs', () => {
    test('should return logs for the requested service', async () => {
      req.params.id = 'service1';
      const mockLogs = [
        { timestamp: new Date(), status: 'up' },
        { timestamp: new Date(), status: 'down' }
      ];
      
      PingService.findOne = jest.fn().mockResolvedValue({
        _id: 'service1',
        logs: mockLogs
      });
      
      await getServiceLogs(req, res);
      
      expect(PingService.findOne).toHaveBeenCalledWith({ 
        _id: 'service1',
        userId: 'user123'
      });
      expect(res.json).toHaveBeenCalledWith(mockLogs);
    });
    
    test('should return 404 if service not found', async () => {
      req.params.id = 'nonexistent';
      PingService.findOne = jest.fn().mockResolvedValue(null);
      
      await getServiceLogs(req, res);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Service not found' });
    });
    
    test('should handle errors correctly', async () => {
      req.params.id = 'service1';
      const mockError = new Error('Database error');
      PingService.findOne = jest.fn().mockRejectedValue(mockError);
      
      await getServiceLogs(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Get service logs error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Failed to get service logs', 
        error: mockError.message 
      });
    });
  });
  
  describe('getAllLogs', () => {
    test('should return logs from all services', async () => {
      const mockServices = [
        { 
          _id: 'service1', 
          name: 'Service 1',
          logs: [
            { 
              toObject: () => ({ timestamp: new Date('2023-01-01'), status: 'up' }) 
            }
          ]
        },
        { 
          _id: 'service2', 
          name: 'Service 2',
          logs: [
            { 
              toObject: () => ({ timestamp: new Date('2023-01-02'), status: 'down' }) 
            }
          ]
        }
      ];
      
      PingService.find = jest.fn().mockResolvedValue(mockServices);
      
      await getAllLogs(req, res);
      
      expect(PingService.find).toHaveBeenCalledWith({ userId: 'user123' });
      expect(res.json).toHaveBeenCalledWith([
        { 
          timestamp: new Date('2023-01-02'), 
          status: 'down',
          serviceName: 'Service 2',
          serviceId: 'service2'
        },
        { 
          timestamp: new Date('2023-01-01'), 
          status: 'up',
          serviceName: 'Service 1',
          serviceId: 'service1'
        }
      ]);
    });
    
    test('should handle empty services array', async () => {
      PingService.find = jest.fn().mockResolvedValue([]);
      
      await getAllLogs(req, res);
      
      expect(res.json).toHaveBeenCalledWith([]);
    });
    
    test('should handle errors correctly', async () => {
      const mockError = new Error('Database error');
      PingService.find = jest.fn().mockRejectedValue(mockError);
      
      await getAllLogs(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Get all logs error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Failed to get logs', 
        error: mockError.message 
      });
    });
  });
  
  describe('pingServiceManually', () => {
    test('should ping a service successfully', async () => {
      req.params.id = 'service1';
      const mockService = { _id: 'service1', name: 'Service 1' };
      const updatedService = { 
        _id: 'service1', 
        lastStatus: 'up', 
        lastPinged: new Date(),
        nextPingDue: new Date(Date.now() + 600000), // 10 minutes from now
        logs: [{ status: 'up', timestamp: new Date() }]
      };
      
      PingService.findOne = jest.fn().mockResolvedValue(mockService);
      pingScheduler.pingService = jest.fn().mockResolvedValue();
      PingService.findById = jest.fn().mockResolvedValue(updatedService);
      
      await pingServiceManually(req, res);
      
      expect(PingService.findOne).toHaveBeenCalledWith({ 
        _id: 'service1',
        userId: 'user123'
      });
      expect(pingScheduler.pingService).toHaveBeenCalledWith(mockService);
      expect(PingService.findById).toHaveBeenCalledWith('service1');
      expect(res.json).toHaveBeenCalledWith({
        message: 'Service pinged successfully',
        lastStatus: updatedService.lastStatus,
        lastPinged: updatedService.lastPinged,
        nextPingDue: updatedService.nextPingDue,
        logs: updatedService.logs
      });
    });
    
    test('should return 404 if service not found', async () => {
      req.params.id = 'nonexistent';
      PingService.findOne = jest.fn().mockResolvedValue(null);
      
      await pingServiceManually(req, res);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Service not found' });
    });
    
    test('should handle errors correctly', async () => {
      req.params.id = 'service1';
      const mockError = new Error('Ping error');
      PingService.findOne = jest.fn().mockResolvedValue({ _id: 'service1' });
      pingScheduler.pingService = jest.fn().mockRejectedValue(mockError);
      
      await pingServiceManually(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Manual ping error:', mockError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Failed to ping service', 
        error: mockError.message 
      });
    });
  });

  // If analyzePingResults exists, add tests for it
  if (typeof analyzePingResults === 'function') {
    describe('analyzePingResults', () => {
      test('should analyze ping results and return insights', async () => {
        const pingData = {
          url: 'https://example.com',
          logs: [
            { status: 'up', responseTime: 200, timestamp: new Date('2023-01-01') },
            { status: 'down', errorType: 'timeout', timestamp: new Date('2023-01-02') },
            { status: 'up', responseTime: 300, timestamp: new Date('2023-01-03') }
          ]
        };
        
        sendMessage.mockResolvedValue('Analysis: Site has good uptime');
        
        const result = await analyzePingResults(pingData);
        
        expect(sendMessage).toHaveBeenCalled();
        expect(result).toContain('Analysis');
      });
      
      test('should handle errors during analysis', async () => {
        const pingData = { url: 'https://example.com', logs: [] };
        const mockError = new Error('API error');
        
        sendMessage.mockRejectedValue(mockError);
        
        const result = await analyzePingResults(pingData);
        
        expect(logger.error).toHaveBeenCalled();
        expect(result).toContain('Unable to analyze');
      });
    });
  }
}); 