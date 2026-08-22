import express from 'express';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../middleware/auth.js';
import User from '../models/User.js';
import { validateHumanText } from '../utils/humanTextValidation.js';

const router = express.Router();

const PUBLIC_USER_FIELDS =
  'username displayName bio avatar userType creatorProfile.artistName creatorProfile.organizationName creatorProfile.organizationLogo creatorProfile.category creatorProfile.isVerified createdAt';
const ADMIN_USER_FIELDS =
  'username email displayName avatar userType roles isActive onboardingCompleted lastLogin createdAt updatedAt';

const validUserId = (value) => mongoose.isValidObjectId(value);

const invalidUserId = (res) =>
  res.status(400).json({
    error: { code: 'INVALID_USER_ID', message: 'Invalid user ID' },
  });

const isAdmin = (req) =>
  Array.isArray(req.userRoles) && req.userRoles.includes('admin');

// Current account details. User schema defaults already exclude passwordHash and
// refreshTokenVersion; this route is intentionally self-only.
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    return res.status(200).json({
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

// Administrative directory. Do not return listeners' history/library or other
// private account collections merely because the caller is an administrator.
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit || '50', 10) || 50)
    );
    const filter = {};

    if (req.query.userType && ['listener', 'creator'].includes(req.query.userType)) {
      filter.userType = req.query.userType;
    }
    if (req.query.active === 'true' || req.query.active === 'false') {
      filter.isActive = req.query.active === 'true';
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(ADMIN_USER_FIELDS)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

// Account lookup preserves the legacy endpoint without exposing another user's
// email, notification preferences, saved audio, listening history, queue state,
// onboarding internals or other private account data.
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    if (!validUserId(req.params.id)) return invalidUserId(res);

    const ownAccount = String(req.params.id) === String(req.userId);
    const admin = isAdmin(req);

    const user = ownAccount || admin
      ? await User.findById(req.params.id)
      : await User.findOne({
          _id: req.params.id,
          isActive: true,
        }).select(PUBLIC_USER_FIELDS);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    return res.status(200).json({
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

// Profile/preferences updates remain self-only. Sensitive email/password/account
// state changes belong exclusively to /api/settings.
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    if (!validUserId(req.params.id)) return invalidUserId(res);

    if (String(req.params.id) !== String(req.userId)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You can only update your own profile',
        },
      });
    }

    const allowedUpdates = ['displayName', 'bio', 'avatar', 'preferences'];
    const updateData = {};
    for (const key of allowedUpdates) {
      if (req.body?.[key] !== undefined) updateData[key] = req.body[key];
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'bio')) {
      const bioError = validateHumanText(updateData.bio, {
        maxLength: 500,
        requiredMessage: 'Bio must be text',
        codeMessage: 'Code cannot be submitted as a bio',
      });
      if (bioError && updateData.bio !== '') {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: bioError },
        });
      }
      updateData.bio = typeof updateData.bio === 'string' ? updateData.bio.trim() : updateData.bio;
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    return res.status(200).json({
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

// Account state has one authority: Settings. The previous Users DELETE route
// deactivated an account without re-authenticating with the current password,
// bypassing the sensitive Settings flow.
router.delete('/:id', authenticate, (req, res) => {
  if (!validUserId(req.params.id)) return invalidUserId(res);

  return res.status(405).json({
    error: {
      code: 'ACCOUNT_STATE_VIA_SETTINGS',
      message: 'Use the Settings account flow to deactivate or delete an account.',
    },
  });
});

export default router;
