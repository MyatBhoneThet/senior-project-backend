const {
  httpError,
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createDebtNotification,
} = require('../services/debtService');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Something went wrong',
  });
}

exports.list = async (req, res) => {
  try {
    const result = await listNotifications(req.user.id, req.query);
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.create = async (req, res) => {
  try {
    const { recipientId, actorId, debtId, conversationId, type, title, message, data } = req.body || {};
    if (!recipientId || !type || !title || !message) throw httpError(400, 'Missing required notification fields');
    const notification = await createDebtNotification({ recipientId, actorId: actorId || req.user.id, debtId, conversationId, type, title, message, data });
    return res.status(201).json({ success: true, data: notification });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.markRead = async (req, res) => {
  try {
    const notification = await markNotificationAsRead(req.params.id, req.user.id);
    return res.json({ success: true, data: notification });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await markAllNotificationsAsRead(req.user.id);
    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    return sendError(res, error);
  }
};
