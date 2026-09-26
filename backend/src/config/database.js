import mongoose from 'mongoose';
import path from 'node:path';
import { env } from './env.js';

let isConnected = false;
let desktopMemoryServer = null;
// Serverless runtimes (Vercel Fluid) import this module once per instance and
// serve many requests concurrently. Coalesce simultaneous first-request
// connects into a single mongoose.connect() so a cold-start burst cannot open
// parallel connection attempts.
let connectPromise = null;

const boundedInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export async function connectDatabase() {
  if (isConnected) {
    console.log('Database already connected');
    return;
  }
  if (connectPromise) {
    await connectPromise;
    return;
  }

  const serverlessRuntime =
    process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL?.trim());
  const maxPoolSize = boundedInteger(
    process.env.MONGODB_MAX_POOL_SIZE,
    serverlessRuntime ? 5 : 25,
    1,
    100
  );
  const minPoolSize = boundedInteger(
    process.env.MONGODB_MIN_POOL_SIZE,
    serverlessRuntime ? 0 : 2,
    0,
    Math.min(10, maxPoolSize)
  );

  connectPromise = (async () => {
    try {
      console.log('Connecting to MongoDB...');
      await mongoose.connect(env.mongodbUri, {
        // Live rooms can create short bursts of auth/chat/presence requests when
        // many listeners arrive together. A slightly larger bounded pool keeps
        // those requests flowing without opening one DB connection per listener.
        maxPoolSize,
        minPoolSize,
        maxConnecting: serverlessRuntime ? 2 : 4,
        // Serverless cold starts must fail fast instead of trapping the Studio
        // behind a 10-second database checkout queue. Long-lived hosts retain
        // the larger queue for normal audience bursts.
        waitQueueTimeoutMS: serverlessRuntime ? 3000 : 10000,
        // Packaged desktop tries the machine-local server first but must not
        // hang the app boot when none exists — the in-memory fallback below
        // takes over within a few seconds.
        serverSelectionTimeoutMS: isDesktopRuntime() ? 2500 : 5000,
        socketTimeoutMS: 45000,
      });
      isConnected = true;
      console.log('MongoDB connected successfully');
      console.log('MongoDB pool:', { minPoolSize, maxPoolSize });
    } catch (error) {
      if (isDesktopRuntime()) {
        console.warn('No machine-local MongoDB found — starting the desktop database instead.');
        await connectDesktopMemoryDatabase({ maxPoolSize, minPoolSize });
        return;
      }
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    } finally {
      // Clear the cached attempt so a failed cold-start connect is retried by
      // the next request instead of sticking every request to a rejection.
      if (!isConnected) connectPromise = null;
    }
  })();

  await connectPromise;
}

export async function disconnectDatabase() {
  if (!isConnected && !desktopMemoryServer) return;
  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
    throw error;
  } finally {
    if (desktopMemoryServer) {
      try {
        await desktopMemoryServer.stop();
      } catch {
        // Best-effort shutdown of the embedded database.
      }
      desktopMemoryServer = null;
    }
  }
}

export function getDatabaseStatus() {
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
}

// ---------------------------------------------------------------------------
// Packaged-desktop fallback: end-user machines have no MongoDB installed.
// When ECHOO_DESKTOP=1 and the machine-local server is unreachable, boot an
// embedded MongoDB (mongodb-memory-server) with its data files inside the
// backend working directory (the desktop shell points cwd at per-user app
// storage), so accounts and content persist across restarts. First launch
// downloads the mongod binary once (~100MB, needs internet); later launches
// are fully offline. Server deployments never set ECHOO_DESKTOP, so their
// behavior is unchanged — a missing database is still a hard startup error.
// ---------------------------------------------------------------------------
function isDesktopRuntime() {
  return process.env.ECHOO_DESKTOP === '1';
}

async function connectDesktopMemoryDatabase({ maxPoolSize, minPoolSize }) {
  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = await import('mongodb-memory-server'));
  } catch (error) {
    console.error(
      'Desktop database unavailable: mongodb-memory-server is not installed. ' +
        'Install a machine-local MongoDB or run `npm install` in backend/ first.'
    );
    throw error;
  }

  const dbPath = path.join(process.cwd(), 'mongo-data');
  console.log(`Starting desktop database (data: ${dbPath})...`);
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dbPath, { recursive: true });
  desktopMemoryServer = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: 'wiredTiger' },
  });
  const uri = desktopMemoryServer.getUri('echoo-desktop');
  await mongoose.connect(uri, {
    maxPoolSize,
    minPoolSize,
    maxConnecting: 4,
    serverSelectionTimeoutMS: 5000,
  });
  isConnected = true;
  console.log('Desktop database ready (embedded MongoDB).');
}
