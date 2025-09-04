const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Auth fields (from authController)
  fullName: { 
    type: String, 
    required: [true, 'Full name is required'],
    trim: true 
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: { 
    type: String,
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't include password in queries by default
  },
  googleId: { type: String },
  profileImageUrl: { type: String },
  
  // Profile fields (from your existing model)
  profilePhoto: { type: String, default: "" },
  name: { type: String }, // Alias for fullName for compatibility
  username: { 
    type: String, 
    unique: true,
    sparse: true // Allow null values while maintaining uniqueness
  },
  bio: { type: String },
  age: { type: Number, min: 0, max: 150 },
  gender: { 
    type: String, 
    enum: ["Male", "Female", "Other", "Prefer not to say"], 
    default: "Prefer not to say" 
  },
  aboutMe: { type: String },
  interests: { type: [String], default: [] },
  accomplishments: { type: [String], default: [] },
  contact: {
    phone: String,
    website: String,
    facebook: String,
    instagram: String,
    line: String
  },
  
  // User preferences
  currency: { type: String, default: 'USD' },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  weekStartsOn: { type: Number, min: 0, max: 6, default: 0 }, // 0 = Sunday
  language: { type: String, default: 'en' }
}, { 
  timestamps: true 
});

// Virtual for backward compatibility
userSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Ensure fullName is available as name for backward compatibility
    if (ret.fullName && !ret.name) {
      ret.name = ret.fullName;
    }
    if (ret.name && !ret.fullName) {
      ret.fullName = ret.name;
    }
    delete ret.__v;
    delete ret.password;
    return ret;
  }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 }, { sparse: true });
userSchema.index({ googleId: 1 }, { sparse: true });

// Pre-save hook to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  
  // Sync name and fullName fields
  if (this.isModified('fullName') && !this.name) {
    this.name = this.fullName;
  }
  if (this.isModified('name') && !this.fullName) {
    this.fullName = this.name;
  }
  
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Static method to find user with password for login
userSchema.statics.findForLogin = function(email) {
  return this.findOne({ email }).select('+password');
};

// Method to update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
