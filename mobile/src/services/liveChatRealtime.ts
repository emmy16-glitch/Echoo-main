import { io, type Socket } from 'socket.io-client';

import { API_URL, getAccessToken, getCurrentUser } from '@/src/services/echooApi';

let socket: Socket | null = null;

function getSocketUrl() {
  return process.env.EXPO_PUBLIC_SOCKET_URL || API_URL.replace(/\/api\/?$/, '');
}

function joinRoom(activeSocket: Socket, broadcastId: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Joining live chat timed out.')), 10_000);
    activeSocket.emit('broadcast:join', { broadcastId }, (response: { ok?: boolean; error?: string }) => {
      clearTimeout(timeout);
      if (response?.ok) resolve();
      else reject(new Error(response?.error || 'Could not join live chat.'));
    });
  });
}

export async function joinLiveChat(broadcastId: string): Promise<Socket> {
  let token = await getAccessToken();
  if (!token) {
    // The REST client owns refresh-token rotation. Ask it to refresh before
    // opening the realtime socket so a restored mobile session joins cleanly.
    await getCurrentUser({ force: true }).catch(() => undefined);
    token = await getAccessToken();
  }
  if (!token) throw new Error('Sign in to join the live conversation.');

  if (socket) {
    socket.auth = { token };
    if (socket.connected) {
      await joinRoom(socket, broadcastId);
      return socket;
    }
    socket.disconnect();
  }

  socket = io(getSocketUrl(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 700,
    reconnectionDelayMax: 5_000,
    timeout: 10_000,
  });

  const activeSocket = socket;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Live chat connection timed out.'));
    }, 12_000);
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error || new Error('Could not connect to live chat.'));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      activeSocket.off('connect', onConnect);
      activeSocket.off('connect_error', onError);
    };
    activeSocket.on('connect', onConnect);
    activeSocket.on('connect_error', onError);
    activeSocket.connect();
  });

  await joinRoom(activeSocket, broadcastId);
  return activeSocket;
}

export function leaveLiveChat(broadcastId: string) {
  if (!socket) return;
  if (socket.connected && broadcastId) socket.emit('broadcast:leave', { broadcastId });
  socket.disconnect();
  socket = null;
}
