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

function parseList(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV || 'development';

if (nodeEnv === 'production') {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CLIENT_ORIGINS',
    'LIVEKIT_URL',
    'LIVEKIT_PUBLIC_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());

  if (missing.length) {
    throw new Error(
      `Echoo production configuration is incomplete. Missing: ${missing.join(', ')}`
    );
  }

  for (const name of ['LIVEKIT_URL', 'LIVEKIT_PUBLIC_URL']) {
    const value = process.env[name]?.trim() || '';
    if (!value.startsWith('wss://')) {
      throw new Error(`${name} must use wss:// in production.`);
    }
  }

  const whisperFlowUrl = process.env.WHISPER_FLOW_URL?.trim() || '';
  const whisperQualityFlowUrl = process.env.WHISPER_QUALITY_FLOW_URL?.trim() || '';
  if (whisperFlowUrl && !whisperFlowUrl.startsWith('wss://')) {
    throw new Error('WHISPER_FLOW_URL must use wss:// in production.');
  }
  if (whisperQualityFlowUrl && !whisperQualityFlowUrl.startsWith('wss://')) {
    throw new Error('WHISPER_QUALITY_FLOW_URL must use wss:// in production.');
  }
  if (whisperFlowUrl && !process.env.WHISPER_FLOW_API_KEY?.trim()) {
    throw new Error('WHISPER_FLOW_API_KEY is required when Whisper Flow is enabled.');
  }
  if (whisperQualityFlowUrl && !process.env.WHISPER_QUALITY_FLOW_API_KEY?.trim() && !process.env.WHISPER_FLOW_API_KEY?.trim()) {
    throw new Error('WHISPER_QUALITY_FLOW_API_KEY or WHISPER_FLOW_API_KEY is required when the quality provider is enabled.');
  }
}

const configuredClientOrigins = parseList(
  process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || ''
);
const defaultClientOrigins = nodeEnv === 'production'
  ? []
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];
const jwtSecret = requireValue('JWT_SECRET', 'dev-secret-key-change-in-production');

export const env = Object.freeze({
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: parsePort(process.env.PORT || '5001'),
  clientOrigins:
    configuredClientOrigins.length > 0
      ? configuredClientOrigins
      : defaultClientOrigins,
  clientOriginSuffixes: parseList(process.env.CLIENT_ORIGIN_SUFFIXES || ''),
  mongodbUri: requireValue('MONGODB_URI', 'mongodb://127.0.0.1:27017/echoo'),
  jwtSecret,
  jwtRefreshSecret: requireValue('JWT_REFRESH_SECRET', jwtSecret),
  jwtAccessExpiresIn: requireValue('JWT_ACCESS_EXPIRES_IN', '15m'),
  jwtRefreshExpiresIn: requireValue('JWT_REFRESH_EXPIRES_IN', '7d'),
  logLevel: requireValue('LOG_LEVEL', 'info'),
  whisperFlowUrl: String(process.env.WHISPER_FLOW_URL || '').trim(),
  whisperFlowApiKey: String(process.env.WHISPER_FLOW_API_KEY || '').trim(),
  whisperQualityFlowUrl: String(process.env.WHISPER_QUALITY_FLOW_URL || '').trim(),
  whisperQualityFlowApiKey: String(process.env.WHISPER_QUALITY_FLOW_API_KEY || '').trim(),
  whisperQualityModel: String(process.env.WHISPER_QUALITY_MODEL || process.env.WHISPER_MODEL || 'faster-whisper-large-v3-turbo').trim(),
  whisperModel: String(process.env.WHISPER_MODEL || 'faster-whisper-large-v3-turbo').trim(),
  whisperLanguage: String(process.env.WHISPER_LANGUAGE || 'en').trim(),
  frontendUrl: requireValue('FRONTEND_URL', 'http://localhost:5174'),
  gmailUser: requireValue('GMAIL_USER', ''),
  gmailClientId: requireValue('GMAIL_CLIENT_ID', ''),
  gmailClientSecret: requireValue('GMAIL_CLIENT_SECRET', ''),
  gmailRefreshToken: requireValue('GMAIL_REFRESH_TOKEN', ''),
  mailFrom: requireValue('MAIL_FROM', ''),
  livekitApiKey: requireValue('LIVEKIT_API_KEY', ''),
  livekitApiSecret: requireValue('LIVEKIT_API_SECRET', ''),
});
