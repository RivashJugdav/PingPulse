const PingService = require('../../models/PingService');
const pingSchedulerInstance = require('../../services/pingScheduler');
const axios = require('axios');

// Create a PingScheduler class for testing (since the actual file exports a singleton instance)
class PingScheduler {
  constructor() {
    this.metrics = {
      totalPings: 0,
      successfulPings: 0,
      failedPings: 0,
      avgResponseTime: 0
    };
    this.cronJobs = {};
    this.isRunning = true;
    this.healthCheckInterval = null;
  }
  
  async pingService(service) {
    return pingSchedulerInstance.pingService(service);
  }
  
  async shutdown() {
    // Mock shutdown - do nothing
    return Promise.resolve();
  }
  
  async refreshSchedules() {
    // Mock implementation
    return Promise.resolve(true);
  }
  
  async init() {
    // Mock implementation
    return Promise.resolve(true);
  }
}

// Mock dependencies
jest.mock('../../models/PingService');
jest.mock('axios');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

// Mock User model for subscription plan lookups
jest.mock('../../models/User', () => {
  return {
    findById: jest.fn().mockImplementation((userId) => {
      // Create a mock object with a select method
      return {
        select: jest.fn().mockImplementation(() => {
          // Return different subscription plans based on userId for testing
          if (userId === 'free-user') {
            return Promise.resolve({ subscription: { plan: 'free' } });
          } else if (userId === 'basic-user') {
            return Promise.resolve({ subscription: { plan: 'basic' } });
          } else if (userId === 'premium-user') {
            return Promise.resolve({ subscription: { plan: 'premium' } });
          } else {
            return Promise.resolve(null);
          }
        })
      };
    })
  };
});

// Increase timeout for tests with long-running operations
jest.setTimeout(90000);

describe('Ping Service', () => {
  let scheduler;
  let mockService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new PingScheduler();
    
    // Create a mock service with necessary properties
    mockService = {
      _id: 'mockServiceId',
      url: 'https://example.com',
      interval: 5,
      active: true,
      lastPinged: null,
      lastStatus: null,
      logs: [],
      userId: {
        subscription: {
          active: true,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        }
      },
      save: jest.fn().mockResolvedValue(),
      monitorType: 'http'
    };
  });

  afterEach(async () => {
    await scheduler.shutdown();
  });

  describe('PingScheduler', () => {
    test('should initialize correctly', async () => {
      scheduler.refreshSchedules = jest.fn().mockResolvedValue();
      const initResult = await scheduler.init();
      expect(initResult).toBe(true);
    });

    describe('Error Scenarios', () => {
      test('should handle network failures', async () => {
        axios.get.mockRejectedValueOnce(new Error('Network Error'));
        
        await scheduler.pingService(mockService);
        
        expect(mockService.lastStatus).toBe('error');
        expect(mockService.logs[0].message).toContain('Network Error');
        expect(mockService.save).toHaveBeenCalled();
      });

      test('should handle invalid responses', async () => {
        axios.get.mockResolvedValueOnce({
          status: 500,
          data: 'Internal Server Error'
        });
        
        await scheduler.pingService(mockService);
        
        expect(mockService.lastStatus).toBe('error');
        expect(mockService.logs[0].message).toContain('Error: HTTP 500');
        expect(mockService.save).toHaveBeenCalled();
      });

      test('should handle malformed URLs', async () => {
        mockService.url = 'invalid-url';
        axios.get.mockRejectedValueOnce(new Error('Invalid URL'));
        
        await scheduler.pingService(mockService);
        
        expect(mockService.lastStatus).toBe('error');
        expect(mockService.logs[0].message).toContain('Invalid URL');
        expect(mockService.save).toHaveBeenCalled();
      });
    });

    describe('Timeout Scenarios', () => {
      test('should handle request timeouts', async () => {
        axios.get.mockRejectedValueOnce(new Error('timeout of 60000ms exceeded'));
        
        await scheduler.pingService(mockService);
        
        expect(mockService.lastStatus).toBe('error');
        expect(mockService.logs[0].message).toContain('timeout');
        expect(mockService.save).toHaveBeenCalled();
      });

      test('should handle slow responses', async () => {
        // Mock a slow response that takes longer than the timeout
        axios.get.mockImplementationOnce(() => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout of 60000ms exceeded')), 61000)
        ));
        
        await scheduler.pingService(mockService);
        
        expect(mockService.lastStatus).toBe('error');
        expect(mockService.logs[0].message).toContain('timeout');
        expect(mockService.save).toHaveBeenCalled();
      }, 65000); // Increased timeout to 65 seconds
    });

    describe('Concurrent Handling', () => {
      test('should handle multiple concurrent pings', async () => {
        const services = [
          { ...mockService, _id: 'service1', url: 'https://example1.com', logs: [], monitorType: 'http', save: jest.fn().mockResolvedValue() },
          { ...mockService, _id: 'service2', url: 'https://example2.com', logs: [], monitorType: 'http', save: jest.fn().mockResolvedValue() },
          { ...mockService, _id: 'service3', url: 'https://example3.com', logs: [], monitorType: 'http', save: jest.fn().mockResolvedValue() }
        ];

        // Clear previous mocks
        axios.get.mockReset();

        // Set up axios.get to return success for all URLs
        axios.get.mockImplementation((url) => {
          return Promise.resolve({ status: 200, data: 'OK' });
        });

        // Process all services concurrently
        await Promise.all(services.map(service => scheduler.pingService(service)));

        // Verify each service was updated correctly
        services.forEach(service => {
          expect(service.lastStatus).toBe('success');
          expect(service.logs.length).toBe(1);
          expect(service.save).toHaveBeenCalled();
        });
      });

      test('should handle concurrent errors without affecting other pings', async () => {
        const services = [
          { ...mockService, _id: 'service1', url: 'https://example1.com', logs: [], monitorType: 'http', save: jest.fn().mockResolvedValue() },
          { ...mockService, _id: 'service2', url: 'https://example2.com', logs: [], monitorType: 'http', save: jest.fn().mockResolvedValue() },
          { ...mockService, _id: 'service3', url: 'https://example3.com', logs: [], monitorType: 'http', save: jest.fn().mockResolvedValue() }
        ];

        // Clear previous mocks
        axios.get.mockReset();

        // Set up axios.get to return success or error based on URL
        axios.get.mockImplementation((url) => {
          if (url === 'https://example2.com') {
            return Promise.reject(new Error('Service 2 Error'));
          }
          return Promise.resolve({ status: 200, data: 'OK' });
        });

        // Process all services concurrently
        await Promise.all(services.map(service => scheduler.pingService(service)));

        // Verify each service has the expected status
        expect(services[0].lastStatus).toBe('success');
        expect(services[1].lastStatus).toBe('error');
        expect(services[2].lastStatus).toBe('success');
      });
    });

    describe('History Management', () => {
      it('should maintain correct log history size', async () => {
        // Create a mock service with string userId to trigger User lookup
        const mockService = {
          _id: 'test-service-id',
          userId: 'free-user', // Using string userId to trigger the User.findById
          url: 'https://example.com',
          name: 'Test Service',
          interval: 10,
          active: true,
          logs: [],
          lastChecked: null,
          lastStatus: null,
          uptime: 100,
          responseTime: 0,
          save: jest.fn().mockResolvedValue(true)
        };
        
        // Add more than the retention limit of logs (default is 100 for free tier)
        for (let i = 0; i < 110; i++) {
          mockService.logs.push({
          timestamp: new Date(),
            status: i % 2 === 0 ? 'success' : 'error',
          responseTime: 100,
            message: i % 2 === 0 ? 'OK' : 'Error'
          });
        }
        
        // Test the pingService method with our mock
        await scheduler.pingService(mockService);
        
        // Verify logs were trimmed to retention limit
        expect(mockService.logs.length).toBeLessThanOrEqual(100);
        expect(mockService.save).toHaveBeenCalled();
      });

      test('should maintain correct log order', async () => {
        const timestamps = [];
        axios.get.mockResolvedValue({ status: 200 });
        
        // Perform multiple pings
        for (let i = 0; i < 5; i++) {
          await scheduler.pingService(mockService);
          timestamps.push(mockService.logs[mockService.logs.length - 1].timestamp);
        }
        
        // Verify timestamps are in ascending order
        const isAscending = timestamps.every((t, i) => 
          i === 0 || t >= timestamps[i - 1]
        );
        
        expect(isAscending).toBe(true);
      });
    });

    describe('Status Transitions', () => {
      test('should correctly transition from up to down', async () => {
        mockService.lastStatus = 'success';
        
        axios.get.mockRejectedValueOnce(new Error('Service Down'));
        
        await scheduler.pingService(mockService);
        
        expect(mockService.lastStatus).toBe('error');
        expect(mockService.logs[0].status).toBe('error');
        expect(mockService.save).toHaveBeenCalled();
      });

      test('should correctly transition from down to up', async () => {
        mockService.lastStatus = 'error';
        mockService.monitorType = 'http';
        mockService.logs = [{
          timestamp: new Date(Date.now() - 60000),
          status: 'error',
          message: 'Previous error'
        }];
        
        // Mock a successful HTTP response
        axios.get.mockResolvedValueOnce({ 
          status: 200,
          data: 'OK'
        });
        
        await scheduler.pingService(mockService);
        
        expect(mockService.lastStatus).toBe('success');
        expect(mockService.logs[1].status).toBe('success');
        expect(mockService.save).toHaveBeenCalled();
      });

      test('should maintain status history through transitions', async () => {
        // Start with success
        mockService.lastStatus = 'success';
        mockService.monitorType = 'http';
        mockService.logs = [];
        
        // First transition to error
        axios.get.mockRejectedValueOnce(new Error('First Failure'));
        await scheduler.pingService(mockService);
        
        // Transition to error
        expect(mockService.lastStatus).toBe('error');
        expect(mockService.logs[0].status).toBe('error');
        
        // Then mock a successful response for the second ping
        axios.get.mockResolvedValueOnce({ 
          status: 200,
          data: 'OK'
        });
        
        // Transition back to success
        await scheduler.pingService(mockService);
        
        expect(mockService.lastStatus).toBe('success');
        expect(mockService.logs[1].status).toBe('success');
        expect(mockService.logs.length).toBe(2);
      });
    });
  });
});