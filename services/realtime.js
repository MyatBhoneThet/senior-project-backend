const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('../models/User');

let ioInstance = null;

function getAllowedOrigins() {
  return [
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_URL,
    'http://localhost:5173',
  ].filter(Boolean);
}

function initRealtime(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  ioInstance.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) return next(new Error('Unauthorized'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded?.id || decoded?._id).select('_id fullName email');
      if (!user) return next(new Error('Unauthorized'));

      socket.user = {
        id: String(user._id),
        fullName: user.fullName,
        email: user.email,
      };
      next();
    } catch (error) {
      next(new Error('Unauthorized'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const userRoom = `user:${socket.user.id}`;
    socket.join(userRoom);

    socket.on('debt:join', (debtId) => {
      if (debtId) socket.join(`debt:${debtId}`);
    });

    socket.on('debt:leave', (debtId) => {
      if (debtId) socket.leave(`debt:${debtId}`);
    });

    socket.on('conversation:join', (conversationId) => {
      if (conversationId) socket.join(`conversation:${conversationId}`);
    });

    socket.on('conversation:leave', (conversationId) => {
      if (conversationId) socket.leave(`conversation:${conversationId}`);
    });
  });

  return ioInstance;
}

function getRealtime() {
  return ioInstance;
}

function emitToUser(userId, event, payload) {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
}

function emitToDebt(debtId, event, payload) {
  ioInstance?.to(`debt:${debtId}`).emit(event, payload);
}

function emitToConversation(conversationId, event, payload) {
  ioInstance?.to(`conversation:${conversationId}`).emit(event, payload);
}

module.exports = {
  initRealtime,
  getRealtime,
  emitToUser,
  emitToDebt,
  emitToConversation,
};
