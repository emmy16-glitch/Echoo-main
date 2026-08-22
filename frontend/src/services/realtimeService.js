import {
  API_ORIGIN,
  clearAuthTokens,
  getCurrentAccessToken,
  refreshSessionAccessToken,
} from './api.js';

let clientScriptPromise = null;
let sharedSocket = null;
let socketAuthRefreshPromise = null;

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
      }, { once: true });
      existing.addEventListener('error', () =>
        reject(new Error('Could not load the Echoo realtime client.')),
      { once: true });
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

const authErrorLikely = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return /auth|token|jwt|expired|inactive|user not found/.test(message);
};

const updateSocketAuth = (token = getCurrentAccessToken()) => {
  if (sharedSocket) sharedSocket.auth = { token };
  return token;
};

const recoverSocketAuthentication = async () => {
  if (socketAuthRefreshPromise) return socketAuthRefreshPromise;

  socketAuthRefreshPromise = refreshSessionAccessToken()
    .then((token) => {
      updateSocketAuth(token);
      if (sharedSocket && !sharedSocket.connected) sharedSocket.connect();
      return token;
    })
    .catch((error) => {
      // Authentication failed after an explicit token refresh attempt. Avoid an
      // infinite reconnect loop using a permanently-invalid credential.
      clearAuthTokens();
      sharedSocket?.disconnect();
      throw error;
    })
    .finally(() => {
      socketAuthRefreshPromise = null;
    });

  return socketAuthRefreshPromise;
};

const installSocketRecovery = (socket) => {
  if (socket.__echooAuthRecoveryInstalled) return;
  socket.__echooAuthRecoveryInstalled = true;

  // If normal API activity already refreshed the access token, every Socket.IO
  // reconnect attempt should pick up the newest local token rather than the one
  // captured when the page first opened.
  socket.io?.on?.('reconnect_attempt', () => {
    updateSocketAuth();
  });

  socket.on('connect_error', (error) => {
    if (!authErrorLikely(error)) return;
    recoverSocketAuthentication().catch((refreshError) => {
      console.warn(
        'Echoo realtime session refresh failed:',
        refreshError?.message || refreshError
      );
    });
  });
};

const connect = async () => {
  const token = getCurrentAccessToken();
  if (!token) throw new Error('Login is required for realtime Echoo updates.');

  if (sharedSocket?.connected) {
    updateSocketAuth(token);
    return sharedSocket;
  }

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
    installSocketRecovery(sharedSocket);
  } else {
    updateSocketAuth(token);
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
    }, 12000);

    const onConnect = () => {
      cleanup();
      resolve(sharedSocket);
    };

    const onError = (error) => {
      if (authErrorLikely(error)) {
        // Do not immediately throw the screen into polling fallback. Give the
        // shared token-refresh path a chance to rotate credentials; `onConnect`
        // will resolve this same caller when the recovered socket reconnects.
        recoverSocketAuthentication().catch((refreshError) => {
          cleanup();
          reject(
            refreshError instanceof Error
              ? refreshError
              : new Error('Realtime session expired.')
          );
        });
        return;
      }

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
    let settled = false;
    let timer = null;
    const finish = (callback) => (value) => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      callback(value);
    };
    const resolveOnce = finish(resolve);
    const rejectOnce = finish(reject);
    timer = window.setTimeout(() => {
      rejectOnce(new Error('Joining the realtime broadcast room timed out.'));
    }, 10000);

    socket.emit('broadcast:join', { broadcastId }, (response) => {
      if (response?.ok) {
        socket.__echooBroadcastSnapshots = socket.__echooBroadcastSnapshots || new Map();
        if (response.status) socket.__echooBroadcastSnapshots.set(String(broadcastId), response.status);
        resolveOnce(socket);
      }
      else rejectOnce(new Error(response?.error || 'Could not join realtime broadcast room.'));
    });
  });
};

const leaveBroadcast = async (broadcastId) => {
  if (!sharedSocket?.connected || !broadcastId) return;
  sharedSocket.emit('broadcast:leave', { broadcastId });
};

const subscribeToCatalog = async (handler) => {
  if (typeof handler !== 'function') return () => {};

  const socket = await connect();
  socket.on('catalog:changed', handler);

  return () => {
    socket.off('catalog:changed', handler);
  };
};

const realtimeService = {
  connect,
  joinBroadcast,
  leaveBroadcast,
  subscribeToCatalog,
  getSocket: () => sharedSocket,
  disconnect: () => {
    sharedSocket?.disconnect();
    sharedSocket = null;
    socketAuthRefreshPromise = null;
  },
};

export default realtimeService;
