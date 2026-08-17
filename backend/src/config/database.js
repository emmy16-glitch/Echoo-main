import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;

export async function connectDatabase() {
  if (isConnected) {
    console.log('Database already connected');
    return;
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.mongodbUri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5001,
      socketTimeoutMS: 45001,
    });
    isConnected = true;
    console.log('MongoDB connected successfully');
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
