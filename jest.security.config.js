module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/security/**/*.test.js',
    '**/__tests__/security/https.security.test.js'
  ],
  collectCoverage: true,
  coverageDirectory: 'coverage/security',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: ['./jest.security.setup.js'],
  testTimeout: 30000,
  verbose: true,
  globals: {
    beforeAll: true,
    afterAll: true,
    beforeEach: true,
    afterEach: true,
    describe: true,
    expect: true,
    it: true,
    jest: true
  },
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'reports/security',
      outputName: 'security-test-results.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ]
}; 