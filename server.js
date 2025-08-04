// server.js
//require('newrelic');
const mongoose = require('mongoose');
const app = require('./src/app');
const logger = require('./src/utils/logger');
const pingScheduler = require('./src/services/pingScheduler');
const connectDB = require('./src/config/db');
const secretRotation = require('./src/services/secretRotation');
const validateConfig = require('./src/config/validateConfig');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const certManager = require('./src/utils/certManager');
require('dotenv').config();

// Use the pingScheduler instance directly (it's now a singleton)
// No need to create a new instance

// Add favicon route to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No content response for favicon requests
});

// Initialize server with async setup
async function initializeServer() {
  try {
    // Validate configuration before starting the server
    const config = validateConfig();

    // Configure environment variables
    const PORT = process.env.PORT || 3000;
    const NODE_ENV = process.env.NODE_ENV || 'development';
    const HTTPS_PORT = process.env.HTTPS_PORT || 443;
    const USE_HTTPS = process.env.USE_HTTPS === 'true';

    // Connect to MongoDB first
    logger.info('Connecting to MongoDB...');
    const dbConnected = await connectDB();
    
    if (!dbConnected) {
      logger.error('Failed to connect to MongoDB. Server will not start.');
      process.exit(1);
    }

    // Create HTTP Server
    const server = http.createServer(app);

    // Create HTTPS Server with secure TLS settings if enabled
    let httpsServer;
    let certMonitor;

    if (USE_HTTPS) {
      try {
        const certPath = path.join(__dirname, process.env.SSL_CERT_PATH || 'ssl/certificate.crt');
        
        // Check certificate status before starting server
        const certStatus = certManager.checkCertificateExpiry(certPath, 30);
        if (certStatus.isExpired) {
          logger.error(`Cannot start HTTPS server: Certificate is expired (${certStatus.validTo.toISOString()})`);
          if (NODE_ENV === 'production') {
            logger.error('Certificate is expired. Exiting process in production mode.');
            process.exit(1);
          }
        } else if (certStatus.isExpiring) {
          logger.warn(`Certificate is expiring soon: ${certStatus.daysUntilExpiry} days remaining`);
        }
        
        // Start certificate monitoring
        certMonitor = certManager.monitorCertificateExpiry(certPath, 86400000, 30); // Check daily
        
        // SSL/TLS certificate options
        const httpsOptions = {
          key: fs.readFileSync(path.join(__dirname, process.env.SSL_KEY_PATH || 'ssl/private.key')),
          cert: fs.readFileSync(certPath),
          ca: process.env.SSL_CA_PATH ? fs.readFileSync(path.join(__dirname, process.env.SSL_CA_PATH)) : undefined,
          
          // More permissive TLS configuration for development
          minVersion: 'TLSv1.2',
          ciphers: 'HIGH:!aNULL:!MD5',
          honorCipherOrder: true,
          sessionTimeout: 600,
          requestCert: false,
          rejectUnauthorized: false
        };
        
        httpsServer = https.createServer(httpsOptions, app);
        
        // Start HTTPS server
        httpsServer.listen(HTTPS_PORT, () => {
          logger.info(`HTTPS Server running in ${NODE_ENV} mode on port ${HTTPS_PORT}`);
        });
        
        // Handle HTTPS server errors
        httpsServer.on('error', (error) => {
          logger.error(`HTTPS Server Error: ${error.message}`);
        });
      } catch (error) {
        logger.error(`Failed to start HTTPS server: ${error.message}`);
        if (NODE_ENV === 'production') {
          logger.error('HTTPS server failed to start in production mode. Exiting process.');
          process.exit(1);
        }
      }
    }

    // Start HTTP Server (for development or redirect purposes)
    server.listen(PORT, () => {
      logger.info(`HTTP Server running in ${NODE_ENV} mode on port ${PORT}`);
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error(`HTTP Server Error: ${error.message}`);
    });

    // Initialize ping scheduler after database connection is established
    await pingScheduler.init();

    // Graceful shutdown handler
    const gracefulShutdown = async () => {
      logger.info('Received shutdown signal, closing servers...');
      
      // Stop certificate monitoring if active
      if (certMonitor) {
        certMonitor.stop();
      }
      
      // Stop ping scheduler
      await pingScheduler.shutdown();

      // Close database connection
      await mongoose.connection.close();
      logger.info('Database connection closed');
      
      // Shutdown HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
        
        // Shutdown HTTPS server if it exists
        if (httpsServer) {
          httpsServer.close(() => {
            logger.info('HTTPS server closed');
            process.exit(0);
          });
        } else {
          process.exit(0);
        }
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    // Listen for termination signals
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled Promise Rejection:', err);
    });

  } catch (error) {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

// Start the server
initializeServer().catch(error => {
  logger.error('Server initialization failed:', error);
  process.exit(1);
});