// src/utils/responseHandler.js
import { generateRequestId } from './helpers.js';

/**
 * Standard Response Handler
 * 
 * Provides consistent response formatting for all API endpoints.
 */

export class ResponseHandler {
  constructor(res, req) {
    this.res = res;
    this.req = req;
  }

  /**
   * Send a success response
   */
  success(data, status = 200) {
    return this.res.status(status).json({
      data,
      requestId: this.req.id || generateRequestId(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a paginated success response
   */
  paginated(data, pagination, status = 200) {
    return this.res.status(status).json({
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: pagination.totalPages,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev,
      },
      requestId: this.req.id || generateRequestId(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a created response (201)
   */
  created(data) {
    return this.success(data, 201);
  }

  /**
   * Send a no content response (204)
   */
  noContent() {
    return this.res.status(204).send();
  }

  /**
   * Send an error response
   */
  error(error) {
    const status = error.status || error.statusCode || 500;
    const code = error.code || 'INTERNAL_ERROR';
    const message = error.message || 'An unexpected error occurred';

    const response = {
      error: {
        code,
        message,
        requestId: this.req.id || generateRequestId(),
        timestamp: new Date().toISOString(),
      },
    };

    if (error.details) {
      response.error.details = error.details;
    }

    // Add stack trace in development
    if (process.env.NODE_ENV === 'development' && error.stack) {
      response.error.stack = error.stack;
    }

    return this.res.status(status).json(response);
  }

  /**
   * Send a validation error
   */
  validationError(details) {
    const error = new Error('Validation failed');
    error.status = 422;
    error.code = 'VALIDATION_ERROR';
    error.details = details;
    return this.error(error);
  }

  /**
   * Send a not found error
   */
  notFound(message = 'Resource not found') {
    const error = new Error(message);
    error.status = 404;
    error.code = 'NOT_FOUND';
    return this.error(error);
  }

  /**
   * Send a conflict error
   */
  conflict(message = 'Resource already exists') {
    const error = new Error(message);
    error.status = 409;
    error.code = 'CONFLICT';
    return this.error(error);
  }

  /**
   * Send a forbidden error
   */
  forbidden(message = 'You do not have permission') {
    const error = new Error(message);
    error.status = 403;
    error.code = 'FORBIDDEN';
    return this.error(error);
  }

  /**
   * Send an unauthorized error
   */
  unauthorized(message = 'Authentication required') {
    const error = new Error(message);
    error.status = 401;
    error.code = 'UNAUTHORIZED';
    return this.error(error);
  }
}

/**
 * Helper to create response handler
 */
export function createResponse(req, res) {
  return new ResponseHandler(res, req);
}

/**
 * Standard success response function
 */
export function sendSuccess(res, data, status = 200) {
  return res.status(status).json({
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Standard error response function
 */
export function sendError(res, error, status = 500) {
  const response = {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  };

  if (error.details) {
    response.error.details = error.details;
  }

  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.error.stack = error.stack;
  }

  return res.status(status).json(response);
}