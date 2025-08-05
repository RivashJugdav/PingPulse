const session = require('express-session');
const MongoStore = require('connect-mongo');
const logger = require('../utils/logger');

const configureSession = (app, mongoUri) => {
    // Configure session middleware
    app.use(session({
        store: MongoStore.create({
            mongoUrl: mongoUri,
            collectionName: 'sessions',
            ttl: 24 * 60 * 60, // 1 day
            autoRemove: 'native',
            touchAfter: 24 * 3600 // Only update session once per day unless data changes
        }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        name: 'sessionId', // Change from default 'connect.sid'
        cookie: {
            secure: process.env.NODE_ENV === 'production', // Only send cookies over HTTPS in production
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            sameSite: 'strict'
        }
    }));

    logger.info('Session middleware configured with MongoDB store');
};

module.exports = configureSession;
