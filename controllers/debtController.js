const {
  httpError,
  createDebtWithDirection,
  listDebtsForUser,
  getDebtByIdForUser,
  updateDebtRecord,
  markDebtRepaid,
  addRepayment,
  createOrOpenConversation,
  sendChatMessage,
  listMessages,
  sendReminder,
  listUnreadCounts,
  markConversationRead,
} = require('../services/debtService');
const { toNumber, sanitizeText } = require('../utils/text');

function refId(value) {
  return String(value?._id || value || '');
}

function sendError(res, error) {
  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    message: error.message || 'Something went wrong',
  });
}

function parsePayload(body = {}) {
  return {
    counterpartyId: body.counterpartyId || body.otherUserId,
    amount: body.amount,
    currency: body.currency,
    description: body.description,
    dueDate: body.dueDate,
  };
}

exports.createLend = async (req, res) => {
  try {
    const debt = await createDebtWithDirection(parsePayload(req.body), req.user.id, 'lend');
    return res.status(201).json({ success: true, data: debt, message: 'Lend record created' });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.createBorrow = async (req, res) => {
  try {
    const debt = await createDebtWithDirection(parsePayload(req.body), req.user.id, 'borrow');
    return res.status(201).json({ success: true, data: debt, message: 'Borrow record created' });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getAll = async (req, res) => {
  try {
    const debts = await listDebtsForUser(req.user.id, req.query);
    return res.json({ success: true, data: debts });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getOne = async (req, res) => {
  try {
    const debt = await getDebtByIdForUser(req.params.id, req.user.id);
    return res.json({ success: true, data: debt });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.updateOne = async (req, res) => {
  try {
    const debt = await getDebtByIdForUser(req.params.id, req.user.id);
    const updated = await updateDebtRecord(debt, req.body, req.user.id);
    return res.json({ success: true, data: updated, message: 'Debt record updated' });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.markRepaid = async (req, res) => {
  try {
    const debt = await getDebtByIdForUser(req.params.id, req.user.id);
    const result = await markDebtRepaid(debt, req.user.id, req.body?.note);
    return res.json({ success: true, data: result, message: 'Debt marked as repaid' });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.addPartialRepayment = async (req, res) => {
  try {
    const debt = await getDebtByIdForUser(req.params.id, req.user.id);
    const amount = toNumber(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'Amount is required');

    const lenderId = refId(debt.lenderId);
    const borrowerId = refId(debt.borrowerId);
    if (lenderId !== String(req.user.id)) {
      throw httpError(403, 'Only the lender can add repayments');
    }
    // Repayments are logged by lender as money received from borrower.
    const payerId = borrowerId;
    const recipientId = lenderId;
    const result = await addRepayment(debt, {
      payerId,
      recipientId,
      createdBy: req.user.id,
      amount,
      note: req.body?.note,
      method: req.body?.method || 'manual',
    });

    return res.status(201).json({ success: true, data: result, message: 'Partial repayment added' });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.sendReminder = async (req, res) => {
  try {
    const debt = await getDebtByIdForUser(req.params.id, req.user.id);
    const result = await sendReminder(debt, req.user.id, {
      message: req.body?.message,
      type: req.body?.type,
    });
    return res.status(201).json({ success: true, data: result, message: 'Reminder sent' });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.openChat = async (req, res) => {
  try {
    const debt = await getDebtByIdForUser(req.params.id, req.user.id);
    const conversation = await createOrOpenConversation(debt, req.user.id);
    return res.json({ success: true, data: conversation });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const debt = await getDebtByIdForUser(req.params.id, req.user.id);
    const message = sanitizeText(req.body?.message);
    if (!message) throw httpError(400, 'Message is required');
    const result = await sendChatMessage(debt, req.user.id, message);
    return res.status(201).json({ success: true, data: result, message: 'Message sent' });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getMessages = async (req, res) => {
  try {
    const debt = await getDebtByIdForUser(req.params.id, req.user.id);
    const conversationId = req.params.conversationId || debt.chatConversationId || (await createOrOpenConversation(debt, req.user.id))._id;
    const result = await listMessages(conversationId, req.user.id);
    await markConversationRead(result.conversation._id, req.user.id);
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getUnreadCounts = async (req, res) => {
  try {
    const counts = await listUnreadCounts(req.user.id);
    return res.json({ success: true, data: counts });
  } catch (error) {
    return sendError(res, error);
  }
};
