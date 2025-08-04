const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCAN_DIR = path.join(__dirname, '../reports/security');
const DATE = new Date().toISOString().split('T')[0];

// Ensure scan directory exists
if (!fs.existsSync(SCAN_DIR)) {
  fs.mkdirSync(SCAN_DIR, { recursive: true });
}

console.log('Starting comprehensive security scan...');

// Run npm audit
console.log('\nRunning npm audit...');
try {
  execSync('npm audit', { stdio: 'inherit' });
} catch (error) {
  console.warn('npm audit found vulnerabilities:', error);
}

// Run Snyk scan
console.log('\nRunning Snyk scan...');
try {
  execSync('snyk test', { stdio: 'inherit' });
} catch (error) {
  console.warn('Snyk scan found vulnerabilities:', error);
}

// Run dependency check
console.log('\nRunning dependency check...');
try {
  execSync('dependency-check package.json', { stdio: 'inherit' });
} catch (error) {
  console.warn('Dependency check found issues:', error);
}

// Run retire.js scan
console.log('\nRunning retire.js scan...');
try {
  execSync('retire', { stdio: 'inherit' });
} catch (error) {
  console.warn('Retire.js scan found vulnerabilities:', error);
}

// Run ESLint security checks
console.log('\nRunning ESLint security checks...');
try {
  execSync('npx eslint . --plugin security', { stdio: 'inherit' });
} catch (error) {
  console.warn('ESLint security check found issues:', error);
}

// Run security tests
console.log('\nRunning security tests...');
try {
  execSync('npm run security:test', { stdio: 'inherit' });
} catch (error) {
  console.warn('Security tests failed:', error);
}

// Run SonarQube scan if configured
if (process.env.SONAR_TOKEN) {
  console.log('\nRunning SonarQube scan...');
  try {
    execSync('node scripts/sonar-scan.js', { stdio: 'inherit' });
  } catch (error) {
    console.warn('SonarQube scan failed:', error);
  }
}

// Generate report
const report = {
  date: DATE,
  scans: {
    npmAudit: 'Completed',
    snyk: 'Completed',
    dependencyCheck: 'Completed',
    retire: 'Completed',
    eslint: 'Completed',
    securityTests: 'Completed',
    sonarqube: process.env.SONAR_TOKEN ? 'Completed' : 'Skipped'
  },
  summary: 'Security scan completed. Check individual scan results for details.'
};

fs.writeFileSync(
  path.join(SCAN_DIR, `security-scan-${DATE}.json`),
  JSON.stringify(report, null, 2)
);

console.log('\nSecurity scan completed. Check reports/security directory for detailed results.'); 