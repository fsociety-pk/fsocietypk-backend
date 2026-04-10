import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import logger from './utils/logger';
import { env } from './config/env';

let io: SocketServer;

export const initSocket = (server: HttpServer) => {
  io = new SocketServer(server, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.info(`🔌 User connected: ${socket.id}`);

    socket.on('disconnect', () => {
      logger.info(`🔌 User disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

export const emitLeaderboardUpdate = (data?: any) => {
  if (io) {
    io.emit('leaderboardUpdate', data);
    logger.debug('📢 Broadcasted leaderboardUpdate event');
  }
};
