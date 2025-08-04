/**
 * SSL/TLS Certificate Generator for Development using Node.js crypto
 * 
 * This script generates self-signed certificates for local development.
 * DO NOT use these certificates in production!
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SSL_DIR = path.join(__dirname, '../ssl');
const KEY_PATH = path.join(SSL_DIR, 'private.key');
const CERT_PATH = path.join(SSL_DIR, 'certificate.crt');

// Create SSL directory if it doesn't exist
if (!fs.existsSync(SSL_DIR)) {
  fs.mkdirSync(SSL_DIR, { recursive: true });
  console.log(`Created directory: ${SSL_DIR}`);
}

console.log('Generating key pair and self-signed certificate...');

try {
  // Generate a key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Write the private key to file
  fs.writeFileSync(KEY_PATH, privateKey);
  console.log(`Private key written to: ${KEY_PATH}`);

  // Prepare certificate attributes
  const hostname = os.hostname();
  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'Development' },
    { name: 'organizationalUnitName', value: 'Development Team' },
    { name: 'localityName', value: 'Local' },
    { name: 'countryName', value: 'US' },
    { name: 'stateOrProvinceName', value: 'State' }
  ];

  // Set certificate validity period: 365 days from now
  const startDate = new Date();
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);

  // Create a self-signed certificate
  const cert = crypto.createCertificate();
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // Self-signed, so issuer = subject
  cert.setExtensions([
    {
      name: 'basicConstraints',
      critical: true,
      cA: false
    },
    {
      name: 'keyUsage',
      critical: true,
      digitalSignature: true,
      keyEncipherment: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 2, value: hostname },
        { type: 7, ip: '127.0.0.1' }
      ]
    }
  ]);
  cert.setSerialNumber(crypto.randomBytes(16).toString('hex'));
  cert.sign(privateKey, 'sha256');
  const certPem = cert.getPEM();

  // Write the certificate to file
  fs.writeFileSync(CERT_PATH, certPem);
  console.log(`Certificate written to: ${CERT_PATH}`);

  console.log('\n========================================');
  console.log('SSL/TLS CERTIFICATE GENERATION COMPLETE');
  console.log('========================================');
  console.log(`Private key: ${KEY_PATH}`);
  console.log(`Certificate: ${CERT_PATH}`);
  console.log('\nWARNING: These are self-signed certificates for development only.');
  console.log('DO NOT use these in production!');
  console.log('\nFor production, use certificates from a trusted CA like Let\'s Encrypt.');
  console.log('========================================');

} catch (error) {
  console.error('Error generating certificate:', error);
  process.exit(1);
} 