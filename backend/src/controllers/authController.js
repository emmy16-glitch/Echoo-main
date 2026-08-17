import User from '../models/User.js';
import { verifyRefreshToken } from '../config/jwt.js';

export async function register(req, res, next) {
  try {
    const { username, email, password, displayName } = req.body;

    console.log('Registration attempt:', { username, email });

    if (!username || !email || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Username, email, and password are required' }
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already registered' } });
      }
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Username already taken' } });
    }

    // Hash password using the static method
    const hashedPassword = await User.hashPassword(password);

    // Create user
    const user = new User({
      username,
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      displayName: displayName || username,
      roles: ['listener'],
    });

    await user.save();
    const { accessToken, refreshToken } = user.generateTokens();

    console.log('User registered:', username);

    return res.status(201).json({
      data: { user: user.toJSON(), accessToken, refreshToken },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Registration error:', error);
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { username, email, password } = req.body;

    console.log('Login attempt:', { username, email });

    const identifier = username || email;
    if (!identifier || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Username/email and password are required' }
      });
    }

    // Find user
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() }
      ]
    }).select('+passwordHash +refreshTokenVersion');

    if (!user) {
      console.log('User not found:', identifier);
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    console.log('User found:', user.username);

    if (!user.isActive) {
      return res.status(403).json({ error: { code: 'ACCOUNT_DEACTIVATED', message: 'Account has been deactivated' } });
    }

    // Compare password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      console.log('Invalid password for:', user.username);
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const { accessToken, refreshToken } = user.generateTokens();

    console.log('Login successful:', user.username);

    return res.status(200).json({
      data: { user: user.toJSON(), accessToken, refreshToken },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Login error:', error);
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
    } catch (error) {
      return res.status(401).json({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' }
      });
    }

    const user = await User.findById(decoded.sub).select('+refreshTokenVersion');
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found or inactive' }
      });
    }

    if (decoded.tokenVersion !== user.refreshTokenVersion) {
      return res.status(401).json({
        error: { code: 'TOKEN_VERSION_MISMATCH', message: 'Refresh token version mismatch' }
      });
    }

    const { accessToken, refreshToken: newRefreshToken } = user.generateTokens();

    return res.status(200).json({
      data: { accessToken, refreshToken: newRefreshToken },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
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
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Email is required' }
      });
    }

    return res.status(200).json({
      data: { message: 'If an account exists, a reset link will be sent' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
