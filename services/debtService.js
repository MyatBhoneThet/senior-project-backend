const DebtRecord = require('../models/DebtRecord');
const Repayment = require('../models/Repayment');
const Reminder = require('../models/Reminder');
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sanitizeText, toNumber } = require('../utils/text');
const { emitToUser, emitToDebt, emitToConversation } = require('./realtime');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeCurrency(currency) {
  return String(currency || 'THB').trim().toUpperCase();
}

function refId(value) {
  return String(value?._id || value || '');
}

function getDebtStatus(debt) {
  if (debt.status === 'cancelled') return 'cancelled';
  if (debt.remainingAmount <= 0) return 'paid';
  if (debt.dueDate && new Date(debt.dueDate).getTime() < Date.now()) return 'overdue';
  if (debt.remainingAmount < debt.amount) return 'partially_paid';
  return 'pending';
}

function buildDebtTotals(debt) {
  return {
    amount: Number(debt.amount || 0),
    remainingAmount: Number(debt.remainingAmount || 0),
    paidAmount: Math.max(Number(debt.amount || 0) - Number(debt.remainingAmount || 0), 0),
  };
}

async function assertDebtParticipant(debtId, userId) {
  const debt = await DebtRecord.findOne({
    _id: debtId,
    $or: [{ lenderId: userId }, { borrowerId: userId }],
  });
  if (!debt) throw httpError(404, 'Debt record not found');
  return debt;
}

async function resolveCounterparty(counterpartyId) {
  const raw = String(counterpartyId || '').trim();
  if (!raw) throw httpError(400, 'Please provide a counterparty id, email, or username');

  let user = null;
  if (/^[a-f\d]{24}$/i.test(raw)) {
    user = await User.findById(raw).select('_id fullName email username');
  }

  if (!user) {
    user = await User.findOne({
      $or: [
        { email: raw.toLowerCase() },
        { username: raw },
      ],
    }).select('_id fullName email username');
  }

  if (!user) throw httpError(404, 'Counterparty user not found');
  return user;
}

async function createDebtRecord({ creatorId, role, counterpartyId, amount, currency, description, dueDate }) {
  const counterparty = await resolveCounterparty(counterpartyId);

  if (String(counterparty._id) === String(creatorId)) {
    throw httpError(400, 'You cannot create a debt record with yourself');
  }

  const numericAmount = toNumber(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw httpError(400, 'Amount must be greater than zero');

  const normalizedCurrency = normalizeCurrency(currency);
  const normalizedDueDate = dueDate ? new Date(dueDate) : null;
  if (normalizedDueDate && Number.isNaN(normalizedDueDate.getTime())) throw httpError(400, 'Invalid due date');

  const lenderId = role === 'lend' ? creatorId : counterparty._id;
  const borrowerId = role === 'borrow' ? creatorId : counterparty._id;

  if (String(lenderId) === String(borrowerId)) throw httpError(400, 'Lender and borrower must be different users');

  const debt = await DebtRecord.create({
    lenderId,
    borrowerId,
    createdBy: creatorId,
    amount: numericAmount,
    remainingAmount: numericAmount,
    currency: normalizedCurrency,
    description: sanitizeText(description),
    dueDate: normalizedDueDate || undefined,
    status: normalizedDueDate && normalizedDueDate.getTime() < Date.now() ? 'overdue' : 'pending',
    partialPayment: false,
    reminderCount: 0,
    repaymentHistory: [],
  });

  return debt;
}

async function populateDebt(debt) {
  if (!debt) return debt;
  await debt.populate('lenderId', 'fullName email profilePhoto');
  await debt.populate('borrowerId', 'fullName email profilePhoto');
  await debt.populate('createdBy', 'fullName email');
  await debt.populate('chatConversationId');
  return debt;
}

async function listDebtsForUser(userId, query = {}) {
  const filters = {
    $or: [{ lenderId: userId }, { borrowerId: userId }],
  };

  if (query.status) filters.status = query.status;
  if (query.role === 'lender') filters.lenderId = userId;
  if (query.role === 'borrower') filters.borrowerId = userId;

  const debts = await DebtRecord.find(filters).sort({ updatedAt: -1 });
  return Promise.all(debts.map((debt) => populateDebt(debt)));
}

async function getDebtByIdForUser(debtId, userId) {
  const debt = await assertDebtParticipant(debtId, userId);
  return populateDebt(debt);
}

async function updateDebtRecord(debt, payload, userId) {
  if (debt.status === 'cancelled') throw httpError(400, 'Cancelled debt records cannot be updated');

  if (payload.description !== undefined) debt.description = sanitizeText(payload.description);
  if (payload.dueDate !== undefined) {
    const nextDueDate = payload.dueDate ? new Date(payload.dueDate) : null;
    if (nextDueDate && Number.isNaN(nextDueDate.getTime())) throw httpError(400, 'Invalid due date');
    debt.dueDate = nextDueDate || undefined;
  }
  if (payload.currency !== undefined) debt.currency = normalizeCurrency(payload.currency);
  if (payload.status && ['pending', 'partially_paid', 'paid', 'overdue', 'cancelled'].includes(payload.status)) {
    debt.status = payload.status;
    if (payload.status === 'cancelled') debt.cancelledAt = new Date();
  }
  if (payload.cancel === true) {
    debt.status = 'cancelled';
    debt.cancelledAt = new Date();
  }

  debt.status = getDebtStatus(debt);
  await debt.save();
  return populateDebt(debt);
}

async function markDebtRepaid(debt, userId, note) {
  if (debt.status === 'cancelled') throw httpError(400, 'Cancelled debt records cannot be marked as repaid');
  if (refId(debt.lenderId) !== String(userId)) {
    throw httpError(403, 'Only the lender can mark this debt as repaid');
  }

  const remaining = Number(debt.remainingAmount || 0);
  if (remaining <= 0) throw httpError(400, 'Debt is already fully repaid');

  const lenderId = refId(debt.lenderId);
  const borrowerId = refId(debt.borrowerId);
  const payerId = borrowerId;
  const recipientId = lenderId;
  return addRepayment(debt, {
    payerId,
    recipientId,
    createdBy: userId,
    amount: remaining,
    note,
    method: 'mark-repaid',
  });
}

async function addRepayment(debt, { payerId, recipientId, createdBy, amount, note, method = 'manual' }) {
  if (debt.status === 'cancelled') throw httpError(400, 'Cancelled debt records cannot receive repayments');

  const numericAmount = toNumber(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw httpError(400, 'Repayment amount must be greater than zero');

  const remainingBefore = Number(debt.remainingAmount || 0);
  if (numericAmount > remainingBefore) throw httpError(400, 'Repayment exceeds the remaining balance');

  const repayment = await Repayment.create({
    debtId: debt._id,
    payerId,
    recipientId,
    createdBy,
    amount: numericAmount,
    currency: debt.currency,
    note: sanitizeText(note),
    method: sanitizeText(method) || 'manual',
    isPartial: numericAmount < remainingBefore,
    status: 'confirmed',
  });

  debt.remainingAmount = Math.max(remainingBefore - numericAmount, 0);
  debt.partialPayment = debt.remainingAmount > 0;
  debt.status = getDebtStatus(debt);
  if (debt.status === 'paid') debt.repaidAt = new Date();
  debt.repaymentHistory.unshift({
    repaymentId: repayment._id,
    amount: numericAmount,
    currency: debt.currency,
    note: sanitizeText(note),
    paidBy: payerId,
    createdBy,
    paidAt: repayment.paidAt,
  });

  await debt.save();

  const conversation = await createOrOpenConversation(debt, createdBy);
  const lenderId = refId(debt.lenderId);
  const borrowerId = refId(debt.borrowerId);
  const otherUserId = String(createdBy) === lenderId ? borrowerId : lenderId;
  const message = await ChatMessage.create({
    conversationId: conversation._id,
    debtId: debt._id,
    senderId: createdBy,
    receiverId: otherUserId,
    messageType: 'repayment_update',
    content: `Repayment recorded: ${debt.currency} ${numericAmount.toLocaleString()}${debt.remainingAmount > 0 ? `, remaining ${debt.currency} ${debt.remainingAmount.toLocaleString()}` : ', debt fully repaid'}.`,
    isSystem: true,
    readBy: [{ userId: createdBy, readAt: new Date() }],
  });

  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessagePreview = message.content;
  conversation.unreadCounts = bumpUnreadCount(conversation, otherUserId);
  await conversation.save();

  const title = debt.status === 'paid' ? 'Payment marked as completed' : 'Repayment update';
  const notification = await Notification.create({
    recipientId: otherUserId,
    actorId: createdBy,
    debtId: debt._id,
    conversationId: conversation._id,
    type: 'repayment_update',
    title,
    message: message.content,
    data: { repaymentId: repayment._id, amount: numericAmount, status: debt.status },
  });

  emitToUser(otherUserId, 'notification:new', notification);
  emitToUser(otherUserId, 'debt:update', { debtId: debt._id, status: debt.status, remainingAmount: debt.remainingAmount });
  emitToDebt(debt._id, 'debt:updated', { debtId: debt._id, status: debt.status, remainingAmount: debt.remainingAmount });
  emitToConversation(conversation._id, 'chat:message', message);

  return { debt: await populateDebt(debt), repayment, message, notification };
}

async function createOrOpenConversation(debt, userId) {
  let conversation = await ChatConversation.findOne({ debtId: debt._id });
  if (!conversation) {
    conversation = await ChatConversation.create({
      debtId: debt._id,
      participantIds: [refId(debt.lenderId), refId(debt.borrowerId)],
      createdBy: userId,
      unreadCounts: new Map(),
    });
    debt.chatConversationId = conversation._id;
    await debt.save();
  }
  return conversation;
}

async function openChatForDebt(debt, userId) {
  if (refId(debt.lenderId) !== String(userId) && refId(debt.borrowerId) !== String(userId)) {
    throw httpError(403, 'You do not have access to this conversation');
  }
  const conversation = await createOrOpenConversation(debt, userId);
  return conversation;
}

function bumpUnreadCount(conversation, userId) {
  const key = String(userId);
  const current = conversation.unreadCounts?.get?.(key) || conversation.unreadCounts?.[key] || 0;
  if (typeof conversation.unreadCounts?.set === 'function') {
    conversation.unreadCounts.set(key, Number(current) + 1);
    return conversation.unreadCounts;
  }
  return {
    ...(conversation.unreadCounts || {}),
    [key]: Number(current) + 1,
  };
}

function serializeUnreadCounts(unreadCounts) {
  if (!unreadCounts) return {};
  if (typeof unreadCounts.toJSON === 'function') return unreadCounts.toJSON();
  if (typeof unreadCounts.entries === 'function') return Object.fromEntries(unreadCounts.entries());
  return unreadCounts;
}

async function sendChatMessage(debt, userId, content) {
  if (debt.status === 'cancelled') throw httpError(400, 'Cancelled debt records do not have active chat');
  const conversation = await createOrOpenConversation(debt, userId);
  const lenderId = refId(debt.lenderId);
  const borrowerId = refId(debt.borrowerId);
  const otherUserId = lenderId === String(userId) ? borrowerId : lenderId;
  const message = await ChatMessage.create({
    conversationId: conversation._id,
    debtId: debt._id,
    senderId: userId,
    receiverId: otherUserId,
    messageType: 'text',
    content: sanitizeText(content),
    isSystem: false,
    readBy: [{ userId, readAt: new Date() }],
  });

  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessagePreview = message.content;
  conversation.unreadCounts = bumpUnreadCount(conversation, otherUserId);
  await conversation.save();

  const notification = await Notification.create({
    recipientId: otherUserId,
    actorId: userId,
    debtId: debt._id,
    conversationId: conversation._id,
    type: 'chat_message',
    title: 'New chat message',
    message: sanitizeText(content),
    data: { messageId: message._id },
  });

  emitToConversation(conversation._id, 'chat:message', message);
  emitToUser(otherUserId, 'chat:message', message);
  emitToUser(otherUserId, 'notification:new', notification);
  emitToUser(otherUserId, 'conversation:update', {
    conversationId: conversation._id,
    unreadCounts: serializeUnreadCounts(conversation.unreadCounts),
  });

  return { conversation, message, notification };
}

async function getConversationMessages(debt, userId) {
  const conversation = await createOrOpenConversation(debt, userId);
  const messages = await ChatMessage.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
  return { conversation, messages };
}

async function markConversationRead(conversationId, userId) {
  const messages = await ChatMessage.find({ conversationId, receiverId: userId });
  for (const message of messages) {
    const alreadyRead = (message.readBy || []).some((item) => String(item.userId) === String(userId));
    if (!alreadyRead) {
      message.readBy.push({ userId, readAt: new Date() });
      await message.save();
    }
  }
  await ChatConversation.updateOne(
    { _id: conversationId },
    { $set: { [`unreadCounts.${String(userId)}`]: 0 } }
  );
}

async function sendReminder(debt, senderId, payload = {}) {
  if (!['pending', 'partially_paid', 'overdue'].includes(debt.status)) {
    throw httpError(400, 'Only active debt records can receive reminders');
  }

  if (refId(debt.lenderId) !== String(senderId)) {
    throw httpError(403, 'Only the lender can send repayment reminders');
  }

  const recipientId = refId(debt.borrowerId);
  if (!recipientId) throw httpError(403, 'Only related users can send reminders');

  const reminderText = sanitizeText(payload.message) || `You owe ${debt.currency} ${Number(debt.remainingAmount || debt.amount).toLocaleString()}${debt.dueDate ? `, due ${new Date(debt.dueDate).toLocaleDateString()}` : ''}.`;

  const reminder = await Reminder.create({
    debtId: debt._id,
    senderId,
    recipientId,
    type: payload.type || 'manual',
    message: reminderText,
    reminderIndex: Number(debt.reminderCount || 0) + 1,
  });

  debt.reminderCount = Number(debt.reminderCount || 0) + 1;
  debt.lastReminderAt = new Date();
  await debt.save();

  const conversation = await createOrOpenConversation(debt, senderId);
  const chatMessage = await ChatMessage.create({
    conversationId: conversation._id,
    debtId: debt._id,
    senderId,
    receiverId: recipientId,
    messageType: 'reminder',
    content: reminderText,
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
    type: 'reminder',
    title: 'Repayment reminder',
    message: reminderText,
    data: { reminderId: reminder._id, reminderIndex: reminder.reminderIndex },
  });

  reminder.notificationId = notification._id;
  await reminder.save();

  emitToUser(recipientId, 'notification:new', notification);
  emitToDebt(debt._id, 'debt:reminder', { debtId: debt._id, reminderCount: debt.reminderCount });
  emitToConversation(conversation._id, 'chat:message', chatMessage);

  return { reminder, notification, chatMessage };
}

async function createDebtNotification({ recipientId, actorId, debtId, conversationId, type, title, message, data }) {
  const notification = await Notification.create({
    recipientId,
    actorId,
    debtId,
    conversationId,
    type,
    title,
    message,
    data: data || {},
  });
  emitToUser(recipientId, 'notification:new', notification);
  return notification;
}

async function listMessages(conversationId, userId) {
  const conversation = await ChatConversation.findById(conversationId);
  if (!conversation) throw httpError(404, 'Conversation not found');
  if (!conversation.participantIds.some((id) => String(id) === String(userId))) throw httpError(403, 'You do not have access to this conversation');
  const messages = await ChatMessage.find({ conversationId }).sort({ createdAt: 1 });
  return { conversation, messages };
}

async function listNotifications(userId, query = {}) {
  const filters = { recipientId: userId };
  if (query.isRead !== undefined) filters.isRead = query.isRead === 'true' || query.isRead === true;
  if (query.type) filters.type = query.type;

  const notifications = await Notification.find(filters).sort({ createdAt: -1 }).limit(Number(query.limit || 100));
  const unreadCount = await Notification.countDocuments({ recipientId: userId, isRead: false });
  return { notifications, unreadCount };
}

async function markNotificationAsRead(notificationId, userId) {
  const notification = await Notification.findOne({ _id: notificationId, recipientId: userId });
  if (!notification) throw httpError(404, 'Notification not found');
  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();
  return notification;
}

async function markAllNotificationsAsRead(userId) {
  await Notification.updateMany({ recipientId: userId, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
}

async function listUnreadCounts(userId) {
  const unreadNotifications = await Notification.countDocuments({ recipientId: userId, isRead: false });
  const conversations = await ChatConversation.find({ participantIds: userId });
  const unreadMessages = conversations.reduce((sum, conversation) => {
    const count = conversation.unreadCounts?.get?.(String(userId)) || conversation.unreadCounts?.[String(userId)] || 0;
    return sum + Number(count || 0);
  }, 0);
  return { unreadNotifications, unreadMessages };
}

async function createDebtWithDirection(payload, creatorId, role) {
  return createDebtRecord({ creatorId, role, ...payload });
}

async function maybeUpdateOverdueStatus(debt) {
  if (debt.status === 'cancelled' || debt.remainingAmount <= 0) return debt;
  if (debt.dueDate && new Date(debt.dueDate).getTime() < Date.now()) {
    debt.status = 'overdue';
    debt.overdueAt = debt.overdueAt || new Date();
    await debt.save();
  }
  return debt;
}

module.exports = {
  httpError,
  getDebtStatus,
  buildDebtTotals,
  assertDebtParticipant,
  createDebtRecord,
  createDebtWithDirection,
  listDebtsForUser,
  getDebtByIdForUser,
  updateDebtRecord,
  markDebtRepaid,
  addRepayment,
  createOrOpenConversation,
  openChatForDebt,
  sendChatMessage,
  getConversationMessages,
  listMessages,
  sendReminder,
  createDebtNotification,
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  listUnreadCounts,
  maybeUpdateOverdueStatus,
  markConversationRead,
};
