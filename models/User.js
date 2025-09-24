const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/** Store the actual image in Mongo (Base64 + meta) */
const ProfilePhotoSchema = new mongoose.Schema(
  {
    data: String,        // base64 string (no data: prefix)
    contentType: String, // e.g. "image/png"
    filename: String,
    size: Number,        // bytes
    uploadDate: Date,
  },
  { _id: false }
);

/** Preferences used by the Settings screen (nested) */
const PreferencesSchema = new mongoose.Schema(
  {
    currency:     { type: String, enum: ['THB','USD','EUR','MMK','JPY','CNY','KRW','INR','IDR','SGD','MYR','VND','PHP','AED'], default: 'THB' },
    theme:        { type: String, enum: ['light','dark'], default: 'light' },
    weekStartsOn: { type: String, enum: ['sunday','monday'], default: 'monday' },
    language:     { type: String, default: 'en' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    // ---- Auth fields ----
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      // NOTE: removed lowercase:true so names keep original case
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false, // exclude by default
    },

    // 3rd-party auth
    googleId: { type: String, unique: true, sparse: true },

    // ---- Profile image fields ----
    profileImageUrl: { type: String, default: '' }, // convenient data URL or external URL
    profilePhoto: { type: ProfilePhotoSchema, default: null }, // <— FIXED: was String

    // ---- Profile fields (compat) ----
    name: { type: String }, // alias for fullName (legacy)
    username: { type: String, unique: true, sparse: true, trim: true },
    bio: { type: String },
    age: { type: Number, min: 0, max: 150 },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
      default: 'Prefer not to say',
    },
    aboutMe: { type: String },
    interests: { type: [String], default: [] },
    accomplishments: { type: [String], default: [] },
    contact: {
      phone: String,
      website: String,
      facebook: String,
      instagram: String,
      line: String,
    },

    // ---- Preferences (nested) ----
    preferences: { type: PreferencesSchema, default: () => ({}) },

    // ---- Legacy flat preferences (kept for backward-compat / old code paths) ----
    currency: { type: String, default: undefined },
    theme: { type: String, enum: ['light','dark'], default: undefined },
    weekStartsOn: { type: mongoose.Schema.Types.Mixed, default: undefined }, // string or number from old data
    language: { type: String, default: undefined },

    // Operational
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// ---- Virtuals / serialization ----
userSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

userSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    // keep name/fullName compatibility
    if (ret.fullName && !ret.name) ret.name = ret.fullName;
    if (ret.name && !ret.fullName) ret.fullName = ret.name;

    // Ensure preferences always present, with flat fallback for old docs
    ret.preferences = ret.preferences || {};
    if (ret.currency      && !ret.preferences.currency)     ret.preferences.currency = ret.currency;
    if (ret.theme         && !ret.preferences.theme)        ret.preferences.theme = ret.theme;
    if (ret.weekStartsOn  && !ret.preferences.weekStartsOn) ret.preferences.weekStartsOn = ret.weekStartsOn;
    if (ret.language      && !ret.preferences.language)     ret.preferences.language = ret.language;

    // Convenience flag for UI
    ret.hasPhoto = !!(ret.profilePhoto && ret.profilePhoto.data);

    delete ret.__v;
    delete ret.password;
    return ret;
  },
});

// ---- Hooks & methods ----
userSchema.pre('save', async function (next) {
  // Hash password if changed
  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Sync name <-> fullName for compatibility
  if (this.isModified('fullName') && !this.name) this.name = this.fullName;
  if (this.isModified('name') && !this.fullName) this.fullName = this.name;

  // Keep flat prefs and nested prefs in sync (helps any old code still writing flat fields)
  if (this.isModified('preferences') && this.preferences) {
    this.currency     = this.preferences.currency     ?? this.currency;
    this.theme        = this.preferences.theme        ?? this.theme;
    this.weekStartsOn = this.preferences.weekStartsOn ?? this.weekStartsOn;
    this.language     = this.preferences.language     ?? this.language;
  } else {
    const p = this.preferences || (this.preferences = {});
    if (this.isModified('currency'))     p.currency     = this.currency;
    if (this.isModified('theme'))        p.theme        = this.theme;
    if (this.isModified('weekStartsOn')) p.weekStartsOn = this.weekStartsOn;
    if (this.isModified('language'))     p.language     = this.language;
  }

  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.statics.findForLogin = function (email) {
  return this.findOne({ email }).select('+password');
};

userSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
