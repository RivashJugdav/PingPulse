// src/services/secretRotation.js
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const nodeCron = require('node-cron');

let secretRotationJob;

/**
 * Generate a secure random secret
 * @param {number} bytes - Number of bytes for the secret
 * @returns {string} - Hex-encoded secret
 */
const generateSecureSecret = (bytes = 64) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Save the current and previous JWT secrets to the secrets file
 * @param {Object} secrets - Object containing current and previous secrets
 */
const saveSecrets = async (secrets) => {
  try {
    // In production, this would interact with a secrets manager instead
    // This is a simplified example for demonstration
    const secretsFilePath = path.join(__dirname, '../../secrets.json');
    await fs.writeFile(
      secretsFilePath, 
      JSON.stringify(secrets, null, 2), 
      { encoding: 'utf8', mode: 0o600 } // Restrictive permissions
    );
    logger.info('Secrets updated successfully');
  } catch (error) {
    logger.error('Failed to save secrets:', error);
    throw error;
  }
};

/**
 * Load secrets from the secrets file
 * @returns {Object} - Object containing current and previous secrets
 */
const loadSecrets = async () => {
  try {
    const secretsFilePath = path.join(__dirname, '../../secrets.json');
    
    try {
      const data = await fs.readFile(secretsFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // If file doesn't exist or is invalid, create new secrets
      if (error.code === 'ENOENT' || error instanceof SyntaxError) {
        const newSecrets = {
          jwt: {
            current: generateSecureSecret(),
            previous: null
          }
        };
        await saveSecrets(newSecrets);
        return newSecrets;
      }
      throw error;
    }
  } catch (error) {
    logger.error('Failed to load secrets:', error);
    throw error;
  }
};

/**
 * Rotate JWT secret
 */
const rotateJwtSecret = async () => {
    try {
      logger.info('Starting JWT secret rotation');
      
      // Load current secrets
      const secrets = await loadSecrets();
      
      // Generate new JWT secret
      const newSecret = generateSecureSecret();
      
      // Store the current secret as previous and update with new secret
      secrets.jwt.previous = secrets.jwt.current;
      secrets.jwt.current = newSecret;
      
      // Save updated secrets
      await saveSecrets(secrets);
      
      // Update environment variable for current process
      process.env.JWT_SECRET = newSecret;
      
      logger.info('JWT secret rotated successfully');
    } catch (error) {
      logger.error('JWT secret rotation failed:', error);
      throw error;
    }
  };
  
  /**
   * Initialize secret rotation service
   */
  const init = async () => {
    try {
      // Load secrets on startup
      const secrets = await loadSecrets();
      
      // Update environment variable
      process.env.JWT_SECRET = secrets.jwt.current;
      
      // Get rotation schedule from environment, default to monthly
      const schedule = process.env.SECRET_ROTATION_SCHEDULE || '0 0 1 * *';
      
      // Validate cron schedule
      if (!nodeCron.validate(schedule)) {
        logger.warn(`Invalid cron schedule: ${schedule}. Falling back to default monthly rotation.`);
        schedule = '0 0 1 * *';
      }
      
      // Schedule regular secret rotation
      secretRotationJob = nodeCron.schedule(schedule, () => {
        rotateJwtSecret().catch(err => {
          logger.error('Scheduled secret rotation failed:', err);
        });
      });
      
      logger.info(`Secret rotation service initialized with schedule: ${schedule}`);
    } catch (error) {
      logger.error('Failed to initialize secret rotation service:', error);
      throw error;
    }
  };
  
  /**
   * Stop secret rotation job
   */
  const stop = () => {
    if (secretRotationJob) {
      secretRotationJob.stop();
      logger.info('Secret rotation service stopped');
    }
  };

/**
 * Verify JWT token with current or previous secret
 * @param {string} token - JWT token to verify
 * @returns {Object|null} - Decoded token payload or null if invalid
 */
const verifyTokenWithRotation = async (token) => {
  try {
    const secrets = await loadSecrets();
    
    // Try with current secret first
    try {
      return jwt.verify(token, secrets.jwt.current);
    } catch (error) {
      // If previous secret exists, try with that
      if (secrets.jwt.previous) {
        try {
          return jwt.verify(token, secrets.jwt.previous);
        } catch (secondError) {
          logger.error('JWT verification failed with both current and previous secrets');
          return null;
        }
      }
      logger.error('JWT verification failed:', error.message);
      return null;
    }
  } catch (error) {
    logger.error('Error in verifyTokenWithRotation:', error);
    return null;
  }
};

module.exports = {
    init,
    stop,
    rotateJwtSecret
  };