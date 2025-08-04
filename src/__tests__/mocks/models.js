// Mock models for tests

// Store created users for lookup
const userStore = new Map();

const mockUser = {
  _id: 'mockUserId',
  id: 'mockUserId',
  name: 'Test User',
  email: 'test@example.com',
  password: 'hashed_password',
  role: 'user',
  verified: true,
  subscription: {
    active: true,
    plan: 'basic',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  },
  save: jest.fn().mockResolvedValue(true),
  comparePassword: jest.fn().mockResolvedValue(true)
};

const mockPingService = {
  _id: 'mockServiceId',
  id: 'mockServiceId',
  name: 'Test Service',
  url: 'https://example.com',
  interval: 10,
  active: true,
  monitorType: 'http',
  port: 80,
  packetCount: 3,
  timeoutSeconds: 5,
  lastPinged: new Date(),
  lastStatus: 'success',
  user: 'mockUserId',
  logs: [],
  save: jest.fn().mockResolvedValue(true)
};

// Mock User model
const User = jest.fn().mockImplementation((data) => ({
  ...mockUser,
  ...data,
  save: jest.fn().mockResolvedValue(true)
}));

User.findById = jest.fn().mockImplementation((id) => {
  const user = userStore.get(id);
  return Promise.resolve(user || null);
});

User.findOne = jest.fn().mockResolvedValue(mockUser);
User.find = jest.fn().mockResolvedValue([mockUser]);

User.create = jest.fn().mockImplementation((data) => {
  const user = Array.isArray(data) 
    ? data.map(u => ({ ...mockUser, ...u, _id: Math.random().toString() }))
    : { ...mockUser, ...data, _id: Math.random().toString() };
  
  if (Array.isArray(data)) {
    user.forEach(u => userStore.set(u._id, u));
  } else {
    userStore.set(user._id, user);
  }
  
  return Promise.resolve(user);
});

User.findByIdAndUpdate = jest.fn().mockResolvedValue(mockUser);
User.findByIdAndDelete = jest.fn().mockResolvedValue({ ...mockUser, deleted: true });
User.deleteMany = jest.fn().mockImplementation(() => {
  userStore.clear();
  return Promise.resolve({ acknowledged: true, deletedCount: 0 });
});

// Mock PingService model
const PingService = jest.fn().mockImplementation(() => mockPingService);
PingService.findById = jest.fn().mockResolvedValue(mockPingService);
PingService.findOne = jest.fn().mockResolvedValue(mockPingService);
PingService.find = jest.fn().mockImplementation((query) => {
  if (query && query.userId) {
    // Return services for the specific user
    return Promise.resolve([
      {
        _id: 'service1',
        id: 'service1',
        name: 'Service 1',
        url: 'https://example.com/1',
        interval: 10,
        active: true,
        monitorType: 'http',
        lastPinged: new Date(),
        lastStatus: 'success',
        userId: query.userId,
        logs: [
          { timestamp: new Date(Date.now() - 1000), status: 'success' },
          { timestamp: new Date(Date.now() - 2000), status: 'success' }
        ]
      },
      {
        _id: 'service2',
        id: 'service2',
        name: 'Service 2',
        url: 'https://example.com/2',
        interval: 10,
        active: true,
        monitorType: 'tcp',
        port: 443,
        timeoutSeconds: 5,
        lastPinged: new Date(),
        lastStatus: 'error',
        userId: query.userId,
        logs: [
          { timestamp: new Date(Date.now() - 1000), status: 'error' },
          { timestamp: new Date(Date.now() - 2000), status: 'error' }
        ]
      },
      {
        _id: 'service3',
        id: 'service3',
        name: 'Service 3',
        url: 'https://example.com/3',
        interval: 10,
        active: false,
        monitorType: 'ping',
        packetCount: 3,
        timeoutSeconds: 10,
        lastPinged: new Date(),
        lastStatus: 'pending',
        userId: query.userId,
        logs: [
          { timestamp: new Date(Date.now() - 1000), status: 'pending' },
          { timestamp: new Date(Date.now() - 2000), status: 'pending' }
        ]
      }
    ]);
  }
  return Promise.resolve([mockPingService]);
});
PingService.create = jest.fn().mockResolvedValue(mockPingService);
PingService.countDocuments = jest.fn().mockResolvedValue(0);
PingService.findByIdAndUpdate = jest.fn().mockResolvedValue(mockPingService);
PingService.findByIdAndDelete = jest.fn().mockResolvedValue({ ...mockPingService, deleted: true });
PingService.deleteMany = jest.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 });

module.exports = {
  User,
  PingService,
  mockUser,
  mockPingService
}; 