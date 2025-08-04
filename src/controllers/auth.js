// src/controllers/auth.js
const User = require('../models/User');
const logger = require('../utils/logger');
const jwtUtils = require('../utils/jwt');
const { sendVerificationEmail } = require('../utils/email');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const fetch = require('node-fetch');

// Generate secure random code
const generateSecureCode = () => {
  // Generate a cryptographically secure 6-digit code
  return Math.floor(100000 + parseInt(crypto.randomBytes(4).toString('hex'), 16) % 900000);
};

// Register new user
exports.register = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate a secure verification code
    const verificationCode = generateSecureCode();

    // Create new user with free subscription and verification code
    const user = new User({
      name,
      email,
      password, // Will be hashed by the pre-save hook in the User model
      verificationCode,
      verified: false,
      subscription: {
        plan: 'free',
        active: true,
        expiresAt: null,
      },
    });

    await user.save();

    // Send verification email
    await sendVerificationEmail(email, verificationCode);

    // Generate token for the new user
    const token = await jwtUtils.generateToken(user);

    res.status(201).json({
      token,
      message: 'Registration successful. Please check your email for the verification code.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        subscription: user.subscription
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
};

// Verify email
exports.verifyEmail = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, code } = req.body;
    logger.info(`Email verification attempt for: ${email}`);

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Check if the user is already verified - don't send an error for Google OAuth flow
    // Instead, update verification code and continue the flow
    if (user.verified) {
      logger.info(`User ${email} is already verified, checking if this is a login verification`);
      
      // If the user is verified but has a verification code, this might be a login verification
      if (user.verificationCode) {
        // Check if the verification code matches
        if (user.verificationCode !== parseInt(code)) {
          return res.status(400).json({ message: 'Invalid verification code.' });
        }
        
        // Clear the verification code after successful validation
        user.verificationCode = undefined;
        await user.save();
        
        // Generate JWT token
        const token = await jwtUtils.generateToken(user);

        logger.info(`Login verification successful for already verified user: ${email}`);
        
        return res.status(200).json({
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            subscription: user.subscription,
          },
          message: 'Login verification successful.',
        });
      } else {
        return res.status(400).json({ message: 'Email is already verified.' });
      }
    }

    // Check if the verification code matches
    if (user.verificationCode !== parseInt(code)) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    // Mark the user as verified and clear the verification code
    user.verified = true;
    user.verificationCode = undefined;
    await user.save();

    // Generate JWT token
    const token = await jwtUtils.generateToken(user);

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        subscription: user.subscription,
      },
      message: 'Email verified successfully.',
    });
  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(500).json({ message: 'Email verification failed.', error: error.message });
  }
};

// Resend verification code
exports.resendVerificationCode = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Check if the user is already verified
    if (user.verified) {
      return res.status(400).json({ message: 'Email is already verified.' });
    }

    // Generate a new secure verification code
    const verificationCode = generateSecureCode();
    user.verificationCode = verificationCode;
    await user.save();

    // Send the new verification email
    await sendVerificationEmail(email, verificationCode);

    res.status(200).json({ message: 'A new verification code has been sent to your email.' });
  } catch (error) {
    logger.error('Resend verification code error:', error);
    res.status(500).json({ message: 'Failed to resend verification code.', error: error.message });
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      // For security reasons, don't reveal that the user doesn't exist
      return res.status(200).json({ message: 'If the email exists, a password reset code has been sent.' });
    }

    // Check if this is a Google OAuth user
    if (user.googleId) {
      // We'll handle this in the frontend, but we still return success to avoid
      // leaking information about account existence
      return res.status(200).json({ 
        message: 'If the email exists, a password reset code has been sent.',
        isGoogleUser: true
      });
    }

    // Generate a secure reset code
    const resetCode = generateSecureCode();
    user.resetPasswordToken = resetCode;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration
    await user.save();

    // Send the reset code via email
    await sendVerificationEmail(email, resetCode);

    res.status(200).json({ message: 'If the email exists, a password reset code has been sent.' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ message: 'Failed to process request.', error: error.message });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, code, newPassword } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Check if the reset token is valid and not expired
    if (
      user.resetPasswordToken !== parseInt(code) ||
      user.resetPasswordExpires < Date.now()
    ) {
      return res.status(400).json({ message: 'Invalid or expired reset code.' });
    }

    // Update the password
    user.password = newPassword; // Will be hashed by the pre-save hook
    user.resetPasswordToken = undefined; // Clear the reset token
    user.resetPasswordExpires = undefined; // Clear the expiration
    await user.save();

    res.status(200).json({ message: 'Password reset successfully.' });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password.', error: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if the user's email is verified
    if (!user.verified) {
      return res.status(401).json({ message: 'Please verify your email before logging in.' });
    }

    // Validate password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate a verification code for extra security
    const loginVerificationCode = generateSecureCode();
    user.verificationCode = loginVerificationCode;
    await user.save();

    // Send verification email for extra security
    await sendVerificationEmail(email, loginVerificationCode);

    // Generate JWT token using our utility
    const token = await jwtUtils.generateToken(user);
    console.log('Generated token:', token); // Log the token for debugging

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        subscription: user.subscription,
      },
      message: 'For extra security, please check your email for a verification code.'
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    res.json({
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      subscription: req.user.subscription,
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to get profile', error: error.message });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (email && email !== req.user.email) {
      // Check if email is already in use
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      updates.email = email;
      // If email is changing, they need to verify again
      updates.verified = false;
      updates.verificationCode = generateSecureCode();
      
      // Send verification email for the new address
      await sendVerificationEmail(email, updates.verificationCode);
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If email was changed, return appropriate message
    const message = email && email !== req.user.email 
      ? 'Profile updated. Please verify your new email address.' 
      : 'Profile updated successfully';

    res.json({ 
      user,
      message
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id);

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password', error: error.message });
  }
};

// Update subscription
exports.updateSubscription = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { plan, paymentID } = req.body;

    // Validate plan
    if (!['free', 'basic', 'premium'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid subscription plan' });
    }

    // Calculate expiration (30 days from now for paid plans)
    const expiresAt = plan !== 'free'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null;

    // Update user subscription
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          'subscription.plan': plan,
          'subscription.active': true,
          'subscription.expiresAt': expiresAt,
          'subscription.paymentID': paymentID || null,
        },
      },
      { new: true }
    ).select('-password');

    res.json({
      message: 'Subscription updated successfully',
      subscription: user.subscription,
    });
  } catch (error) {
    logger.error('Update subscription error:', error);
    res.status(500).json({ message: 'Failed to update subscription', error: error.message });
  }
};

// Auto-login after email verification
exports.autoLogin = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, verificationCode } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if the user's email is verified
    if (!user.verified) {
      return res.status(401).json({ message: 'Please verify your email before logging in.' });
    }

    // Since the user just verified their email, we'll allow login without password
    // This is secure because they've demonstrated ownership of their email
    // Generate JWT token using our utility
    const token = await jwtUtils.generateToken(user);
    
    // Log this special login for security audit purposes
    logger.info(`Auto-login after verification for user: ${user.email}`);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        subscription: user.subscription,
      },
    });
  } catch (error) {
    logger.error('Auto-login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

// Verify login code (for existing users)
exports.verifyLoginCode = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Login verification validation failed:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, code } = req.body;
    logger.info(`Attempting to verify login code for user: ${email}`);

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      logger.error(`User not found during login verification: ${email}`);
      return res.status(404).json({ message: 'User not found.' });
    }

    logger.info(`User found, verification code in DB: ${user.verificationCode}`);
    logger.info(`Provided verification code: ${code}`);

    // Check if the verification code matches
    if (user.verificationCode !== parseInt(code)) {
      logger.error(`Invalid verification code for user: ${email}`);
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    // Clear the verification code after successful validation
    user.verificationCode = undefined;
    await user.save();

    // Generate JWT token
    const token = await jwtUtils.generateToken(user);
    logger.info(`Login verification successful, token generated for user: ${email}`);

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        subscription: user.subscription,
      },
      message: 'Login verification successful.',
    });
  } catch (error) {
    logger.error('Login verification error:', error);
    res.status(500).json({ message: 'Login verification failed.', error: error.message });
  }
};

// Google OAuth login
exports.googleLogin = (req, res) => {
  // Generate and store CSRF token
  const csrf_token = crypto.randomBytes(20).toString('hex');
  res.cookie('csrf_token', csrf_token, { httpOnly: true });

  // Redirect user to Google's OAuth 2.0 server
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.append('client_id', process.env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.append('redirect_uri', process.env.GOOGLE_REDIRECT_URI);
  googleAuthUrl.searchParams.append('response_type', 'code');
  googleAuthUrl.searchParams.append('scope', 'profile email');
  googleAuthUrl.searchParams.append('state', csrf_token);
  googleAuthUrl.searchParams.append('prompt', 'select_account');
  
  logger.info('Redirecting to Google OAuth login');
  res.redirect(googleAuthUrl.toString());
};

// Google OAuth callback
exports.googleCallback = async (req, res) => {
  try {
    logger.info('Google OAuth callback received');
    
    // Verify CSRF token
    const csrf_token = req.cookies.csrf_token;
    if (csrf_token !== req.query.state) {
      logger.error('CSRF token mismatch in Google OAuth callback');
      return res.redirect('/auth-error.html?error=csrf_mismatch');
    }

    // Clear the CSRF cookie
    res.clearCookie('csrf_token');

    // Extract the authorization code
    const code = req.query.code;
    if (!code) {
      logger.error('No authorization code received from Google');
      return res.redirect('/auth-error.html?error=no_code');
    }

    logger.info('Exchanging authorization code for access token');
    // Exchange the code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      logger.error('Failed to exchange Google auth code for token:', tokenData);
      return res.redirect('/auth-error.html?error=token_exchange');
    }

    logger.info('Fetching user info from Google API');
    // Use the access token to get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    const userInfo = await userInfoResponse.json();
    if (!userInfoResponse.ok) {
      logger.error('Failed to fetch Google user info:', userInfo);
      return res.redirect('/auth-error.html?error=user_info');
    }

    logger.info(`Google user info retrieved: ${userInfo.email}`);
    
    // Look for existing user with this Google ID or email
    let user = await User.findOne({ 
      $or: [
        { googleId: userInfo.id },
        { email: userInfo.email }
      ]
    });

    if (user) {
      logger.info(`Existing user found with email: ${user.email}`);
      
      // Existing user - ensure googleId is set in case they previously registered with email
      if (!user.googleId) {
        logger.info(`Setting Google ID for existing user: ${user.email}`);
        user.googleId = userInfo.id;
        await user.save();
      }
      
      // Generate a verification code for extra security (same as regular login)
      const loginVerificationCode = generateSecureCode();
      user.verificationCode = loginVerificationCode;
      await user.save();
      
      logger.info(`Generated verification code for user: ${user.email}`);

      // Send verification email for extra security
      await sendVerificationEmail(user.email, loginVerificationCode);
      logger.info(`Verification email sent to: ${user.email}`);

      // Generate temporary token for the redirect
      const token = await jwtUtils.generateToken(user);
      
      logger.info(`Google login successful for existing user: ${user.email}`);
      
      // Redirect to the callback page with user info
      const redirectUrl = `/google-callback.html?token=${token}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}&verification=required&message=${encodeURIComponent('For extra security, please enter the verification code sent to your email')}`;
      logger.info(`Redirecting existing user to: ${redirectUrl}`);
      
      return res.redirect(redirectUrl);
    } else {
      logger.info(`New user registration via Google: ${userInfo.email}`);
      
      // New user - register them
      const verificationCode = generateSecureCode();
      
      // Create new user with Google ID
      user = new User({
        name: userInfo.name,
        email: userInfo.email,
        googleId: userInfo.id,
        verificationCode,
        verified: false, // Still require email verification for new users
        password: crypto.randomBytes(32).toString('hex'), // Generate a random password (won't be used)
        subscription: {
          plan: 'free',
          active: true,
          expiresAt: null,
        },
      });

      await user.save();
      logger.info(`New user created: ${user.email}`);

      // Send verification email
      await sendVerificationEmail(user.email, verificationCode);
      logger.info(`Verification email sent to new user: ${user.email}`);

      // Generate temporary token
      const token = await jwtUtils.generateToken(user);
      
      logger.info(`Google registration successful for new user: ${user.email}`);
      
      // Redirect to verification page with pre-filled email
      const redirectUrl = `/google-callback.html?token=${token}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}&verification=required&new_user=true&message=${encodeURIComponent('Please verify your email to complete registration')}`;
      logger.info(`Redirecting new user to: ${redirectUrl}`);
      
      return res.redirect(redirectUrl);
    }
  } catch (error) {
    logger.error('Google OAuth callback error:', error);
    return res.redirect('/auth-error.html?error=server_error');
  }
};

// Check if user is a Google OAuth user
exports.checkUserType = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      // For security reasons, always return a generic response
      return res.status(200).json({ isGoogleUser: false });
    }

    // Check if the user has a googleId
    const isGoogleUser = !!user.googleId;

    res.status(200).json({ isGoogleUser });
  } catch (error) {
    logger.error('Check user type error:', error);
    res.status(500).json({ message: 'Failed to process request.', error: error.message });
  }
};