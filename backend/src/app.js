import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import routes from './routes/index.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { verifyAccessToken } from './config/jwt.js';
import User from './models/User.js';
import Broadcast from './models/Broadcast.js';

const app = express();
const PORT = env.port || 5001;

const normalizeOrigin = (value = '') => String(value).trim().replace(/\/$/, '');
const allowedOrigins = new Set(env.clientOrigins.map(normalizeOrigin));

const matchesOriginSuffix = (origin) => {
  if (!env.clientOriginSuffixes.length) return false;

  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return env.clientOriginSuffixes.some((configuredSuffix) => {
      const suffix = String(configuredSuffix)
        .trim()
        .toLowerCase()
        .replace(/^\./, '');
      return suffix && (hostname === suffix || hostname.endsWith(`.${suffix}`));
    });
  } catch {
    return false;
  }
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized) || matchesOriginSuffix(normalized)) return true;

  if (env.isDevelopment) {
    try {
      const parsed = new URL(normalized);
      return parsed.protocol === 'http:' && parsed.port === '5174';
    } catch {
      return false;
    }
  }

  return false;
};

const echooCorsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }

  const error = new Error('This frontend origin is not allowed to access the Echoo API.');
  error.code = 'CORS_ORIGIN_DENIED';
  error.status = 403;
  callback(error);
};

app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(
  cors({
    origin: echooCorsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Range'],
    exposedHeaders: [
      'X-Request-Id',
      'Accept-Ranges',
      'Content-Range',
      'Content-Length',
    ],
    credentials: false,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Audio bytes are private backend storage, not a public static directory.
// Keep other uploaded assets (avatars, covers, etc.) available through the
// existing development static mount while forcing audio playback through the
// authenticated /api/audio/:id/stream controller.
app.use('/uploads', (req, res, next) => {
  const requestPath = String(req.path || '');
  if (requestPath === '/audio' || requestPath.startsWith('/audio/')) {
    return res.status(404).json({
      error: {
        code: 'DIRECT_AUDIO_STORAGE_BLOCKED',
        message: 'Direct audio storage URLs are not available.',
      },
      requestId: req.id,
    });
  }
  return next();
});

app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    fallthrough: true,
    maxAge: env.nodeEnv === 'production' ? '1h' : 0,
  })
);

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' },
    requestId: req.id,
  });
});

const normalizeApiError = (err) => {
  if (err?.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: first?.message || err.message || 'Request validation failed',
    };
  }

  if (err?.name === 'CastError') {
    return {
      status: 400,
      code: 'INVALID_VALUE',
      message: `Invalid value for ${err.path || 'request field'}`,
    };
  }

  if (err?.code === 11000) {
    return {
      status: 409,
      code: 'DUPLICATE_RESOURCE',
      message: 'A record with this unique value already exists.',
    };
  }

  const status = Number(err?.status) || 500;
  const exposeMessage = status < 500 || Boolean(err?.status);
  return {
    status,
    code: err?.code || 'INTERNAL_ERROR',
    message:
      exposeMessage && err?.message
        ? err.message
        : 'An unexpected error occurred',
  };
};

app.use((err, req, res, next) => {
  const normalized = normalizeApiError(err);
  console.error(`[${req.id}] Error:`, err?.message || err);
  if (normalized.status >= 500) console.error(`[${req.id}] Stack:`, err?.stack);

  res.status(normalized.status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
    },
    requestId: req.id,
  });
});

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: echooCorsOrigin,
    methods: ['GET', 'POST'],
    credentials: false,
  },
});

app.set('io', io);

const SOCKET_BROADCAST_CACHE_MS = 2000;
const PRESENCE_EVENT_COALESCE_MS = 400;
const socketBroadcastCache = new Map();
const presenceEventTimers = new Map();

const getSocketBroadcast = async (broadcastId) => {
  if (!mongoose.isValidObjectId(broadcastId)) return null;

  const key = String(broadcastId);
  const cached = socketBroadcastCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.broadcast;

  const broadcast = await Broadcast.findOne({
    _id: broadcastId,
    isDeleted: false,
  }).select('_id status isPublic creator');

  if (broadcast) {
    socketBroadcastCache.set(key, {
      broadcast,
      expiresAt: Date.now() + SOCKET_BROADCAST_CACHE_MS,
    });
  } else {
    socketBroadcastCache.delete(key);
  }

  return broadcast;
};

const schedulePresenceChanged = (broadcastId) => {
  const key = String(broadcastId || '');
  if (!key || presenceEventTimers.has(key)) return;

  const timer = setTimeout(() => {
    presenceEventTimers.delete(key);
    io.to(`broadcast:${key}`).emit('presence:changed', {
      broadcastId: key,
      action: 'sync',
    });
  }, PRESENCE_EVENT_COALESCE_MS);

  timer.unref?.();
  presenceEventTimers.set(key, timer);
};

io.use(async (socket, next) => {
  try {
    const authToken = socket.handshake.auth?.token;
    const authHeader = socket.handshake.headers?.authorization;
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : '';

    const token = authToken || bearerToken;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub).select(
      '_id username displayName avatar isActive'
    );

    if (!user || !user.isActive) {
      return next(new Error('User not found or inactive'));
    }

    socket.data.userId = String(user._id);
    socket.data.user = {
      id: String(user._id),
      username: user.username,
      displayName: user.displayName || user.username,
      avatar: user.avatar || null,
    };

    return next();
  } catch (error) {
    return next(new Error(error?.message || 'Invalid authentication'));
  }
});

io.on('connection', (socket) => {
  socket.on('broadcast:join', async ({ broadcastId } = {}, acknowledge) => {
    try {
      if (!broadcastId || !mongoose.isValidObjectId(broadcastId)) {
        throw new Error('A valid broadcastId is required');
      }

      const broadcast = await getSocketBroadcast(broadcastId);

      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      const isOwner = String(broadcast.creator) === socket.data.userId;
      if (!broadcast.isPublic && !isOwner) {
        throw new Error('Broadcast is private');
      }

      // Scheduled public broadcasts intentionally support pre-live chat. Audio
      // credentials remain unavailable until status=live, while completed,
      // cancelled and failed broadcasts cannot accept new realtime participants.
      const allowedStatuses = isOwner
        ? ['scheduled', 'starting', 'live', 'ending']
        : ['scheduled', 'live'];

      if (!allowedStatuses.includes(broadcast.status)) {
        throw new Error('Broadcast realtime room is not active');
      }

      const room = `broadcast:${broadcastId}`;
      await socket.join(room);
      schedulePresenceChanged(broadcastId);

      if (typeof acknowledge === 'function') {
        acknowledge({ ok: true, broadcastId: String(broadcastId) });
      }
    } catch (error) {
      if (typeof acknowledge === 'function') {
        acknowledge({ ok: false, error: error.message });
      }
    }
  });

  socket.on('broadcast:leave', async ({ broadcastId } = {}, acknowledge) => {
    const room = broadcastId ? `broadcast:${broadcastId}` : null;

    if (room) {
      await socket.leave(room);
      schedulePresenceChanged(broadcastId);
    }

    if (typeof acknowledge === 'function') {
      acknowledge({ ok: true });
    }
  });
});

async function startServer() {
  try {
    if (env.isProduction && env.clientOrigins.length === 0) {
      console.warn(
        'Echoo production warning: CLIENT_ORIGINS is empty. Browser API/Socket.IO requests will be blocked until it is configured.'
      );
    }

    await connectDatabase();
    server.listen(PORT, () => {
      console.log('Echoo API listening on port', PORT);
      console.log('Health check: http://localhost:' + PORT + '/api/health');
      console.log('Environment:', env.nodeEnv);
      console.log('Allowed frontend origins:', env.clientOrigins.join(', ') || '(none configured)');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

const shutdown = async (signal) => {
  console.log('Received', signal, '. Shutting down...');

  for (const timer of presenceEventTimers.values()) clearTimeout(timer);
  presenceEventTimers.clear();
  socketBroadcastCache.clear();

  server.close(async () => {
    await disconnectDatabase();
    console.log('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Force exit after timeout');
    process.exit(1);
  }, 10000).unref?.();
};

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isEntrypoint = invokedFile && path.resolve(currentFile) === invokedFile;

if (isEntrypoint) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    process.exit(1);
  });

  startServer();
}

export {
  app,
  server,
  io,
  startServer,
  normalizeApiError,
  isAllowedOrigin,
};
