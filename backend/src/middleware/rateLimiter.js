import rateLimit from 'express-rate-limit';

const limiter = ({ windowMs, limit, code, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        code,
        message,
      },
    },
  });

// These guards intentionally use express-rate-limit's built-in IP key handling
// so IPv6 clients are normalized correctly. The default MemoryStore is
// process-local; a horizontally scaled Echoo API must configure a shared store
// before relying on these limits as a cross-instance abuse boundary.
export const defaultLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 600,
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many requests, please try again shortly.',
});

// Password/identity entry points are deliberately stricter than normal API use.
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  code: 'AUTH_RATE_LIMIT_EXCEEDED',
  message: 'Too many authentication attempts, please try again later.',
});

// Refresh is called automatically by open tabs, so it needs a substantially
// higher ceiling than password entry while still bounding abusive token churn.
export const refreshLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  code: 'REFRESH_RATE_LIMIT_EXCEEDED',
  message: 'Too many session refresh attempts, please try again shortly.',
});

export const sensitiveLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  code: 'SENSITIVE_RATE_LIMIT_EXCEEDED',
  message: 'Too many sensitive account requests, please try again later.',
});

export const uploadLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  code: 'UPLOAD_LIMIT_EXCEEDED',
  message: 'Upload limit exceeded, please try again later.',
});

// Search-as-you-type can generate several legitimate requests per query, so
// keep this high enough for normal UI behaviour while preventing request floods.
export const searchLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 120,
  code: 'SEARCH_LIMIT_EXCEEDED',
  message: 'Too many search requests, please slow down.',
});

// LiveKit token issuance can be provoked by every listener join, so the limit
// must comfortably exceed a single user's retry/reconnect bursts while still
// bounding token-spam abuse (spawning cheap listener participants).
export const livekitTokenLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  code: 'LIVEKIT_TOKEN_LIMIT_EXCEEDED',
  message: 'LiveKit token requests exceeded, please try again later.',
});
