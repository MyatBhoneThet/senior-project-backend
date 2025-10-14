const mongoose = require('mongoose');

const GoalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  title:  { type: String, required: true },
  targetAmount:   { type: Number, required: true },
  currentAmount:  { type: Number, default: 0 }, // cached for fast UI
  targetDate:     { type: Date, required: true },
  jarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jar', required: true },

  autoAllocate: {                           // optional auto allocation on income
    type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    value: { type: Number, default: 10 },   // 10% or 1000 THB
    enabled: { type: Boolean, default: false }
  },

  status: { type: String, enum: ['active', 'paused', 'achieved', 'expired'], default: 'active' },
  tags:   [{ type: String }],
}, { timestamps: true });

GoalSchema.index({ userId: 1, title: 1 }, { unique: true });

module.exports = mongoose.model('Goal', GoalSchema);
