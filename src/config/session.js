const session = require('express-session');
const MongoStore = require('connect-mongo');
const logger = require('../utils/logger');

const configureSession = (app, mongoUri) => {
    // Configure session middleware
    // Configure MongoDB session store
    const store = MongoStore.create({
        mongoUrl: mongoUri,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60, // 1 day
        autoRemove: 'native',
        touchAfter: 24 * 3600 // Only update session once per day unless data changes
    });

    // Configure session middleware
    app.use(session({
        store,
        secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'development-secret-key',
        resave: false,
        saveUninitialized: false,
        name: 'sessionId', // Change from default 'connect.sid'
        cookie: {
            secure: process.env.NODE_ENV === 'production', // Only send cookies over HTTPS in production
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
        }
    }));

    logger.info('Session middleware configured with MongoDB store');
};

module.exports = configureSession;
