const mongoose = require('mongoose');

const ReadReceiptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ChatMessageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation', required: true, index: true },
    debtId: { type: mongoose.Schema.Types.ObjectId, ref: 'DebtRecord', required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    messageType: {
      type: String,
      enum: ['text', 'reminder', 'repayment_update', 'system'],
      default: 'text',
      index: true,
    },
    content: { type: String, trim: true, default: '' },
    isSystem: { type: Boolean, default: false },
    readBy: { type: [ReadReceiptSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
