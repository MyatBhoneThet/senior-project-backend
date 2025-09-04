const mongoose = require('mongoose');
const RecurringRuleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // What gets created monthly
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true },
  source: { type: String },

  // Amount settings
  amount: { type: Number, required: true, min: 0 }, // fixed monthly amount

  // Schedule settings
  frequency: { type: String, enum: ['monthly'], default: 'monthly' },
  dayOfMonth: { type: Number, default: 1 }, // 1..31, will smart-clamp to month length
  startDate: { type: Date, required: true },
  endDate: { type: Date }, // optional for indefinite rules
  timezone: { type: String, default: 'Asia/Bangkok' },

  // State
  isActive: { type: Boolean, default: true },
  lastRunAt: { type: Date }, // for diagnostics

  // Display
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('RecurringRule', RecurringRuleSchema);