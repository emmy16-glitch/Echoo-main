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

const vercelOriginHosts = [
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_URL,
]
  .map((value) => String(value || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, ''))
  .filter(Boolean);

const vercelClientOrigins = Array.from(
  new Set(vercelOriginHosts.map((host) => `https://${host}`))
);

if (nodeEnv === 'production') {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'LIVEKIT_URL',
    'LIVEKIT_PUBLIC_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());

  if (!process.env.CLIENT_ORIGINS?.trim() && vercelClientOrigins.length === 0) {
    missing.push('CLIENT_ORIGINS');
  }

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
  ? vercelClientOrigins
  : ['http://localhost:5273', 'http://127.0.0.1:5273'];
const resolvedClientOrigins = Array.from(
  new Set([...configuredClientOrigins, ...vercelClientOrigins])
);
const jwtSecret = requireValue('JWT_SECRET', 'dev-secret-key-change-in-production');

export const env = Object.freeze({
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: parsePort(process.env.PORT || '5017'),
  clientOrigins:
    resolvedClientOrigins.length > 0
      ? resolvedClientOrigins
      : defaultClientOrigins,
  clientOriginSuffixes: parseList(process.env.CLIENT_ORIGIN_SUFFIXES || (
    // Vercel preview deployments get per-deploy hostnames (*.vercel.app)
    // that are not all enumerated above; trust the platform suffix so any
    // echoo-staging preview URL passes origin checks without per-URL config.
    vercelClientOrigins.length ? 'vercel.app' : ''
  )),
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
  frontendUrl: requireValue(
    'FRONTEND_URL',
    vercelClientOrigins[0] || 'http://localhost:5273'
  ),
  resendApiKey: requireValue('RESEND_API_KEY', ''),
  emailFrom: requireValue('EMAIL_FROM', process.env.MAIL_FROM || ''),
  newSigninAlertsEnabled:
    String(process.env.EMAIL_NEW_SIGNIN_ALERTS || '').toLowerCase() === 'true',
  livekitApiKey: requireValue('LIVEKIT_API_KEY', ''),
  livekitApiSecret: requireValue('LIVEKIT_API_SECRET', ''),
});
