const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:     { type: String, enum: ['expense','income'], required: true },
  name:     { type: String, required: true, trim: true },
  icon:     { type: String, default: '' },
  color:    { type: String, default: '#8b5cf6' },
  keywords: { type: [String], default: [] },
}, { timestamps: true });

CategorySchema.index({ userId: 1, type: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Category', CategorySchema);
