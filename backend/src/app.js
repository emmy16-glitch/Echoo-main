import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import routes from './routes/index.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

const app = express();
const PORT = env.port || 5001;

// Request ID middleware
app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// CORS - Allow all origins in development
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Request-Id'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

// Security headers (relaxed for development)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' },
    requestId: req.id,
  });
});

// Error handler
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

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

async function startServer() {
  try {
    await connectDatabase();
    server.listen(PORT, () => {
      console.log('Echoo API listening on port', PORT);
      console.log('Health check: http://localhost:' + PORT + '/api/health');
      console.log('Environment:', env.nodeEnv);
      console.log('CORS: All origins allowed (development)');
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
