import dotenv from 'dotenv';
dotenv.config();

function requireValue(name, defaultValue = null) {
  const value = process.env[name]?.trim();
  if (!value && defaultValue === null) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || defaultValue;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535. Got: ${value}`);
  }
  return port;
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: parsePort(process.env.PORT || '5001'),
  clientOrigin: requireValue('CLIENT_ORIGIN', 'http://localhost:5173'),
  mongodbUri: requireValue('MONGODB_URI', 'mongodb://127.0.0.1:27017/echoo'),
  jwtSecret: requireValue('JWT_SECRET', 'dev-secret-key-change-in-production'),
  jwtAccessExpiresIn: requireValue('JWT_ACCESS_EXPIRES_IN', '15m'),
  jwtRefreshExpiresIn: requireValue('JWT_REFRESH_EXPIRES_IN', '7d'),
  logLevel: requireValue('LOG_LEVEL', 'info'),
});
