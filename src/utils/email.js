// src/utils/email.js
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// Create a transporter object using Gmail (or another email service)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Your email address
        pass: process.env.EMAIL_PASSWORD, // Your email password or app-specific password
    },
});

// Function to send a verification email
async function sendVerificationEmail(email, code) {
    const mailOptions = {
        from: process.env.EMAIL_USER, // Sender address
        to: email, // Recipient address
        subject: 'Verify Your Email', // Email subject
        text: `Your verification code is: ${code}`, // Plain text body
        html: `<p>Your verification code is: <strong>${code}</strong></p>`, // HTML body
    };

    try {
        // Send the email
        const info = await transporter.sendMail(mailOptions);
        console.log('Verification email sent:', info.response);
        return true;
    } catch (error) {
        console.error('Error sending verification email:', error);
        throw new Error('Failed to send verification email.');
    }
}

module.exports = { sendVerificationEmail };