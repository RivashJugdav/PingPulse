// src/utils/anthropic.js
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config(); // Add this line to ensure .env is loaded

// Log for debugging
console.log('Initializing Anthropic client with API key available:', !!process.env.ANTHROPIC_API_KEY);

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Send a message to Claude
 * @param {string} prompt - The user message to send to Claude
 * @param {string} model - The Claude model to use (default: claude-3-7-sonnet-20250219)
 * @returns {Promise} - Response from Claude
 */
async function sendMessage(prompt, model = 'claude-3-7-sonnet-20250219') {
  try {
    console.log('Sending message to Claude with model:', model);
    const response = await anthropic.messages.create({
      model: model,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    
    return response;
  } catch (error) {
    console.error('Error communicating with Anthropic API:', error);
    throw error;
  }
}

module.exports = {
  anthropic,
  sendMessage,
};