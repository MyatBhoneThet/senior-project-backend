const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    debtId: { type: mongoose.Schema.Types.ObjectId, ref: 'DebtRecord', index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation' },

    type: {
      type: String,
      enum: ['reminder', 'repayment_update', 'chat_message', 'due_soon', 'overdue'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    data: { type: Object, default: {} },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
