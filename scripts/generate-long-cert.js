const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SSL_DIR = path.join(__dirname, '../ssl');
const KEY_PATH = path.join(SSL_DIR, 'private.key');
const CERT_PATH = path.join(SSL_DIR, 'certificate.crt');
const CONFIG_PATH = path.join(SSL_DIR, 'openssl.cnf');

// Create SSL directory if it doesn't exist
if (!fs.existsSync(SSL_DIR)) {
  fs.mkdirSync(SSL_DIR, { recursive: true });
}

// Create OpenSSL config with SAN
const opensslConfig = `
[ req ]
default_bits       = 2048
default_keyfile    = private.key
distinguished_name = req_distinguished_name
x509_extensions    = v3_req
prompt            = no

[ req_distinguished_name ]
C  = US
ST = State
L  = City
O  = Development
CN = localhost

[ v3_req ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[ alt_names ]
DNS.1 = localhost
IP.1 = 127.0.0.1
`;

// Write OpenSSL configuration
fs.writeFileSync(CONFIG_PATH, opensslConfig);

try {
  // Generate private key and certificate
  execSync(`openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout "${KEY_PATH}" -out "${CERT_PATH}" -config "${CONFIG_PATH}" -extensions v3_req`);
  
  console.log('Generated new SSL files:');
  console.log(`Private key: ${KEY_PATH}`);
  console.log(`Certificate: ${CERT_PATH}`);
  console.log('\nWARNING: These are for development only.');
  console.log('DO NOT use these in production!');

  // Clean up config file
  fs.unlinkSync(CONFIG_PATH);
} catch (error) {
  console.error('Error generating certificates:', error.message);
  process.exit(1);
}

console.log('Generated new SSL files:');
console.log(`Private key: ${KEY_PATH}`);
console.log(`Certificate: ${CERT_PATH}`);
console.log('\nWARNING: These are for development only.');
console.log('DO NOT use these in production!');
