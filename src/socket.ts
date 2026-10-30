import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import logger from './utils/logger';
import { isOriginAllowed } from './utils/cors';
import { protect } from './middleware/auth.middleware';
import type { Request, Response } from 'express';
import type { INotification } from './models/Notification';

let io: SocketServer;

export const initSocket = (server: HttpServer) => {
  io = new SocketServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Public activity remains available anonymously. Only a verified session can
  // join a personal notification room; clients cannot choose a room or user ID.
  io.use(async (socket, next) => {
    const rawCookie = socket.handshake.headers.cookie?.match(/(?:^|;\s*)jwt=([^;]*)/)?.[1];
    let token: string | undefined;
    try { if (rawCookie) token = decodeURIComponent(rawCookie); } catch { /* Anonymous connection. */ }
    const request = socket.request as Request;
    request.cookies = { jwt: token };
    await protect(request, {} as Response, error => {
      if (!error && request.user) socket.data.userId = request.user._id;
      next();
    });
  });

  io.on('connection', (socket) => {
    if (socket.data.userId) void socket.join(`user:${socket.data.userId}`);
    logger.debug(`Socket.IO client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      logger.debug(`Socket.IO client disconnected: ${socket.id}`);
    });
  });

  logger.info('Socket.IO status: READY — websocket server initialized.');

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

export const emitWriteupsUpdate = () => { if (io) io.emit('writeupsUpdate'); };

export const emitNotificationCreated = (notification: INotification) => {
  if (io) io.to(`user:${notification.userId}`).emit('notificationCreated', notification.toJSON());
};

export const emitNotificationsChanged = (userId: string) => {
  if (io) io.to(`user:${userId}`).emit('notificationsChanged');
};

export const emitLeaderboardUpdate = (data?: any) => {
  if (io) {
    io.emit('leaderboardUpdate', data);
    logger.debug('Broadcasted leaderboardUpdate event');
  }
};
