import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './middleware/authMiddleware';

type PresenceStatus = 'online' | 'afk' | 'offline';

interface SocketState {
  isAfk: boolean;
}

// userId -> Map of socketId -> state
const userSockets = new Map<string, Map<string, SocketState>>();

function getOverallStatus(userId: string): PresenceStatus {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return 'offline';
  for (const state of sockets.values()) {
    if (!state.isAfk) return 'online';
  }
  return 'afk';
}

function broadcastStatus(io: Server, userId: string, status: PresenceStatus) {
  io.emit('userStatusChanged', { userId, status });
  console.log(`[Presence] User ${userId} -> ${status}`);
}

export function initSocketManager(io: Server) {
  io.on('connection', (socket: Socket) => {
    let authenticatedUserId: string | null = null;

    console.log(`Socket connected: ${socket.id}`);

    // Client sends token to authenticate the socket
    socket.on('authenticate', (token: string) => {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        authenticatedUserId = decoded.userId;

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
