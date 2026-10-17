/* Real-time layer (Socket.IO): notifications, chat, live wishlist counts, live event counts. */
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { verifyAccess } from './jwt';
import { one } from '../db/pool';

let io: Server | null = null;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.corsOrigins, credentials: true },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string;
      const claims = verifyAccess(token);
      const s = await one('SELECT 1 FROM sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL', [claims.sid, claims.sub]);
      if (!s) return next(new Error('unauthorized'));
      (socket.data as any).userId = claims.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket.data as any).userId as string;
    socket.join(`user:${userId}`);

    socket.on('conversation:join', async (conversationId: string, ack?: (ok: boolean) => void) => {
      const m = await one('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [conversationId, userId]).catch(() => null);
      if (m) socket.join(`conv:${conversationId}`);
      ack?.(Boolean(m));
    });
    socket.on('conversation:leave', (conversationId: string) => socket.leave(`conv:${conversationId}`));
    socket.on('typing', (conversationId: string) => {
      if (socket.rooms.has(`conv:${conversationId}`)) socket.to(`conv:${conversationId}`).emit('typing', { conversationId, userId });
    });
    // Public live rooms (wishlist pledges, event registration counts) — read-only broadcasts.
    socket.on('watch', (room: string) => {
      if (/^(request|event):[0-9a-f-]{36}$/.test(room)) socket.join(room);
    });
    socket.on('unwatch', (room: string) => socket.leave(room));
  });
  return io;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  io?.to(`user:${userId}`).emit(event, data);
}
export function emitToRoom(room: string, event: string, data: unknown) {
  io?.to(room).emit(event, data);
}
