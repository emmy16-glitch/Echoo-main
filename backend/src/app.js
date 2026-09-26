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
import { startOrphanSweep } from './services/livekitOrphanSweep.js';
import { verifyAccessToken } from './config/jwt.js';
import { defaultLimiter } from './middleware/rateLimiter.js';
import User from './models/User.js';
import Broadcast from './models/Broadcast.js';
import { resolveBroadcastPresence } from './controllers/broadcastPresenceController.js';
import {
  clearLiveKitWebhookTimers,
  handleLiveKitWebhook,
} from './services/livekitWebhookService.js';
import {
  attachTranscriptionSession,
  configureTranscriptionGateway,
  detachTranscriptionSocket,
  flushTranscriptionSession,
  ingestTranscriptionFrame,
  isTranscriptionConfigured,
} from './services/transcriptionGateway.js';
import {
  startBroadcastProcessingWorker,
  stopBroadcastProcessingWorker,
} from './services/broadcastProcessingService.js';
import {
  attachLiveKitRecordingWebSocket,
  closeLiveKitRecordingWebSocket,
} from './services/livekitServerRecording.js';

const app = express();

// Staging/preview deployments sit behind local reverse proxies (Vite preview
// proxy, Cloudflare tunnel) that set X-Forwarded-For. Trust loopback proxies
// only, so express-rate-limit reads the real client IP instead of throwing
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request. Multi-hop hosts
// (e.g. Vercel containers behind the platform edge) override with
// TRUST_PROXY=1. Never trust arbitrary upstream proxies.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
const PORT = env.port || 5017;

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

  // The packaged desktop shell loads over file://, so its fetch/Socket.IO
  // handshake arrives with `Origin: null`. Without this the bundled backend
  // (ECHOO_DESKTOP=1, spawned by the Electron shell) rejects every API call
  // from the installed Windows app and it sits on a blank/loading screen.
  // Scoped to the desktop runtime only — server deployments still deny it.
  if ((normalized === 'null' || normalized === 'file://') && process.env.ECHOO_DESKTOP === '1') {
    return true;
  }

  if (allowedOrigins.has(normalized) || matchesOriginSuffix(normalized)) return true;

  if (env.isDevelopment) {
    try {
      const parsed = new URL(normalized);
      return (
        parsed.protocol === 'http:' &&
        parsed.port === '5273' &&
        ['localhost', '127.0.0.1'].includes(parsed.hostname)
      );
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
// Use Echoo's centralized general API limiter. The previous hard-coded
// 100-requests-per-15-minutes guard was lower than legitimate long-form live
// traffic (including 10-second transcript quality chunks) and could corrupt a
// healthy broadcast by returning 429s mid-session.
app.use('/api', defaultLimiter);

// LiveKit signs the exact raw webhook body. Register this endpoint before the
// general JSON parser so signature verification cannot be invalidated.
app.post(
  '/api/webhooks/livekit',
  express.raw({ type: 'application/webhook+json', limit: '1mb' }),
  handleLiveKitWebhook
);
// The legacy signed webhook router also needs an untouched payload. Keep this
// compatibility endpoint before the general JSON parser.
app.use('/api/livekit/webhook', express.raw({ type: '*/*', limit: '1mb' }));
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

// Serverless runtimes (Vercel Fluid) import this module instead of running it
// as a long-lived process, so startServer()'s boot-time connectDatabase()
// never runs there. Ensure one cached connection per instance on first API
// traffic instead. Long-lived servers are unaffected (already connected).
const isServerlessRuntime =
  process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL?.trim());
if (isServerlessRuntime) {
  app.use('/api', async (req, res, next) => {
    try {
      await connectDatabase();
      next();
    } catch (error) {
      next(error);
    }
  });
}

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
attachLiveKitRecordingWebSocket(server);

const io = new Server(server, {
  cors: {
    origin: echooCorsOrigin,
    methods: ['GET', 'POST'],
    credentials: false,
  },
});

app.set('io', io);
configureTranscriptionGateway(io);

const SOCKET_BROADCAST_CACHE_MS = 2000;
const PRESENCE_EVENT_COALESCE_MS = Math.max(
  500,
  Math.min(5000, Number(process.env.SOCKET_PRESENCE_COALESCE_MS) || 1500)
);
const socketBroadcastCache = new Map();
const socketBroadcastInflight = new Map();
const presenceEventTimers = new Map();

const getSocketBroadcast = async (broadcastId) => {
  if (!mongoose.isValidObjectId(broadcastId)) return null;

  const key = String(broadcastId);
  const cached = socketBroadcastCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.broadcast;
  if (socketBroadcastInflight.has(key)) return socketBroadcastInflight.get(key);

  const request = Broadcast.findOne({
    _id: broadcastId,
    isDeleted: false,
  }).select(
    '_id status isPublic creator startedAt endedAt listenerCount peakListeners mediaState transcriptState programTrackSid programTrackName'
  ).then((broadcast) => {
    if (broadcast) {
      socketBroadcastCache.set(key, {
        broadcast,
        expiresAt: Date.now() + SOCKET_BROADCAST_CACHE_MS,
      });
    } else {
      socketBroadcastCache.delete(key);
    }
    return broadcast;
  });

  socketBroadcastInflight.set(key, request);
  try {
    return await request;
  } finally {
    if (socketBroadcastInflight.get(key) === request) {
      socketBroadcastInflight.delete(key);
    }
  }
};

const schedulePresenceChanged = (broadcastId) => {
  const key = String(broadcastId || '');
  if (!key || presenceEventTimers.has(key)) return;

  const timer = setTimeout(() => {
    presenceEventTimers.delete(key);
    void resolveBroadcastPresence(key)
      .then((snapshot) => {
        // One coalesced snapshot replaces N per-listener join/leave events and
        // N HTTP presence refreshes. Media never passes through Socket.IO.
        io.to(`broadcast:${key}`).emit('presence:changed', snapshot);
      })
      .catch((error) => {
        console.warn(
          '[Echoo Presence] realtime snapshot warning:',
          error?.message || error
        );
      });
  }, PRESENCE_EVENT_COALESCE_MS);

  timer.unref?.();
  presenceEventTimers.set(key, timer);
};

io.use(async (socket, next) => {
  try {
    // Shared listen links: guests join realtime rooms without an account to
    // receive chat/status/presence events read-only. Identity is a
    // server-sanitized `guest:<id>` label — never a user record — so guests
    // can never be owners, post chat (REST stays auth-gated), or attach to
    // transcription sessions (guarded per-handler below).
    if (socket.handshake.auth?.guest === true) {
      const rawId = String(socket.handshake.auth?.guestId || '').slice(0, 80);
      const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || randomUUID();
      const rawName = String(socket.handshake.auth?.name || '').trim().slice(0, 40);
      socket.data.guest = true;
      socket.data.userId = `guest:${safeId}`;
      socket.data.user = {
        id: `guest:${safeId}`,
        username: null,
        displayName: rawName || 'Echoo Guest',
        avatar: null,
        guest: true,
      };
      return next();
    }

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
        : ['scheduled', 'starting', 'live'];

      if (!allowedStatuses.includes(broadcast.status)) {
        throw new Error('Broadcast realtime room is not active');
      }

      const room = `broadcast:${broadcastId}`;
      await socket.join(room);
      if (isOwner) await socket.join(`${room}:creator`);
      socket.data.broadcastRooms ||= new Set();
      socket.data.broadcastRooms.add(String(broadcastId));
      schedulePresenceChanged(broadcastId);

      if (typeof acknowledge === 'function') {
        acknowledge({
          ok: true,
          broadcastId: String(broadcastId),
          status: {
            broadcastId: String(broadcastId),
            status: broadcast.status,
            startedAt: broadcast.startedAt || null,
            endedAt: broadcast.endedAt || null,
            listenerCount: Number(broadcast.listenerCount) || 0,
            peakListeners: Number(broadcast.peakListeners) || 0,
            mediaState: broadcast.mediaState || 'waiting_for_creator',
            transcriptState: broadcast.transcriptState || 'disabled',
            programTrackSid: broadcast.programTrackSid || null,
            programTrackName: broadcast.programTrackName || null,
          },
        });
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
      socket.data.broadcastRooms?.delete(String(broadcastId));
      schedulePresenceChanged(broadcastId);
    }

    if (typeof acknowledge === 'function') {
      acknowledge({ ok: true });
    }
  });

  socket.on('transcription:attach', async ({ sessionId } = {}, acknowledge) => {
    try {
      if (!isTranscriptionConfigured()) {
        throw Object.assign(new Error('Transcription is disabled'), { code: 'TRANSCRIPTION_DISABLED' });
      }
      if (socket.data.guest) {
        throw new Error('Guest sessions cannot attach transcription sessions');
      }
      if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
        throw new Error('A valid transcript session ID is required');
      }
      const session = await attachTranscriptionSession({
        sessionId,
        userId: socket.data.userId,
        socketId: socket.id,
      });
      if (typeof acknowledge === 'function') acknowledge({ ok: true, session });
    } catch (error) {
      if (typeof acknowledge === 'function') {
        acknowledge({ ok: false, error: error.message, code: error.code || 'TRANSCRIPTION_ATTACH_FAILED' });
      }
    }
  });

  socket.on('transcription:pcm', ({ sessionId, frameIndex, data } = {}, acknowledge) => {
    try {
      if (!isTranscriptionConfigured()) {
        throw Object.assign(new Error('Transcription is disabled'), { code: 'TRANSCRIPTION_DISABLED' });
      }
      if (socket.data.guest) {
        throw new Error('Guest sessions cannot send transcription audio');
      }
      const result = ingestTranscriptionFrame({
        sessionId,
        userId: socket.data.userId,
        socketId: socket.id,
        frameIndex,
        data,
      });
      if (typeof acknowledge === 'function') acknowledge({ ok: true, ...result });
    } catch (error) {
      if (typeof acknowledge === 'function') {
        acknowledge({ ok: false, error: error.message, code: error.code || 'TRANSCRIPTION_FRAME_FAILED' });
      }
    }
  });

  socket.on('transcription:flush', async ({ sessionId } = {}, acknowledge) => {
    try {
      if (!isTranscriptionConfigured()) {
        throw Object.assign(new Error('Transcription is disabled'), { code: 'TRANSCRIPTION_DISABLED' });
      }
      if (socket.data.guest) {
        throw new Error('Guest sessions cannot flush transcription sessions');
      }
      const owned = await attachTranscriptionSession({
        sessionId,
        userId: socket.data.userId,
        socketId: socket.id,
      });
      const session = await flushTranscriptionSession(owned.id, { reason: 'creator-requested' });
      if (typeof acknowledge === 'function') acknowledge({ ok: true, session });
    } catch (error) {
      if (typeof acknowledge === 'function') {
        acknowledge({ ok: false, error: error.message, code: error.code || 'TRANSCRIPTION_FLUSH_FAILED' });
      }
    }
  });

  socket.on('disconnect', () => {
    for (const broadcastId of socket.data.broadcastRooms || []) {
      schedulePresenceChanged(broadcastId);
    }
    detachTranscriptionSocket(socket.id);
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

    // Fire-and-forget reaper for broadcasts stuck in transitory states with
    // lingering LiveKit resources. It self-guards when LiveKit is not
    // configured, so test and no-livekit environments skip it silently.
    startOrphanSweep();
    startBroadcastProcessingWorker(io);

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
  socketBroadcastInflight.clear();
  clearLiveKitWebhookTimers();
  stopBroadcastProcessingWorker();
  closeLiveKitRecordingWebSocket();

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

// Vercel Functions convention: the default export of a Node.js service
// entrypoint is the HTTP server to serve (Express + Socket.IO here, matching
// Vercel's documented Express/WebSocket pattern). Long-lived `node src/app.js`
// boots are unaffected (isEntrypoint guard above).
export default server;
