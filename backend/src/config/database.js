import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;

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

  const maxPoolSize = boundedInteger(
    process.env.MONGODB_MAX_POOL_SIZE,
    25,
    5,
    100
  );
  const minPoolSize = boundedInteger(
    process.env.MONGODB_MIN_POOL_SIZE,
    2,
    0,
    Math.min(10, maxPoolSize)
  );

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.mongodbUri, {
      // Live rooms can create short bursts of auth/chat/presence requests when
      // many listeners arrive together. A slightly larger bounded pool keeps
      // those requests flowing without opening one DB connection per listener.
      maxPoolSize,
      minPoolSize,
      maxConnecting: 4,
      waitQueueTimeoutMS: 10000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('MongoDB connected successfully');
    console.log('MongoDB pool:', { minPoolSize, maxPoolSize });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
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
