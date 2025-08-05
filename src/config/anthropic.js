const { Anthropic } = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

let anthropicClient = null;

const initializeAnthropicClient = () => {
    if (!process.env.ANTHROPIC_API_KEY) {
        logger.warn('Anthropic API key not found. Some features may be limited.');
        return null;
    }

    try {
        anthropicClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });
        logger.info('Anthropic client initialized successfully');
        return anthropicClient;
    } catch (error) {
        logger.error('Failed to initialize Anthropic client:', error);
        return null;
    }
};

const getAnthropicClient = () => {
    if (!anthropicClient) {
        return initializeAnthropicClient();
    }
    return anthropicClient;
};

module.exports = {
    initializeAnthropicClient,
    getAnthropicClient
};
