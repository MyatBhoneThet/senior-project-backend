const mongoose = require('mongoose');

const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: function () { return !this.googleId; } },
    googleId: { type: String, index: true },
    profileImageUrl: { type: String },
    currency:     { type: String, default: 'THB' },
    theme:        { type: String, default: 'light' }, 
    weekStartsOn: { type: String, default: 'Mon' },
    language:     { type: String, default: 'en' },

},
{ timestamps: true }
);

UserSchema.pre('save', async function (next) {
  // hash only when password present & modified
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (candidatePassword) {
  if (!this.password) return false; // google users
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);