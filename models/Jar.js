const mongoose = require('mongoose');

const JarSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  name:   { type: String, required: true },
  color:  { type: String, default: '#6b7280' },
  isPrimary: { type: Boolean, default: false }, // optional default jar
  balance: { type: Number, default: 0 },        // reserved amount (THB)
}, { timestamps: true });

JarSchema.index({ userId: 1, name: 1 }, { unique: true }); // one name per user

module.exports = mongoose.model('Jar', JarSchema);
