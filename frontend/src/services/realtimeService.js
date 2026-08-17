import { API_ORIGIN } from './api.js';

let clientScriptPromise = null;
let sharedSocket = null;

const getAccessToken = () =>
  localStorage.getItem('accessToken') ||
  localStorage.getItem('token') ||
  '';

const scriptUrl = () => `${API_ORIGIN || ''}/socket.io/socket.io.js`;

const loadSocketIoClient = () => {
  if (window.io) return Promise.resolve(window.io);
  if (clientScriptPromise) return clientScriptPromise;

  clientScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-echoo-socket-client]');

    if (existing) {
      existing.addEventListener('load', () => {
        if (window.io) resolve(window.io);
        else reject(new Error('Socket.IO client did not initialize.'));
      });
      existing.addEventListener('error', () =>
        reject(new Error('Could not load the Echoo realtime client.'))
      );
      return;
    }

    const script = document.createElement('script');
    script.src = scriptUrl();
    script.async = true;
    script.dataset.echooSocketClient = 'true';
    script.onload = () => {
      if (window.io) resolve(window.io);
      else reject(new Error('Socket.IO client did not initialize.'));
    };
    script.onerror = () =>
      reject(new Error('Could not load the Echoo realtime client.'));
    document.head.appendChild(script);
  }).catch((error) => {
    clientScriptPromise = null;
    throw error;
  });

  return clientScriptPromise;
};

const connect = async () => {
  const token = getAccessToken();
  if (!token) throw new Error('Login is required for realtime Echoo updates.');

  if (sharedSocket?.connected) return sharedSocket;

  const io = await loadSocketIoClient();

  if (!sharedSocket) {
    sharedSocket = io(API_ORIGIN || window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 700,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
  } else {
    sharedSocket.auth = { token };
  }

  if (!sharedSocket.connected) sharedSocket.connect();

  return new Promise((resolve, reject) => {
    if (sharedSocket.connected) {
      resolve(sharedSocket);
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Realtime connection timed out.'));
    }, 10000);

    const onConnect = () => {
      cleanup();
      resolve(sharedSocket);
    };

    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error('Realtime connection failed.'));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      sharedSocket.off('connect', onConnect);
      sharedSocket.off('connect_error', onError);
    };

    sharedSocket.on('connect', onConnect);
    sharedSocket.on('connect_error', onError);
  });
};

const joinBroadcast = async (broadcastId) => {
  const socket = await connect();

  return new Promise((resolve, reject) => {
    socket.emit('broadcast:join', { broadcastId }, (response) => {
      if (response?.ok) resolve(socket);
      else reject(new Error(response?.error || 'Could not join realtime broadcast room.'));
    });
  });
};

const leaveBroadcast = async (broadcastId) => {
  if (!sharedSocket?.connected || !broadcastId) return;
  sharedSocket.emit('broadcast:leave', { broadcastId });
};

const realtimeService = {
  connect,
  joinBroadcast,
  leaveBroadcast,
  getSocket: () => sharedSocket,
  disconnect: () => {
    sharedSocket?.disconnect();
    sharedSocket = null;
  },
};

export default realtimeService;
