import User from '../models/User.js';
import crypto from 'node:crypto';
import { verifyRefreshToken } from '../config/jwt.js';
import { env } from '../config/env.js';
import { sendPasswordResetEmail, sendEmailVerificationCode, sendWelcomeEmail, sendPasswordChangedEmail, sendNewSignInEmail } from '../services/emailService.js';
import { hasCreatorCapability } from '../utils/accountCapabilities.js';
import { countryFromRequest, describeUserAgent } from '../utils/signInContext.js';

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const EMAIL_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

const verificationCodeHash = (code) => crypto
  .createHash('sha256')
  .update(String(code))
  .digest('hex');

const matchesVerificationCode = (expectedHash, code) => {
  if (!expectedHash || !code) return false;
  const receivedHash = verificationCodeHash(code);
  const expected = Buffer.from(String(expectedHash), 'hex');
  const received = Buffer.from(receivedHash, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

const hashVerificationCode = verificationCodeHash;

const generateVerificationCode = () => String(crypto.randomInt(100000, 1000000));

const verificationPayload = (user) => ({
  userId: user._id,
  email: user.email,
  expiresInSeconds: Math.floor(EMAIL_VERIFICATION_CODE_TTL_MS / 1000),
});

const issueEmailVerificationCode = async (user) => {
  const code = generateVerificationCode();
  user.emailVerificationCodeHash = verificationCodeHash(code);
  user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_CODE_TTL_MS);
  user.emailVerificationSentAt = new Date();
  await user.save({ validateBeforeSave: false });
  await sendEmailVerificationCode({ to: user.email, code });
};

const accountUserJson = (user) => {
  const serialized = user?.toJSON?.() || user || {};
  return {
    ...serialized,
    // The current Echoo model predates a dedicated persisted profile-complete
    // flag. Under the unified account flow, a completed Listener onboarding or
    // any Creator capability implies the base public profile was completed.
    // Exposing this derived flag keeps fresh logins from re-running Profile
    // Setup, including creators who signed out midway through Channel setup.
    profileCompleted: Boolean(
      serialized.profileCompleted === true ||
      serialized.onboardingCompleted === true ||
      hasCreatorCapability(serialized)
    ),
  };
};

const registrationError = (res, caught) => {
  if (caught?.code === 11000) {
    const key = Object.keys(caught.keyPattern || caught.keyValue || {})[0];
    return res.status(409).json({
      error: key === 'username'
        ? { code: 'USERNAME_TAKEN', message: 'Username already taken' }
        : { code: 'EMAIL_EXISTS', message: 'Email already registered' },
    });
  }

  if (caught?.name === 'ValidationError') {
    const first = Object.values(caught.errors || {})[0];
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: first?.message || 'Please check your account details and try again.',
      },
    });
  }

  return null;
};

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

    // Usernames are Echoo handles, never alternate email addresses. Keeping the
    // handle alphabet explicit prevents a value like name@example.com from
    // colliding conceptually with the email login path.
    if (!USERNAME_PATTERN.test(cleanUsername)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username must be 3–30 characters and use only letters, numbers, dots, underscores, or hyphens',
        },
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
        return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'Email already registered' } });
      }
      return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'Username already taken' } });
    }

    const hashedPassword = await User.hashPassword(password);

    // New accounts are created unverified and receive a one-time code. The
    // code is stored only as a hash; the plain code is emailed once and never
    // persisted.
    const verificationCode = generateVerificationCode();

    const user = new User({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash: hashedPassword,
      displayName: String(displayName || cleanUsername).trim() || cleanUsername,
      roles: ['listener'],
      emailVerified: false,
      emailVerificationCodeHash: hashVerificationCode(verificationCode),
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_CODE_TTL_MS),
      emailVerificationSentAt: new Date(),
    });

    await user.save();

    // Verification email delivery is best-effort during registration so an
    // unconfigured or transiently failing mailer never blocks account creation.
    try {
      await sendEmailVerificationCode({ to: cleanEmail, code: verificationCode });
    } catch (error) {
      console.warn('Email verification delivery skipped during registration:', error?.message || error);
    }

    // The welcome email is also best-effort — signup must succeed even when the
    // provider is unreachable, so failures are logged and never surfaced.
    try {
      await sendWelcomeEmail({ to: cleanEmail, name: user.displayName || cleanUsername });
    } catch (error) {
      console.warn('Welcome email skipped during registration:', error?.message || error);
    }

    const { accessToken, refreshToken } = user.generateTokens();

    return res.status(201).json({
      data: {
        user: accountUserJson(user),
        accessToken,
        refreshToken,
        verificationRequired: true,
        verification: verificationPayload(user),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Registration error:', error?.message || error);
    if (registrationError(res, error)) return;
    next(error);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const { userId, code } = req.body || {};
    const cleanUserId = String(userId || '').trim();
    const cleanCode = String(code || '').trim();

    if (!cleanUserId || !cleanCode) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'User id and verification code are required' },
      });
    }

    if (!OBJECT_ID_PATTERN.test(cleanUserId)) {
      return res.status(400).json({
        error: { code: 'INVALID_USER_ID', message: 'The account identifier is not valid.' },
      });
    }

    const user = await User.findById(cleanUserId).select(
      '+emailVerificationCodeHash +emailVerificationExpiresAt +refreshTokenVersion'
    );

    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_REGISTERED', message: 'No account matches this verification request.' },
      });
    }

    if (user.emailVerified) {
      return res.status(200).json({
        data: { message: 'Email already verified.', verificationRequired: false },
        timestamp: new Date().toISOString(),
      });
    }

    const expectedHash = user.emailVerificationCodeHash;
    const expired = user.emailVerificationExpiresAt
      ? new Date(user.emailVerificationExpiresAt).getTime() < Date.now()
      : true;

    if (!expectedHash || expired || hashVerificationCode(cleanCode) !== expectedHash) {
      return res.status(400).json({
        error: {
          code: expired ? 'VERIFICATION_CODE_EXPIRED' : 'INVALID_VERIFICATION_CODE',
          message: expired
            ? 'That verification code has expired. Please request a new one.'
            : 'That verification code is not correct. Please try again.',
        },
      });
    }

    user.emailVerified = true;
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    user.emailVerificationSentAt = null;
    await user.save({ validateBeforeSave: false });

    const { accessToken, refreshToken } = user.generateTokens();

    return res.status(200).json({
      data: {
        user: accountUserJson(user),
        accessToken,
        refreshToken,
        verificationRequired: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Email verification error:', error?.message || error);
    next(error);
  }
}

export async function resendVerification(req, res, next) {
  try {
    const { userId, email } = req.body || {};
    const cleanUserId = String(userId || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanUserId || !cleanEmail) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'User id and email are required' },
      });
    }

    if (!OBJECT_ID_PATTERN.test(cleanUserId)) {
      return res.status(400).json({
        error: { code: 'INVALID_USER_ID', message: 'The account identifier is not valid.' },
      });
    }

    const user = await User.findOne({ _id: cleanUserId, email: cleanEmail }).select(
      '+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationSentAt'
    );

    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_REGISTERED', message: 'No pending registration matches this email.' },
      });
    }

    if (user.emailVerified) {
      return res.status(200).json({
        data: { message: 'This email is already verified.', verificationRequired: false },
        timestamp: new Date().toISOString(),
      });
    }

    if (
      user.emailVerificationSentAt &&
      Date.now() - new Date(user.emailVerificationSentAt).getTime() < VERIFICATION_RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        error: {
          code: 'RESEND_TOO_SOON',
          message: 'A verification code was just sent. Please wait a moment before requesting another.',
        },
      });
    }

    const code = generateVerificationCode();
    user.emailVerificationCodeHash = hashVerificationCode(code);
    user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_CODE_TTL_MS);
    user.emailVerificationSentAt = new Date();
    await user.save({ validateBeforeSave: false });

    await sendEmailVerificationCode({ to: user.email, code });

    return res.status(200).json({
      data: {
        message: 'A new verification code has been sent to your email.',
        verificationRequired: true,
        verification: verificationPayload(user),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Resend verification error:', error?.message || error);
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { username, email, password } = req.body;

    const rawIdentifier = String(username || email || '').trim();
    if (!rawIdentifier || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Username/email and password are required' }
      });
    }

    // A leading @ is explicitly a handle. Otherwise any @ identifies the email
    // path, so login never asks MongoDB to choose between two different account
    // fields for the same string.
    const explicitHandle = rawIdentifier.startsWith('@');
    const identifier = explicitHandle ? rawIdentifier.slice(1) : rawIdentifier;
    const lookup = !explicitHandle && identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { username: identifier };

    const user = await User.findOne(lookup).select('+passwordHash +refreshTokenVersion');

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

    // Optional new-sign-in security alert. Off by default (EMAIL_NEW_SIGNIN_ALERTS)
    // so real users are not emailed on every login; enable it to notify on each
    // sign-in. Delivery is best-effort and never fails the login itself.
    if (env.newSigninAlertsEnabled) {
      try {
        await sendNewSignInEmail({
          to: user.email,
          name: user.displayName || user.username,
          device: describeUserAgent(req.headers?.['user-agent']),
          location: countryFromRequest(req) || 'Unknown location',
        });
      } catch (error) {
        console.warn('New sign-in notification skipped:', error?.message || error);
      }
    }

    const { accessToken, refreshToken } = user.generateTokens();

    return res.status(200).json({
      data: { user: accountUserJson(user), accessToken, refreshToken },
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
      data: { user: accountUserJson(user) },
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

    const user = await User.findOne({ email: cleanEmail }).select(
      '+resetPasswordTokenHash +resetPasswordExpiresAt +resetPasswordRequestedAt +resetPasswordUsedAt'
    );
    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_REGISTERED', message: 'This email is not registered. Please create an Echoo account.' },
      });
    }

    // 256-bit cryptographically secure token. Only its SHA-256 hash is stored,
    // so a database leak never exposes a usable reset link.
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    user.resetPasswordRequestedAt = new Date();
    user.resetPasswordUsedAt = null;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${env.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      name: user.displayName || user.username,
    });

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
      resetPasswordUsedAt: null,
    }).select(
      '+passwordHash +resetPasswordTokenHash +resetPasswordExpiresAt +resetPasswordUsedAt +refreshTokenVersion'
    );

    if (!user) {
      return res.status(400).json({
        error: { code: 'INVALID_RESET_TOKEN', message: 'This reset link is invalid or expired.' },
      });
    }

    user.passwordHash = await User.hashPassword(passwordValue);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    user.resetPasswordUsedAt = new Date();
    user.refreshTokenVersion += 1;
    await user.save({ validateBeforeSave: false });

    // Confirmation is best-effort: the password is already updated, so a
    // transient mail failure must never make the reset look unsuccessful.
    try {
      await sendPasswordChangedEmail({
        to: user.email,
        name: user.displayName || user.username,
      });
    } catch (error) {
      console.warn('Password-changed confirmation email skipped:', error?.message || error);
    }

    return res.status(200).json({
      data: { message: 'Password reset successfully. You can now sign in.' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
