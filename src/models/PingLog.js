const mongoose = require('mongoose');

/**
 * Schema for ping log entries
 */
const pingLogSchema = new mongoose.Schema({
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PingService',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['success', 'error', 'warning'],
    required: true,
    index: true
  },
  statusCode: {
    type: Number
  },
  message: {
    type: String
  },
  responseTime: {
    type: Number
  },
  validationPassed: {
    type: Boolean
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  responseData: {
    type: String
  },
  requestDetails: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Create compound index for faster queries
pingLogSchema.index({ serviceId: 1, timestamp: -1 });

// Add TTL index for automatic cleanup of old logs (30 days)
pingLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('PingLog', pingLogSchema); 