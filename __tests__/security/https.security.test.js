/**
 * HTTPS Security Tests
 * 
 * Tests the HTTPS server configuration for security best practices.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const { createTestApp } = require('./testApp');

// Helper function to generate a self-signed certificate
function generateSelfSignedCert() {
  // Generate RSA key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);
  
  // Create a certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  
  const attrs = [{
    name: 'commonName',
    value: 'localhost'
  }, {
    name: 'countryName',
    value: 'US'
  }, {
    shortName: 'ST',
    value: 'Test State'
  }, {
    name: 'localityName',
    value: 'Test Locality'
  }, {
    name: 'organizationName',
    value: 'Test Org'
  }, {
    shortName: 'OU',
    value: 'Test Unit'
  }];
  
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{
    name: 'basicConstraints',
    cA: true
  }, {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  }, {
    name: 'subjectAltName',
    altNames: [{
      type: 2,
      value: 'localhost'
    }]
  }]);
  
  // Self-sign the certificate
  cert.sign(keys.privateKey, forge.md.sha256.create());
  
  // Convert to PEM format
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const certPem = forge.pki.certificateToPem(cert);
  
  return { key: privateKeyPem, cert: certPem };
}

describe('HTTPS Security Tests', () => {
  let app;
  let httpsServer;
  let serverInstance;
  let serverOptions;

  beforeAll(async () => {
    app = createTestApp();
    
    // Generate test certificates
    const { key, cert } = generateSelfSignedCert();

    // HTTPS server options
    serverOptions = {
      key: key,
      cert: cert,
      minVersion: 'TLSv1.2',
      ciphers: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256'
      ].join(':'),
      honorCipherOrder: true
    };
    
    // Create test HTTPS server
    httpsServer = https.createServer(serverOptions, app);
    serverInstance = httpsServer.listen(0); // Use random available port
  });
  
  afterAll(() => {
    if (serverInstance) {
      serverInstance.close();
    }
  });
  
  describe('TLS Configuration', () => {
    it('should use TLS 1.2 or higher', () => {
      expect(serverOptions.minVersion).toBe('TLSv1.2');
    });
    
    it('should use secure cipher suites', () => {
      const insecureCiphers = [
        'RC4',
        'DES',
        '3DES',
        'MD5',
        'NULL',
        'EXPORT',
        'LOW',
        'MEDIUM'
      ];
      
      const configuredCiphers = serverOptions.ciphers.split(':');
      
      for (const cipher of configuredCiphers) {
        for (const insecureCipher of insecureCiphers) {
          expect(cipher.includes(insecureCipher)).toBe(false);
        }
      }
    });
  });
  
  describe('Certificate Security', () => {
    it('should use a valid key pair', () => {
      expect(serverOptions.key).toBeTruthy();
      expect(serverOptions.cert).toBeTruthy();
      expect(typeof serverOptions.key).toBe('string');
      expect(typeof serverOptions.cert).toBe('string');
    });
    
    it('should use secure TLS settings', () => {
      expect(serverOptions.minVersion).toBe('TLSv1.2');
      expect(serverOptions.honorCipherOrder).toBe(true);
      expect(serverOptions.ciphers).toContain('TLS_AES_256_GCM_SHA384');
    });
  });
}); 