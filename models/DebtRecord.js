const mongoose = require('mongoose');

const RepaymentHistorySchema = new mongoose.Schema(
  {
    repaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repayment' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: '' },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paidAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DebtRecordSchema = new mongoose.Schema(
  {
    lenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    borrowerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    amount: { type: Number, required: true, min: 0.01 },
    remainingAmount: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, required: true, trim: true, uppercase: true, default: 'THB' },
    description: { type: String, trim: true, default: '' },
    dueDate: { type: Date, index: true },

    status: {
      type: String,
      enum: ['pending', 'partially_paid', 'paid', 'overdue', 'cancelled'],
      default: 'pending',
      index: true,
    },
    partialPayment: { type: Boolean, default: false },
    reminderCount: { type: Number, default: 0 },
    repaymentHistory: { type: [RepaymentHistorySchema], default: [] },

    chatConversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation' },

    lastReminderAt: { type: Date },
    lastOverdueCheckAt: { type: Date },
    lastDueSoonNotificationAt: { type: Date },
    overdueAt: { type: Date },
    repaidAt: { type: Date },
    cancelledAt: { type: Date },

    metadata: {
      source: { type: String, trim: true, default: 'manual' },
      labels: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

DebtRecordSchema.index({ lenderId: 1, borrowerId: 1, status: 1, dueDate: 1 });

DebtRecordSchema.virtual('isOverdue').get(function () {
  return this.status === 'overdue';
});

DebtRecordSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('DebtRecord', DebtRecordSchema);
