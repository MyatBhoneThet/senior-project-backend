const mongoose = require('mongoose');

const RecurringRuleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // What to create monthly
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true },
  source: { type: String },

  // Amount
  amount: { type: Number, required: true, min: 0 },

  // Schedule
  frequency: { type: String, enum: ['monthly'], default: 'monthly' },
  dayOfMonth: { type: Number, default: 1 }, // 1..31; we clamp by month length
  startDate: { type: Date, required: true },
  endDate: { type: Date }, // optional

  // State
  isActive: { type: Boolean, default: true },
  lastRunAt: { type: Date },

  // Display
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('RecurringRule', RecurringRuleSchema);
