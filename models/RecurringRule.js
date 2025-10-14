// backend/models/RecurringRule.js
const mongoose = require('mongoose');

const RecurringRuleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // What to generate
    type: { type: String, enum: ['expense', 'income'], required: true },
    category: { type: String, required: true },
    source: { type: String, default: '' },
    amount: { type: Number, required: true },

    // NEW: support weekly / yearly (monthly kept as default for legacy docs)
    repeat: {
      type: String,
      enum: ['weekly', 'monthly', 'yearly'],
      default: 'monthly',
    },

    // For monthly schedules; if omitted we’ll use startDate’s day
    dayOfMonth: { type: Number, min: 1, max: 31 },

    // Range
    startDate: { type: Date, required: true }, // treated in your local timezone
    endDate: { type: Date },

    // Ops/meta
    isActive: { type: Boolean, default: true },
    notes: { type: String, default: '' },

    // Engine bookkeeping (idempotent generation)
    lastRunAt: { type: Date },        // last time engine evaluated this rule
    lastGeneratedAt: { type: Date },  // last occurrence date generated
    tzOffsetMinutes: { type: Number, default: 420 }, // Bangkok +07:00 by default
  },
  { timestamps: true }
);

module.exports = mongoose.model('RecurringRule', RecurringRuleSchema);
