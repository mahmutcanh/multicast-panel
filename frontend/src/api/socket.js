import { io } from 'socket.io-client';
import { getAccessToken } from './client';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io('/', {
      auth: (cb) => cb({ token: getAccessToken() }),
      autoConnect: false,
      reconnectionDelayMax: 10000,
    });
  }
  return socket;
}

export function connectSocket(rooms) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit('subscribe', rooms);
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
