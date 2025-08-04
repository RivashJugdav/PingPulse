const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
  },
  googleId: {
    type: String,
    sparse: true, // Allows multiple null values but enforces uniqueness for non-null values
    index: true,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  verificationCode: {
    type: Number, // Store the verification code
  },
  verified: {
    type: Boolean, // Track verification status
    default: false,
  },
  resetPasswordToken: {
    type: Number, // Store the password reset token
  },
  resetPasswordExpires: {
    type: Date, // Store the password reset token expiration
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'premium'],
      default: 'free',
    },
    active: {
      type: Boolean,
      default: false,
    },
    expiresAt: Date,
    paymentID: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);