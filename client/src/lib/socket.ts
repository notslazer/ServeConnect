import { io, Socket } from 'socket.io-client';
import { API_URL, getAccessToken, refreshAccess } from './api';

let socket: Socket | null = null;

/** Single shared Socket.IO connection; the token is read on every (re)connect so it never goes stale. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL || undefined, {
      path: '/socket.io',
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
    });
    socket.on('connect_error', async (err) => {
      if (err.message === 'unauthorized' && (await refreshAccess())) socket?.connect();
    });
  }
  if (socket.disconnected) socket.connect();
  return socket;
}
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
