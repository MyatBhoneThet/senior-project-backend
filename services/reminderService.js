const DebtRecord = require('../models/DebtRecord');
const Notification = require('../models/Notification');
const Reminder = require('../models/Reminder');
const ChatMessage = require('../models/ChatMessage');
const { createOrOpenConversation, maybeUpdateOverdueStatus } = require('./debtService');
const { emitToUser, emitToDebt, emitToConversation } = require('./realtime');

const DUE_SOON_WINDOW_HOURS = Number(process.env.DEBT_DUE_SOON_HOURS || 24);
const NOTIFICATION_COOLDOWN_HOURS = Number(process.env.DEBT_REMINDER_COOLDOWN_HOURS || 20);

function hoursAgo(date, hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function refId(value) {
  return String(value?._id || value || '');
}

async function sendSystemReminder({ debt, type, recipientId, senderId, title, message }) {
  const conversation = await createOrOpenConversation(debt, senderId);
  const chatMessage = await ChatMessage.create({
    conversationId: conversation._id,
    debtId: debt._id,
    senderId,
    receiverId: recipientId,
    messageType: type === 'overdue' ? 'system' : 'reminder',
    content: message,
    isSystem: true,
    readBy: [{ userId: senderId, readAt: new Date() }],
  });

  conversation.lastMessageAt = chatMessage.createdAt;
  conversation.lastMessagePreview = chatMessage.content;
  await conversation.save();

  const notification = await Notification.create({
    recipientId,
    actorId: senderId,
    debtId: debt._id,
    conversationId: conversation._id,
    type,
    title,
    message,
    data: { source: 'scheduler' },
  });

  await Reminder.create({
    debtId: debt._id,
    senderId,
    recipientId,
    conversationId: conversation._id,
    notificationId: notification._id,
    type,
    message,
    reminderIndex: Number(debt.reminderCount || 0) + 1,
  });

  emitToUser(recipientId, 'notification:new', notification);
  emitToDebt(debt._id, 'debt:reminder', { debtId: debt._id, type });
  emitToConversation(conversation._id, 'chat:message', chatMessage);
}

async function runDebtReminderSweep() {
  const now = new Date();
  const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_HOURS * 60 * 60 * 1000);
  const cooldownCutoff = hoursAgo(now, NOTIFICATION_COOLDOWN_HOURS);

  const debts = await DebtRecord.find({
    status: { $in: ['pending', 'partially_paid', 'overdue'] },
    remainingAmount: { $gt: 0 },
  });

  for (const debt of debts) {
    await maybeUpdateOverdueStatus(debt);

    const recipientId = refId(debt.borrowerId);
    const senderId = refId(debt.lenderId);

    if (debt.dueDate && debt.dueDate <= dueSoonCutoff && debt.dueDate > now) {
      if (!debt.lastDueSoonNotificationAt || new Date(debt.lastDueSoonNotificationAt) < cooldownCutoff) {
        const dueDateLabel = new Date(debt.dueDate).toLocaleDateString();
        const message = `You owe ${debt.currency} ${Number(debt.remainingAmount).toLocaleString()}, due ${dueDateLabel}.`;
        await sendSystemReminder({
          debt,
          type: 'due_soon',
          recipientId,
          senderId,
          title: 'Payment due soon',
          message,
        });
        debt.lastDueSoonNotificationAt = now;
        debt.reminderCount = Number(debt.reminderCount || 0) + 1;
        await debt.save();
      }
    }

    if (debt.status === 'overdue') {
      if (!debt.lastReminderAt || new Date(debt.lastReminderAt) < cooldownCutoff) {
        const message = `Your payment of ${debt.currency} ${Number(debt.remainingAmount).toLocaleString()} is overdue.`;
        await sendSystemReminder({
          debt,
          type: 'overdue',
          recipientId,
          senderId,
          title: 'Payment overdue',
          message,
        });
        debt.lastReminderAt = now;
        debt.reminderCount = Number(debt.reminderCount || 0) + 1;
        await debt.save();
      }
    }
  }
}

function startDebtReminderCron() {
  const cron = require('node-cron');
  cron.schedule('0 * * * *', async () => {
    try {
      await runDebtReminderSweep();
      console.log('[debt-reminders] sweep complete');
    } catch (error) {
      console.error('[debt-reminders] sweep failed:', error?.message || error);
    }
  });
}

module.exports = {
  runDebtReminderSweep,
  startDebtReminderCron,
};
