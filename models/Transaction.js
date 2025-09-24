const mongoose = require('mongoose');

// ... your existing schema fields ...
const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: String,
  source: String,
  amount: Number,
  date: Date,
  notes: String,

  // === Recurring helpers ===
  isRecurring: { type: Boolean, default: false },
  recurringRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringRule' },
  periodKey: { type: String } // "YYYY-MM"
}, { timestamps: true });

TransactionSchema.index(
  { userId: 1, recurringRuleId: 1, periodKey: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('Transaction', TransactionSchema);
