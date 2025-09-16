const mongoose = require('mongoose');

const RecurringRuleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, default: '' },
  source: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0.01 },
  dayOfMonth: { type: Number, min: 1, max: 31 },   // optional; defaults to startDate day
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  isActive: { type: Boolean, default: true },
  notes: { type: String, default: '' },
  lastRunAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('RecurringRule', RecurringRuleSchema);
