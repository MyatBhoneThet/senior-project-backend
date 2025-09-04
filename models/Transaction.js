const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true }, // e.g. "Rent", "Salary", "Loan Payment"
  source: { type: String }, // optional: employer, bank, landlord
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
  notes: { type: String },

  // Recurrence linkage
  isRecurring: { type: Boolean, default: false },
  recurringRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringRule' },
  periodKey: { type: String, index: true }, // e.g. '2025-08' for idempotency per rule+month

  icon: { type: String },
}, { timestamps: true });

// Unique safeguard: a recurring rule should not create duplicate entries for the same month
TransactionSchema.index({ userId: 1, recurringRuleId: 1, periodKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Transaction', TransactionSchema);