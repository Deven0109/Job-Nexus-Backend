import { Server } from 'socket.io';
import config from './config/env.js';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        config.clientUrl,
        'https://job-portal.itfuturz.in',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174'
      ],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a room based on userId
    socket.on('join', (userId) => {
      if (userId) {
        const roomId = userId.toString();
        socket.join(roomId);
        console.log(`[Socket] User ${userId} joined room: ${roomId}`);
      }
    });

    // Join a room based on role
    socket.on('join_role', (role) => {
      if (role) {
        socket.join(role);
        console.log(`[Socket] User joined role room: ${role}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    console.warn('Socket.io not initialized!');
  }
  return io;
};

export const emitToUser = (userId, event, data) => {
  const ioInstance = getIO();
  if (ioInstance && userId) {
    const roomId = userId.toString();
    console.log(`[Socket] Emitting ${event} to user room: ${roomId}`);
    ioInstance.to(roomId).emit(event, data);
  } else {
    console.warn(`[Socket] Cannot emit to user: io=${!!ioInstance}, userId=${userId}`);
  }
};

export const emitToRole = (role, event, data) => {
  const ioInstance = getIO();
  if (ioInstance && role) {
    console.log(`[Socket] Emitting ${event} to role room: ${role}`);
    ioInstance.to(role).emit(event, data);
  }
};
