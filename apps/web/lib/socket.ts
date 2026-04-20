'use client';

import { io, Socket } from 'socket.io-client';
import { tokenStore } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;

  const url =
    process.env.NEXT_PUBLIC_SOCKET_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3001';

  socket = io(url, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    transports: ['websocket', 'polling'],
    auth: (cb) => {
      cb({ token: tokenStore.getAccess() ?? null });
    },
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
