import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './middleware/authMiddleware';

let ioInstance: Server | null = null;

type PresenceStatus = 'online' | 'afk' | 'offline';

interface SocketState {
  isAfk: boolean;
}

// userId -> Map of socketId -> state
const userSockets = new Map<string, Map<string, SocketState>>();

export function getOverallStatus(userId: string): PresenceStatus {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return 'offline';
  for (const state of sockets.values()) {
    if (!state.isAfk) return 'online';
  }
  return 'afk';
}

function broadcastStatus(io: Server, userId: string, status: PresenceStatus) {
  io.emit('presenceUpdate', { userId, status });
  console.log(`[Presence] User ${userId} -> ${status}`);
}

export function initSocketManager(io: Server) {
  ioInstance = io;
  io.on('connection', (socket: Socket) => {
    let authenticatedUserId: string | null = null;

    console.log(`Socket connected: ${socket.id}`);

    // Client sends token to authenticate the socket
    socket.on('authenticate', (token: string) => {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        authenticatedUserId = decoded.userId.toString();

        console.log(`Socket ${socket.id} authenticated as user ${authenticatedUserId}`);

        const prevStatus = getOverallStatus(authenticatedUserId);

        if (!userSockets.has(authenticatedUserId)) {
          userSockets.set(authenticatedUserId, new Map());
        }
        userSockets.get(authenticatedUserId)!.set(socket.id, { isAfk: false });

        const newStatus = getOverallStatus(authenticatedUserId);
        if (prevStatus !== newStatus) {
          broadcastStatus(io, authenticatedUserId, newStatus);
        }
      } catch {
        console.warn(`Socket ${socket.id} failed authentication`);
        socket.disconnect(true);
      }
    });

    // Client signals user activity
    socket.on('activity', () => {
      if (!authenticatedUserId) return;
      const sockets = userSockets.get(authenticatedUserId);
      if (!sockets) return;

      const prevStatus = getOverallStatus(authenticatedUserId);
      const state = sockets.get(socket.id);
      if (state) state.isAfk = false;

      const newStatus = getOverallStatus(authenticatedUserId);
      if (prevStatus !== newStatus) {
        broadcastStatus(io, authenticatedUserId, newStatus);
      }
    });

    // Client signals this tab went AFK
    socket.on('afk', () => {
      if (!authenticatedUserId) return;
      const sockets = userSockets.get(authenticatedUserId);
      if (!sockets) return;

      const prevStatus = getOverallStatus(authenticatedUserId);
      const state = sockets.get(socket.id);
      if (state) state.isAfk = true;

      const newStatus = getOverallStatus(authenticatedUserId);
      if (prevStatus !== newStatus) {
        broadcastStatus(io, authenticatedUserId, newStatus);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      if (!authenticatedUserId) return;

      const sockets = userSockets.get(authenticatedUserId);
      if (sockets) {
        const prevStatus = getOverallStatus(authenticatedUserId);
        sockets.delete(socket.id);
        console.log(`User ${authenticatedUserId} tab closed. Sockets left: ${sockets.size}`);
        if (sockets.size === 0) {
          userSockets.delete(authenticatedUserId);
        }
        const newStatus = getOverallStatus(authenticatedUserId);
        if (prevStatus !== newStatus) {
          broadcastStatus(io, authenticatedUserId, newStatus);
        }
      }
    });
  });
}

export function getIO(): Server {
  if (!ioInstance) throw new Error('Socket.io not initialized');
  return ioInstance;
}

export function emitToUser(userId: string, event: string, data: any) {
  const sockets = userSockets.get(userId);
  if (sockets && ioInstance) {
    for (const socketId of sockets.keys()) {
      ioInstance.to(socketId).emit(event, data);
    }
  }
}

export function emitToUsers(userIds: string[], event: string, data: any) {
  userIds.forEach(id => emitToUser(id, event, data));
}
