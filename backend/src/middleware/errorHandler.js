// src/middleware/errorHandler.js
import { env } from '../config/env.js';
import { logger } from '../utils/helpers.js';

/**
 * Global Error Handler Middleware
 * 
 * Catches all errors and formats them consistently for the client.
 * Logs errors with appropriate severity levels.
 */

export function errorHandler(error, req, res, next) {
  // Generate request ID from response headers or create one
  const requestId = res.get('X-Request-Id') || req.id || 'unknown';

  // Determine status code
  const status = error.status || error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';

  // Determine message (don't expose internal errors in production)
  let message = error.message || 'An unexpected error occurred';
  if (env.isProduction && status === 500) {
    message = 'An unexpected error occurred. Please try again later.';
  }

  // Build error response
  const errorResponse = {
    error: {
      code,
      message,
      requestId,
    },
  };

  // Add validation details if available
  if (error.details) {
    errorResponse.error.details = error.details;
  }

  // Add stack trace in development
  if (env.isDevelopment && error.stack) {
    errorResponse.error.stack = error.stack;
  }

  // Log error
  const logData = {
    requestId,
    status,
    code,
    message: error.message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.userId || 'anonymous',
  };

  if (status >= 500) {
    logger.error('Server error:', logData, error.stack);
  } else if (status >= 400) {
    logger.warn('Client error:', logData);
  }

  // Send response
  res.status(status).json(errorResponse);
}

/**
 * Not Found Handler
 * 
 * Catches all unmatched routes and returns a 404 error.
 */
export function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.path}`);
  error.status = 404;
  error.code = 'ROUTE_NOT_FOUND';
  next(error);
}

/**
 * Async Wrapper for Controllers
 * 
 * Eliminates need for try-catch in every controller.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation Error Class
 */
export class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.status = 422;
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

/**
 * Conflict Error Class
 */
export class ConflictError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
    this.code = 'CONFLICT';
    this.field = field;
  }
}

/**
 * Forbidden Error Class
 */
export class ForbiddenError extends Error {
  constructor(message) {
    super(message || 'You do not have permission to perform this action');
    this.name = 'ForbiddenError';
    this.status = 403;
    this.code = 'FORBIDDEN';
  }
}