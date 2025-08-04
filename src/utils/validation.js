// src/utils/validation.js
const { body } = require('express-validator');

exports.createServiceValidation = [
    body('url').isURL().withMessage('Invalid URL'),
    body('interval').isInt({ min: 1 }).withMessage('Interval must be a positive integer'),
    body('monitorType').optional().isIn(['http', 'tcp', 'ping']).withMessage('Invalid monitor type'),
    body('port').optional().isInt({ min: 1, max: 65535 }).withMessage('Port must be between 1 and 65535'),
    body('packetCount').optional().isInt({ min: 1, max: 10 }).withMessage('Packet count must be between 1 and 10'),
    body('timeoutSeconds').optional().isInt({ min: 1, max: 60 }).withMessage('Timeout must be between 1 and 60 seconds')
];

exports.loginValidation = [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
];