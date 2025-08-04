/**
 * SSL/TLS Certificate Generator for Development
 * 
 * This script generates self-signed certificates for local development.
 * DO NOT use these certificates in production!
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SSL_DIR = path.join(__dirname, '../ssl');
const KEY_PATH = path.join(SSL_DIR, 'private.key');
const CERT_PATH = path.join(SSL_DIR, 'certificate.crt');
const CSR_PATH = path.join(SSL_DIR, 'certificate.csr');

// Create SSL directory if it doesn't exist
if (!fs.existsSync(SSL_DIR)) {
  fs.mkdirSync(SSL_DIR, { recursive: true });
  console.log(`Created directory: ${SSL_DIR}`);
}

// Check if OpenSSL is installed
try {
  execSync('openssl version', { stdio: 'pipe' });
  console.log('OpenSSL is installed. Proceeding with certificate generation...');
} catch (error) {
  console.error('OpenSSL is not installed or not in the PATH. Please install OpenSSL to continue.');
  process.exit(1);
}

// Generate private key
console.log('Generating private key...');
try {
  execSync(`openssl genrsa -out "${KEY_PATH}" 2048`, { stdio: 'inherit' });
  console.log('Private key generated successfully.');
} catch (error) {
  console.error('Failed to generate private key:', error.message);
  process.exit(1);
}

// Create config file for SAN
const hostname = os.hostname();
const configPath = path.join(SSL_DIR, 'openssl.cnf');
const configContent = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
C = US
ST = State
L = City
O = Organization
OU = OrganizationalUnit
CN = localhost

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = ${hostname}
IP.1 = 127.0.0.1
`;

fs.writeFileSync(configPath, configContent);
console.log('OpenSSL configuration created.');

// Generate CSR with SAN
console.log('Generating Certificate Signing Request (CSR)...');
try {
  execSync(`openssl req -new -key "${KEY_PATH}" -out "${CSR_PATH}" -config "${configPath}"`, { stdio: 'inherit' });
  console.log('CSR generated successfully.');
} catch (error) {
  console.error('Failed to generate CSR:', error.message);
  process.exit(1);
}

// Generate self-signed certificate
console.log('Generating self-signed certificate...');
try {
  execSync(`openssl x509 -req -days 365 -in "${CSR_PATH}" -signkey "${KEY_PATH}" -out "${CERT_PATH}" -extensions req_ext -extfile "${configPath}"`, { stdio: 'inherit' });
  console.log('Self-signed certificate generated successfully.');
} catch (error) {
  console.error('Failed to generate self-signed certificate:', error.message);
  process.exit(1);
}

// Display certificate information
console.log('\nCertificate Information:');
try {
  const certInfo = execSync(`openssl x509 -text -noout -in "${CERT_PATH}"`, { encoding: 'utf8' });
  console.log(certInfo);
} catch (error) {
  console.error('Failed to display certificate information:', error.message);
}

// Cleanup
try {
  fs.unlinkSync(CSR_PATH);
  fs.unlinkSync(configPath);
  console.log('Cleaned up temporary files.');
} catch (error) {
  console.error('Failed to clean up temporary files:', error.message);
}

console.log('\n========================================');
console.log('SSL/TLS CERTIFICATE GENERATION COMPLETE');
console.log('========================================');
console.log(`Private key: ${KEY_PATH}`);
console.log(`Certificate: ${CERT_PATH}`);
console.log('\nWARNING: These are self-signed certificates for development only.');
console.log('DO NOT use these in production!');
console.log('\nFor production, use certificates from a trusted CA like Let\'s Encrypt.');
console.log('========================================'); 