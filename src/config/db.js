// In src/config/db.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async (retries = 5) => {
  while (retries) {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 15000, // Increase timeout to 15 seconds
        socketTimeoutMS: 45000, // Increase socket timeout
        connectTimeoutMS: 15000, // Connection timeout
        keepAlive: true,
        keepAliveInitialDelay: 300000 // 5 minutes
      });

      // Set up connection error handlers
      mongoose.connection.on('error', err => {
        logger.error('MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Attempting to reconnect...');
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
      });

      logger.info(`MongoDB Connected: ${conn.connection.host}`);
      return true;
    } catch (error) {
      logger.error(`MongoDB Connection Failed: ${error.message}. Retries left: ${retries}`);
      retries -= 1;
      if (retries > 0) {
        logger.info('Retrying connection in 5 seconds...');
        await new Promise(res => setTimeout(res, 5000)); // Wait before retrying
      }
    }
  }
  
  logger.error('Failed to connect to MongoDB after all retries');
  return false; // Return false instead of exiting to allow graceful handling
};

module.exports = connectDB;