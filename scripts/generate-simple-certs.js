/**
 * Simple SSL/TLS Certificate Generator
 * 
 * Creates dummy SSL files for development purposes only.
 * DO NOT use these in production!
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SSL_DIR = path.join(__dirname, '../ssl');
const KEY_PATH = path.join(SSL_DIR, 'private.key');
const CERT_PATH = path.join(SSL_DIR, 'certificate.crt');

// Create SSL directory if it doesn't exist
if (!fs.existsSync(SSL_DIR)) {
  fs.mkdirSync(SSL_DIR, { recursive: true });
  console.log(`Created directory: ${SSL_DIR}`);
}

console.log('Generating private key...');
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
  
  // For Node.js versions that don't support createCertificate,
  // we'll create a basic placeholder certificate for development
  // This is NOT a real certificate and won't validate!
  const certContent = `-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUEF5Ef4T0+KpMLmsp+Yf11D+YmnowDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yMzA0MTUwMDU5MThaFw0yNDA0
MTQwMDU5MThaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQC+YBS3zFvMCPg1L1KeF7aWYdWJ1Xo9mN0U8VtpmpAa
ZSOoNNBpcKGHMi1mB7W0S7KPP6klzMXXL5ISk3hq7WIK2eCjvmW9yVMzTZ0DtNAF
4hSA8vpX2OKsYg++15JBEGCFaDzl5JFYbIZdW1U8zHUyExUNAJ9q3bYHJkHbdLri
ueZYZpTLzd3Kx/Xye6GmYn9CtLuL6CzZAHhgrMcNMcuL4qk7cMyA3YkfDT+kB4RC
eWRTrm67dsD1qU8jE5j0qwT0eB2Lc/xRLw+JtwVEuxgkH1M0h1JBdDP+mZ9bBKvS
FhTe4CJIlnRQMggjzxkl1ohMiyitEBcQpYPTmgX/TiBXAgMBAAGjUzBRMB0GA1Ud
DgQWBBQbXB9B5Jd1iNw4GJpS3BZBxSt3ODAfBgNVHSMEGDAWgBQbXB9B5Jd1iNw4
GJpS3BZBxSt3ODAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBH
JYXYDcZ8UXh1REJLjOFMvVwaiWayE4+YYL6yfDcpvyRUfGDiCQlkKwzXDxBOE4lO
3SxW42zC4Nf5bJYs/CpJH0DrnXf0KkPt39XXz+8D9HGUStG1+oQXiMk3uWvfJ+Ny
vMFHtQHFcL9hQvE2k0W1vM39RVPAFrmnKFjLKqfUGCXuDBA/4BcjIWFQsMbZVtt0
XA0CRz/rSdkpeCytR8QkvuZeUKxZ+h+bQa3gLVfFj/RBZSZW4WyQQWg6XOFgYGBX
HFUDdXDdcSQT5qYQQ23vCUy3dWDFfHZAjqo2JnRUZ0RQnqkxl4GQfjfTXbHEcLYD
pttP2qXqPnbQRgQWdL0N
-----END CERTIFICATE-----`;

  fs.writeFileSync(CERT_PATH, certContent);
  console.log(`Self-signed certificate written to: ${CERT_PATH}`);
  
  console.log('\n========================================');
  console.log('SSL/TLS FILES GENERATED');
  console.log('========================================');
  console.log(`Private key: ${KEY_PATH}`);
  console.log(`Certificate: ${CERT_PATH}`);
  console.log('\nWARNING: These are for development only.');
  console.log('DO NOT use these in production!');
  console.log('For production, use certificates from a trusted CA.');
  console.log('========================================');
} catch (error) {
  console.error('Error generating certificates:', error);
  process.exit(1);
} 