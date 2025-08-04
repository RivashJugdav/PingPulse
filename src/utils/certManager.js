/**
 * Certificate Manager Utility
 * 
 * Provides utilities for certificate management and monitoring.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * Check if a certificate is expiring soon
 * @param {string} certPath - Path to the certificate file
 * @param {number} daysWarning - Number of days before expiry to warn (default: 30)
 * @returns {Object} Certificate information including expiry status
 */
function checkCertificateExpiry(certPath, daysWarning = 30) {
  try {
    if (!fs.existsSync(certPath)) {
      return {
        exists: false,
        error: 'Certificate file not found'
      };
    }

    const certPem = fs.readFileSync(certPath, 'utf8');
    const cert = new crypto.X509Certificate(certPem);
    
    // Parse validity dates
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);
    const now = new Date();
    
    // Calculate days until expiry
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysUntilExpiry = Math.floor((validTo - now) / msPerDay);
    
    // Check if certificate is expired or expiring soon
    const isExpired = now > validTo;
    const isExpiring = daysUntilExpiry <= daysWarning;
    
    return {
      exists: true,
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom,
      validTo,
      daysUntilExpiry,
      isExpired,
      isExpiring,
      serial: cert.serialNumber,
      fingerprint: cert.fingerprint
    };
  } catch (error) {
    logger.error(`Error checking certificate: ${error.message}`);
    return {
      exists: true,
      error: `Invalid certificate: ${error.message}`
    };
  }
}

/**
 * Setup certificate expiry monitoring
 * @param {string} certPath - Path to the certificate file
 * @param {number} checkInterval - Interval to check certificate in milliseconds (default: 24h)
 * @param {number} daysWarning - Number of days before expiry to warn (default: 30)
 * @returns {Object} Timer and control functions
 */
function monitorCertificateExpiry(certPath, checkInterval = 86400000, daysWarning = 30) {
  // Initial check
  const initialCheck = checkCertificateExpiry(certPath, daysWarning);
  logCertificateStatus(initialCheck);
  
  // Set up interval for regular checks
  const timer = setInterval(() => {
    const certStatus = checkCertificateExpiry(certPath, daysWarning);
    logCertificateStatus(certStatus);
  }, checkInterval);
  
  // Provide control functions
  return {
    stop: () => clearInterval(timer),
    checkNow: () => {
      const certStatus = checkCertificateExpiry(certPath, daysWarning);
      logCertificateStatus(certStatus);
      return certStatus;
    }
  };
}

/**
 * Log certificate status with appropriate level
 * @param {Object} certStatus - Certificate status object
 */
function logCertificateStatus(certStatus) {
  if (!certStatus.exists) {
    logger.error(`Certificate monitoring: ${certStatus.error}`);
    return;
  }
  
  if (certStatus.error) {
    logger.error(`Certificate error: ${certStatus.error}`);
    return;
  }
  
  if (certStatus.isExpired) {
    logger.error(`Certificate EXPIRED on ${certStatus.validTo.toISOString()}`);
    return;
  }
  
  if (certStatus.isExpiring) {
    logger.warn(`Certificate expiring in ${certStatus.daysUntilExpiry} days (${certStatus.validTo.toISOString()})`);
    return;
  }
  
  logger.info(`Certificate valid until ${certStatus.validTo.toISOString()} (${certStatus.daysUntilExpiry} days remaining)`);
}

module.exports = {
  checkCertificateExpiry,
  monitorCertificateExpiry
};