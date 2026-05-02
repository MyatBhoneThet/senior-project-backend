const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema(
  {
    debtId: { type: mongoose.Schema.Types.ObjectId, ref: 'DebtRecord', required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation' },
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification' },

    type: {
      type: String,
      enum: ['manual', 'scheduled', 'overdue'],
      default: 'manual',
      index: true,
    },
    message: { type: String, trim: true, default: '' },
    reminderIndex: { type: Number, default: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reminder', ReminderSchema);
