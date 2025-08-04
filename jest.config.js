module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js'
  ],
  coverageDirectory: 'coverage',
  testTimeout: 60000,
  detectOpenHandles: true,
  forceExit: true,
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/config/',
    '/logs/'
  ],
  verbose: true,
  setupFiles: ['dotenv/config', './jest.setup.js'],
  watch: false,
  watchAll: false
};