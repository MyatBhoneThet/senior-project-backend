const mongoose = require('mongoose');

const JarTransferSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },

  fromJarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jar', default: null }, // null = free cash
  toJarId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Jar', default: null }, // null = free cash
  amount:    { type: Number, required: true },

  memo: { type: String, default: '' },
  relatedGoalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null },
}, { timestamps: true });

JarTransferSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('JarTransfer', JarTransferSchema);
