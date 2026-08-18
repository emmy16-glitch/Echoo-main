import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
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
  // Non-browser clients such as curl and internal health checks do not send Origin.
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized) || matchesOriginSuffix(normalized)) return true;

  // Preserve the existing LAN development workflow. This lets a second phone or
  // laptop open Vite on the Creator machine while keeping production restricted.
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Request-Id'],
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

// Uploaded audio is addressed by the API as /uploads/audio/<file>.
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

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
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

// Make Socket.IO available to REST controllers for status/chat events.
app.set('io', io);

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
      if (!broadcastId) {
        throw new Error('broadcastId is required');
      }

      const broadcast = await Broadcast.findOne({
        _id: broadcastId,
        isDeleted: false,
      }).select('_id status isPublic creator');

      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      const isOwner = String(broadcast.creator) === socket.data.userId;
      if (!broadcast.isPublic && !isOwner) {
        throw new Error('Broadcast is private');
      }

      const room = `broadcast:${broadcastId}`;
      await socket.join(room);

      socket.to(room).emit('presence:changed', {
        broadcastId: String(broadcastId),
        userId: socket.data.userId,
        action: 'joined',
      });

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
      socket.to(room).emit('presence:changed', {
        broadcastId: String(broadcastId),
        userId: socket.data.userId,
        action: 'left',
      });
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
  server.close(async () => {
    await disconnectDatabase();
    console.log('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Force exit after timeout');
    process.exit(1);
  }, 10000);
};

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

export { app, server, io };
