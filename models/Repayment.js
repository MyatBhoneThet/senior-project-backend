const mongoose = require('mongoose');

const RepaymentSchema = new mongoose.Schema(
  {
    debtId: { type: mongoose.Schema.Types.ObjectId, ref: 'DebtRecord', required: true, index: true },
    payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, trim: true, uppercase: true, default: 'THB' },
    note: { type: String, trim: true, default: '' },
    method: { type: String, trim: true, default: 'manual' },
    isPartial: { type: Boolean, default: false },
    status: { type: String, enum: ['confirmed', 'pending', 'rejected'], default: 'confirmed' },
    paidAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Repayment', RepaymentSchema);
