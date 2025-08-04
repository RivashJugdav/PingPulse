const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create security test directories if they don't exist
const dirs = ['__tests__/security', 'reports/security', 'coverage/security'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Global security test utilities
global.securityTestUtils = {
  // Generate test data for security testing
  generateTestData: (size = 1) => {
    return {
      valid: {
        email: 'test@example.com',
        password: 'ValidP@ssw0rd123'
      },
      tokens: {
        expired: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NTYiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTUxNjIzOTAyM30.4Adcj3UFYzPUVaVF43FmMze6QnqyHh4k6YwqXh5YqXk',
        valid: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NTYiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTUxNjIzOTAyM30.4Adcj3UFYzPUVaVF43FmMze6QnqyHh4k6YwqXh5YqXk'
      },
      malicious: {
        xss: '<script>alert("xss")</script>',
        sqlInjection: "' OR '1'='1",
        commandInjection: '$(cat /etc/passwd)',
        largePayload: 'A'.repeat(size * 1024), // size in KB instead of MB
        pathTraversal: '../../../etc/passwd',
        noSqlInjection: { $gt: '' },
        prototypePollution: JSON.parse('{"__proto__": {"polluted": true}}')
      }
    };
  },

  // Check for common security headers
  checkSecurityHeaders: (response) => {
    const requiredHeaders = [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'X-XSS-Protection',
      'Strict-Transport-Security',
      'Content-Security-Policy',
      'Referrer-Policy',
      'Permissions-Policy'
    ];
    
    const missingHeaders = requiredHeaders.filter(header => !response.headers[header.toLowerCase()]);
    return {
      hasAllHeaders: missingHeaders.length === 0,
      missingHeaders
    };
  },

  // Run SonarQube scan
  runSonarScan: async () => {
    try {
      const scanner = require('sonarqube-scanner');
      return new Promise((resolve, reject) => {
        scanner({
          serverUrl: process.env.SONAR_HOST_URL || 'http://localhost:9000',
          token: process.env.SONAR_TOKEN,
          options: {
            'sonar.sources': '.',
            'sonar.tests': '__tests__',
            'sonar.test.inclusions': '**/*.test.js',
            'sonar.javascript.lcov.reportPaths': 'coverage/lcov-report/lcov.info',
            'sonar.testExecutionReportPaths': 'reports/security/test-execution-report.xml'
          }
        }, resolve);
      });
    } catch (error) {
      console.error('SonarQube scan failed:', error);
      return null;
    }
  }
};

// Run security checks before all tests
beforeAll(async () => {
  // Check for known vulnerabilities in dependencies
  try {
    execSync('npm audit', { stdio: 'inherit' });
  } catch (error) {
    console.warn('npm audit found vulnerabilities:', error);
  }

  // Check for outdated dependencies
  try {
    execSync('npm outdated', { stdio: 'inherit' });
  } catch (error) {
    console.warn('npm outdated check failed:', error);
  }

  // Run ESLint security checks
  try {
    execSync('npx eslint . --plugin security', { stdio: 'inherit' });
  } catch (error) {
    console.warn('ESLint security check found issues:', error);
  }
}); 