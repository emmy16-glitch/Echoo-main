// src/middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Rate Limiter Configuration
 * 
 * Different rate limits for different endpoints to prevent abuse.
 * Uses Redis store in production for distributed rate limiting.
 */

// Default rate limiter
export const defaultLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
  },
  skip: (req) => req.path === '/api/health',
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
});

// Strict limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 requests per 15 minutes
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later.',
    },
  },
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
});

// Strict limiter for sensitive operations
export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 30, // 30 requests per hour
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests for this operation, please try again later.',
    },
  },
});

// Upload rate limiter
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20, // 20 uploads per hour
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'UPLOAD_LIMIT_EXCEEDED',
      message: 'Upload limit exceeded, please try again later.',
    },
  },
});

// Search rate limiter
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // 30 searches per minute
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'SEARCH_LIMIT_EXCEEDED',
      message: 'Too many search requests, please slow down.',
    },
  },
});