import { verifyAccessToken } from '../config/jwt.js';
import User from '../models/User.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found or inactive' }
      });
    }

    req.user = user;
    req.userId = user._id;
    req.userRoles = user.roles;
    req.tokenData = decoded;

    next();
  } catch (error) {
    if (error.message === 'Access token expired') {
      return res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } });
    }
    if (error.message === 'Invalid access token') {
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid access token' } });
    }
    next(error);
  }
}

// Optional authentication - doesn't require a token, but attaches user if present
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);
      
      const user = await User.findById(decoded.sub);
      if (user && user.isActive) {
        req.user = user;
        req.userId = user._id;
        req.userRoles = user.roles;
        req.tokenData = decoded;
      }
    }
    next();
  } catch (error) {
    // Optional auth doesn't throw errors, just continues without user
    next();
  }
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      });
    }

    const hasRole = allowedRoles.some((role) => req.userRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Insufficient permissions' }
      });
    }

    next();
  };
}

// Check ownership
export function checkOwnership(getResourceOwnerId) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
        });
      }

      let ownerId;
      if (typeof getResourceOwnerId === 'function') {
        ownerId = await getResourceOwnerId(req);
      } else {
        ownerId = req.params.userId || req.params.ownerId || req.body.ownerId;
      }

      if (!ownerId) {
        return res.status(400).json({
          error: { code: 'OWNER_NOT_SPECIFIED', message: 'Resource owner not specified' }
        });
      }

      if (req.userId.toString() !== ownerId.toString()) {
        return res.status(403).json({
          error: { code: 'NOT_OWNER', message: 'You do not own this resource' }
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
