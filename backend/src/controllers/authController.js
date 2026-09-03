import User from '../models/User.js';
import crypto from 'node:crypto';
import { verifyRefreshToken } from '../config/jwt.js';
import { env } from '../config/env.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

export async function register(req, res, next) {
  try {
    const { username, email, password, displayName } = req.body;
    const cleanUsername = String(username || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanUsername || !cleanEmail || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Username, email, and password are required' }
      });
    }

    const passwordValue = String(password);
    const hasPasswordCombination =
      passwordValue.length >= 8 &&
      /[a-z]/.test(passwordValue) &&
      /[A-Z]/.test(passwordValue) &&
      /\d/.test(passwordValue) &&
      /[^A-Za-z0-9]/.test(passwordValue);

    if (!hasPasswordCombination) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password must be at least 8 characters and include uppercase and lowercase letters, a number, and a special character',
        },
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email: cleanEmail }, { username: cleanUsername }]
    });

    if (existingUser) {
      if (existingUser.email === cleanEmail) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already registered' } });
      }
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Username already taken' } });
    }

    const hashedPassword = await User.hashPassword(password);

    const user = new User({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash: hashedPassword,
      displayName: String(displayName || cleanUsername).trim() || cleanUsername,
      roles: ['listener'],
    });

    await user.save();
    const { accessToken, refreshToken } = user.generateTokens();

    return res.status(201).json({
      data: { user: user.toJSON(), accessToken, refreshToken },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Registration error:', error?.message || error);
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { username, email, password } = req.body;

    const identifier = String(username || email || '').trim();
    if (!identifier || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Username/email and password are required' }
      });
    }

    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() }
      ]
    }).select('+passwordHash +refreshTokenVersion');

    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    // Verify the password before disclosing whether this particular account is
    // inactive. Otherwise login becomes an account-state enumeration endpoint.
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    if (!user.isActive) {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Account has been deactivated. Reactivate it to continue.',
        },
      });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const { accessToken, refreshToken } = user.generateTokens();

    return res.status(200).json({
      data: { user: user.toJSON(), accessToken, refreshToken },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Login error:', error?.message || error);
    next(error);
  }
}

export async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: { code: 'REFRESH_TOKEN_REQUIRED', message: 'Refresh token required' }
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' }
      });
    }

    const user = await User.findById(decoded.sub).select('+refreshTokenVersion');
    if (!user) {
      return res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' }
      });
    }

    if (decoded.tokenVersion !== user.refreshTokenVersion) {
      return res.status(401).json({
        error: { code: 'TOKEN_VERSION_MISMATCH', message: 'Refresh token version mismatch' }
      });
    }

    // Inactive accounts may refresh an already-issued session solely so the
    // dedicated reactivation endpoint remains reachable. Normal API auth and
    // Socket.IO still reject inactive users.
    const { accessToken, refreshToken: newRefreshToken } = user.generateTokens();

    return res.status(200).json({
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        accountActive: Boolean(user.isActive),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    // The browser clearing localStorage is not enough to invalidate a copied or
    // still-open refresh token. Rotate the account token version so every
    // refresh token issued before logout becomes unusable immediately.
    await User.updateOne(
      { _id: req.userId, isActive: true },
      { $inc: { refreshTokenVersion: 1 } }
    );

    return res.status(200).json({
      data: { message: 'Logged out successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUser(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    return res.status(200).json({
      data: { user: user.toJSON() },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Email is required' },
      });
    }

    const user = await User.findOne({ email: cleanEmail }).select('+resetPasswordTokenHash +resetPasswordExpiresAt');
    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_REGISTERED', message: 'This email is not registered. Please create an Echoo account.' },
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${env.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendPasswordResetEmail({ to: user.email, resetUrl });

    return res.status(200).json({
      data: { message: 'A password-reset link has been sent to your email address.' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body || {};
    const passwordValue = String(password || '');
    const hasPasswordCombination =
      passwordValue.length >= 8 &&
      /[a-z]/.test(passwordValue) &&
      /[A-Z]/.test(passwordValue) &&
      /\d/.test(passwordValue) &&
      /[^A-Za-z0-9]/.test(passwordValue);

    if (!token || !hasPasswordCombination) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid reset token and a strong password are required.',
        },
      });
    }

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
    }).select('+passwordHash +resetPasswordTokenHash +resetPasswordExpiresAt +refreshTokenVersion');

    if (!user) {
      return res.status(400).json({
        error: { code: 'INVALID_RESET_TOKEN', message: 'This reset link is invalid or expired.' },
      });
    }

    user.passwordHash = await User.hashPassword(passwordValue);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    user.refreshTokenVersion += 1;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      data: { message: 'Password reset successfully. You can now sign in.' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
