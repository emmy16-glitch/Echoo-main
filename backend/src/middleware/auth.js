import { verifyAccessToken } from '../config/jwt.js';
import User from '../models/User.js';

const bearerTokenFromRequest = (req) => {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice(7).trim();
};

const attachAuthenticatedUser = async (
  req,
  res,
  next,
  { allowInactive = false } = {}
) => {
  try {
    const token = bearerTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub);

    if (!user) {
      return res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    if (!allowInactive && !user.isActive) {
      return res.status(401).json({
        error: { code: 'ACCOUNT_INACTIVE', message: 'Account is inactive' },
      });
    }

    req.user = user;
    req.userId = user._id;
    req.userRoles = Array.isArray(user.roles) ? user.roles : [];
    req.tokenData = decoded;

    return next();
  } catch (error) {
    if (error.message === 'Access token expired') {
      return res.status(401).json({
        error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' },
      });
    }
    if (error.message === 'Invalid access token') {
      return res.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid access token' },
      });
    }
    return next(error);
  }
};

export async function authenticate(req, res, next) {
  return attachAuthenticatedUser(req, res, next, { allowInactive: false });
}

// Reactivation is the one account flow that must be able to identify a valid
// signed-in user after that account has been deactivated. Normal API routes must
// continue using `authenticate`, which rejects inactive accounts.
export async function authenticateIncludingInactive(req, res, next) {
  return attachAuthenticatedUser(req, res, next, { allowInactive: true });
}

// Optional authentication - doesn't require a token, but attaches an active
// user when a valid access token is present.
export async function optionalAuth(req, res, next) {
  try {
    const token = bearerTokenFromRequest(req);
    if (token) {
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.sub);

      if (user?.isActive) {
        req.user = user;
        req.userId = user._id;
        req.userRoles = Array.isArray(user.roles) ? user.roles : [];
        req.tokenData = decoded;
      }
    }
    return next();
  } catch {
    // Optional auth deliberately falls back to an anonymous request.
    return next();
  }
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }

    const roles = Array.isArray(req.userRoles) ? req.userRoles : [];
    const hasRole = allowedRoles.some((role) => roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Insufficient permissions' },
      });
    }

    return next();
  };
}

// Check ownership
export function checkOwnership(getResourceOwnerId) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
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
          error: { code: 'OWNER_NOT_SPECIFIED', message: 'Resource owner not specified' },
        });
      }

      if (req.userId.toString() !== ownerId.toString()) {
        return res.status(403).json({
          error: { code: 'NOT_OWNER', message: 'You do not own this resource' },
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
