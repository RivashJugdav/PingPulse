// src/utils/jwt.js
const jwt = require('jsonwebtoken');
const logger = require('./logger');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Generate a secure random secret
 * @param {number} bytes - Number of bytes for the secret
 * @returns {string} - Hex-encoded secret
 */
const generateSecureSecret = (bytes = 64) => {
  return crypto.randomBytes(bytes).toString('hex');
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
 * Save secrets to the secrets file
 * @param {Object} secrets - Object containing secrets to save
 */
const saveSecrets = async (secrets) => {
  try {
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
 * Generate a JWT token for a user
 * @param {Object} user - User object containing _id and other data
 * @returns {String} JWT token
 */
const generateToken = async (user) => {
  // Load the current secret
  const secrets = await loadSecrets();
  
  return jwt.sign(
    { 
      id: user._id,
      email: user.email,
      plan: user.subscription?.plan || 'free'
    },
    secrets.jwt.current,
    { 
      expiresIn: process.env.JWT_EXPIRATION || '24h',
      algorithm: 'HS256'
    }
  );
};

/**
 * Verify a JWT token with rotation support
 * @param {String} token - JWT token to verify
 * @returns {Object|null} Decoded token or null if invalid
 */
const verifyTokenWithRotation = async (token) => {
  try {
    // Validate token input
    if (!token || typeof token !== 'string') {
      logger.error('Invalid token provided for verification');
      return null;
    }

    const secrets = await loadSecrets();
    
    // Try with current secret first
    try {
      return jwt.verify(token, secrets.jwt.current, { ignoreExpiration: false });
    } catch (error) {
      // If token is expired, return null
      if (error.name === 'TokenExpiredError') {
        return null;
      }
      
      // If previous secret exists, try with that
      if (secrets.jwt.previous) {
        try {
          return jwt.verify(token, secrets.jwt.previous, { ignoreExpiration: false });
        } catch (secondError) {
          if (secondError.name === 'TokenExpiredError') {
            return null;
          }
          logger.error('JWT verification failed with both current and previous secrets', {
            error: secondError.message
          });
          return null;
        }
      }
      logger.error('JWT verification failed:', {
        error: error.message,
        tokenLength: token.length
      });
      return null;
    }
  } catch (error) {
    logger.error('Error in verifyTokenWithRotation:', {
      error: error.message
    });
    return null;
  }
};

// Export all functions
module.exports = {
  generateToken,
  verifyTokenWithRotation,
  loadSecrets,
  saveSecrets,
  generateSecureSecret
};