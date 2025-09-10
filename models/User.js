// const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');

// const userSchema = new mongoose.Schema({
//   // Auth fields
//   fullName: { 
//     type: String, 
//     required: [true, 'Full name is required'],
//     trim: true 
//   },
//   email: { 
//     type: String, 
//     required: [true, 'Email is required'], 
//     unique: true,
//     lowercase: true,
//     trim: true,
//     match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
//   },
//   password: { 
//     type: String,
//     minlength: [6, 'Password must be at least 6 characters long'],
//     select: false
//   },
//   googleId: { type: String },
//   profileImageUrl: { type: String },

//   // Profile fields
//   profilePhoto: {
//     data: { type: String },       // Base64 string
//     contentType: { type: String } // MIME type, e.g., 'image/png'
//   },
//   name: { type: String }, // Alias for fullName
//   username: { 
//     type: String, 
//     unique: true,
//     sparse: true
//   },
//   bio: { type: String },
//   age: { type: Number, min: 0, max: 150 },
//   gender: { 
//     type: String, 
//     enum: ["Male", "Female", "Other", "Prefer not to say"], 
//     default: "Prefer not to say" 
//   },
//   aboutMe: { type: String },
//   interests: { type: [String], default: [] },
//   accomplishments: { type: [String], default: [] },
//   contact: {
//     phone: String,
//     website: String,
//     facebook: String,
//     instagram: String,
//     line: String
//   },

//   // Preferences
//   currency: { type: String, default: 'USD' },
//   theme: { type: String, enum: ['light', 'dark'], default: 'light' },
//   weekStartsOn: { type: Number, min: 0, max: 6, default: 0 },
//   language: { type: String, default: 'en' }
// }, { 
//   timestamps: true 
// });

// // Virtual for backward compatibility
// userSchema.virtual('id').get(function() {
//   return this._id.toHexString();
// });

// userSchema.set('toJSON', {
//   virtuals: true,
//   transform: function(doc, ret) {
//     if (ret.fullName && !ret.name) ret.name = ret.fullName;
//     if (ret.name && !ret.fullName) ret.fullName = ret.name;
//     delete ret.__v;
//     delete ret.password;
//     return ret;
//   }
// });

// // Indexes
// userSchema.index({ email: 1 });
// userSchema.index({ username: 1 }, { sparse: true });
// userSchema.index({ googleId: 1 }, { sparse: true });

// // Pre-save hook to hash password
// userSchema.pre('save', async function(next) {
//   if (this.isModified('password') && this.password) {
//     const salt = await bcrypt.genSalt(10);
//     this.password = await bcrypt.hash(this.password, salt);
//   }

//   // Sync name and fullName
//   if (this.isModified('fullName') && !this.name) this.name = this.fullName;
//   if (this.isModified('name') && !this.fullName) this.fullName = this.name;

//   next();
// });

// // Methods
// userSchema.methods.comparePassword = async function(candidatePassword) {
//   if (!this.password) return false;
//   return await bcrypt.compare(candidatePassword, this.password);
// };

// userSchema.statics.findForLogin = function(email) {
//   return this.findOne({ email }).select('+password');
// };

// userSchema.methods.updateLastLogin = function() {
//   this.lastLogin = new Date();
//   return this.save();
// };

// module.exports = mongoose.model('User', userSchema);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Auth fields
  fullName: { type: String, required: [true, 'Full name is required'], trim: true },
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: { type: String, minlength: 6, select: false },
  googleId: { type: String },

  // Profile photo stored as Base64
  profilePhoto: {
    data: { type: String },
    contentType: { type: String }
  },
  profileImageUrl: { type: String }, // optional

  // Profile info
  name: { type: String },
  username: { type: String, unique: true, sparse: true },
  bio: { type: String },
  age: { type: Number, min: 0, max: 150 },
  gender: { type: String, enum: ["Male","Female","Other","Prefer not to say"], default: "Prefer not to say" },
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

  // Preferences
  currency: { type: String, default: 'USD' },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  weekStartsOn: { type: Number, min: 0, max: 6, default: 0 },
  language: { type: String, default: 'en' }
}, { timestamps: true });

// Virtual for backward compatibility
userSchema.virtual('id').get(function() { return this._id.toHexString(); });

userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    if (ret.fullName && !ret.name) ret.name = ret.fullName;
    if (ret.name && !ret.fullName) ret.fullName = ret.name;
    delete ret.__v;
    delete ret.password;
    // Convert Base64 to data URL for frontend
    if (ret.profilePhoto?.data && ret.profilePhoto?.contentType) {
      ret.profilePhotoUrl = `data:${ret.profilePhoto.contentType};base64,${ret.profilePhoto.data}`;
    } else {
      ret.profilePhotoUrl = null;
    }
    return ret;
  }
});

// Pre-save hook for password
userSchema.pre('save', async function(next) {
  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  if (this.isModified('fullName') && !this.name) this.name = this.fullName;
  if (this.isModified('name') && !this.fullName) this.fullName = this.name;

  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
