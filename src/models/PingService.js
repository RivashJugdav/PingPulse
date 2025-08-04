// src/models/PingService.js
const mongoose = require('mongoose');

const PingLogSchema = new mongoose.Schema({
  timestamp: { 
    type: Date, 
    default: Date.now,
    get: (time) => new Date(time) // Ensure proper date formatting
  },
  status: {
    type: String,
    enum: ['success', 'error', 'pending'],
    required: true
  },
  responseTime: {
    type: Number,
    default: 0
  },
  message: String,
  // Add fields for response body validation
  responseBody: String,
  responseStatus: Number
}, { 
  _id: true,
  toJSON: { getters: true } // Apply getters when converting to JSON
});

const PingServiceSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  url: { 
    type: String, 
    required: true,
    trim: true
  },
  name: { 
    type: String, 
    default: 'My Service',
    trim: true
  },
  interval: { 
    type: Number, 
    default: 10, 
    min: 1, 
    max: 60 
  }, // in minutes
  active: { 
    type: Boolean, 
    default: true 
  },
  // Add monitor type field
  monitorType: {
    type: String,
    enum: ['http', 'tcp', 'ping'],
    default: 'http'
  },
  // TCP specific fields
  port: {
    type: Number,
    min: 1,
    max: 65535,
    default: 80
  },
  // ICMP ping specific fields
  packetCount: {
    type: Number,
    min: 1,
    max: 10,
    default: 3
  },
  timeoutSeconds: {
    type: Number,
    min: 1,
    max: 60,
    default: 5
  },
  lastPinged: {
    type: Date,
    get: (time) => time ? new Date(time) : null // Ensure proper date formatting
  },
  nextPingDue: {
    type: Date,
    default: function() {
      return new Date(Date.now() + this.interval * 60 * 1000); // Set default next ping time
    }
  },
  lastStatus: {
    type: String,
    enum: ['success', 'error', 'pending'],
    default: 'pending'
  },
  uptime: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  headers: {
    type: Map,
    of: String,
    default: () => new Map()
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'HEAD'],
    default: 'GET'
  },
  // Add request body field
  requestBody: String,
  // Add response validation fields
  validateResponse: {
    type: Boolean,
    default: false
  },
  responseValidationRule: {
    type: String,
    enum: ['contains', 'equals', 'startsWith', 'endsWith', 'regex'],
    default: 'contains'
  },
  responseValidationValue: String,
  logs: [PingLogSchema],
  createdAt: { 
    type: Date, 
    default: Date.now,
    get: (time) => new Date(time) // Ensure proper date formatting
  }
}, {
  timestamps: true,
  toJSON: { getters: true } // Apply getters when converting to JSON
});

// Index for faster queries
PingServiceSchema.index({ userId: 1, active: 1 });
PingServiceSchema.index({ interval: 1, active: 1 });
PingServiceSchema.index({ nextPingDue: 1, active: 1 });
PingServiceSchema.index({ monitorType: 1 }); // Add index for monitor type

module.exports = mongoose.model('PingService', PingServiceSchema);