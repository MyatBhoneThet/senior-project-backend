const mongoose = require('mongoose');

const ChatConversationSchema = new mongoose.Schema(
  {
    debtId: { type: mongoose.Schema.Types.ObjectId, ref: 'DebtRecord', required: true, unique: true, index: true },
    participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, trim: true, default: '' },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatConversation', ChatConversationSchema);
