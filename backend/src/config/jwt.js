import jwt from 'jsonwebtoken';
import { env } from './env.js';

export const jwtConfig = {
  access: {
    secret: env.jwtSecret,
    expiresIn: env.jwtAccessExpiresIn,
    algorithm: 'HS256',
  },
  refresh: {
    secret: env.jwtRefreshSecret,
    expiresIn: env.jwtRefreshExpiresIn,
    algorithm: 'HS256',
  },
};

export function generateAccessToken(payload) {
  return jwt.sign(
    {
      sub: payload.userId,
      email: payload.email,
      roles: payload.roles || ['listener'],
      type: 'access',
    },
    jwtConfig.access.secret,
    {
      expiresIn: jwtConfig.access.expiresIn,
      algorithm: jwtConfig.access.algorithm,
    }
  );
}

export function generateRefreshToken(payload) {
  const tokenVersion = Number.isInteger(payload.tokenVersion)
    ? payload.tokenVersion
    : 0;

  return jwt.sign(
    {
      sub: payload.userId,
      tokenVersion,
      type: 'refresh',
    },
    jwtConfig.refresh.secret,
    {
      expiresIn: jwtConfig.refresh.expiresIn,
      algorithm: jwtConfig.refresh.algorithm,
    }
  );
}

export function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, jwtConfig.access.secret);
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid access token');
    }
    throw error;
  }
}

export function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, jwtConfig.refresh.secret);
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid refresh token');
    }
    throw error;
  }
}
