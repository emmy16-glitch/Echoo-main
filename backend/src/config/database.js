import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;
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
        // Database availability is a server concern. Echoo Desktop uses this
        // shared API and never falls back to a private machine-local database.
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      isConnected = true;
      console.log('MongoDB connected successfully');
      console.log('MongoDB pool:', { minPoolSize, maxPoolSize });
    } catch (error) {
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
  if (!isConnected) return;
  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
    throw error;
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
