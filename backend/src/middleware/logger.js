// src/middleware/logger.js
import morgan from 'morgan';
import { createLogger, format, transports } from 'winston';
import { env } from '../config/env.js';
import path from 'path';
import fs from 'fs';

/**
 * Logging Configuration
 * 
 * Morgan for HTTP request logging
 * Winston for application logging
 */

// Ensure logs directory exists
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// ============================================
// WINSTON CONFIGURATION
// ============================================

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json(),
  format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  })
);

export const logger = createLogger({
  level: env.logLevel || 'info',
  format: logFormat,
  defaultMeta: { service: 'echoo-api' },
  transports: [
    // Console transport for all environments
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
    // File transport for errors
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add file transport for production
if (env.isProduction) {
  logger.add(
    new transports.File({
      filename: path.join(logDir, 'access.log'),
      level: 'info',
    })
  );
}

// ============================================
// MORGAN CONFIGURATION
// ============================================

// Custom token for request ID
morgan.token('requestId', (req) => req.id || 'unknown');

// Custom token for user ID
morgan.token('userId', (req) => req.userId || 'anonymous');

// Custom format for development
const devFormat = ':method :url :status :response-time ms - :res[content-length] - :requestId - :userId';

// Custom format for production (JSON)
const jsonFormat = (tokens, req, res) => {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: tokens.status(req, res),
    responseTime: tokens['response-time'](req, res),
    contentLength: tokens.res(req, res, 'content-length'),
    requestId: tokens.requestId(req, res),
    userId: tokens.userId(req, res),
    ip: tokens['remote-addr'](req, res),
    userAgent: tokens['user-agent'](req, res),
    referrer: tokens.referrer(req, res),
  });
};

// Morgan middleware
export const requestLogger = morgan(
  env.isProduction ? jsonFormat : devFormat,
  {
    stream: {
      write: (message) => {
        if (env.isProduction) {
          logger.info(message.trim());
        } else {
          console.log(message.trim());
        }
      },
    },
    skip: (req) => req.path === '/api/health',
  }
);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Log an API request/response
 */
export function logApiCall(req, res, duration) {
  logger.info('API call', {
    method: req.method,
    path: req.path,
    status: res.statusCode,
    duration,
    userId: req.userId,
    requestId: req.id,
    ip: req.ip,
  });
}

/**
 * Log a security event
 */
export function logSecurityEvent(event, details) {
  logger.warn('Security event', {
    event,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log a database operation
 */
export function logDatabase(operation, collection, details) {
  logger.debug('Database operation', {
    operation,
    collection,
    ...details,
  });
}

export default logger;