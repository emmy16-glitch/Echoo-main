import User from '../models/User.js';
import bcrypt from 'bcryptjs';

// Get user settings
export async function getSettings(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    return res.status(200).json({
      data: {
        profile: {
          displayName: user.displayName,
          username: user.username,
          email: user.email,
          bio: user.bio,
          avatar: user.avatar,
        },
        preferences: {
          language: user.preferences?.language || 'en',
          theme: user.preferences?.theme || 'system',
          notifications: user.preferences?.notifications || {
            email: true,
            push: true,
            newFollowers: true,
            newReleases: true,
          },
          categories: user.preferences?.categories || [],
        },
        privacy: {
          isActive: user.isActive,
          showEmail: false, // Could be extended
          showBio: true, // Could be extended
        },
        creatorSettings: user.userType === 'creator' ? {
          artistName: user.creatorProfile?.artistName,
          organizationName: user.creatorProfile?.organizationName,
          isVerified: user.creatorProfile?.isVerified || false,
          categories: user.creatorProfile?.categories || [],
          about: user.creatorProfile?.about || '',
        } : null,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update profile settings
export async function updateProfile(req, res, next) {
  try {
    const userId = req.userId;
    const { displayName, bio, avatar } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (displayName !== undefined) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    if (user.userType === 'creator') {
      req.app.get('io')?.emit('catalog:changed', {
        entity: 'profile',
        action: 'updated',
        userId: String(user._id),
        username: user.username,
      });
    }

    return res.status(200).json({
      data: {
        profile: {
          displayName: user.displayName,
          bio: user.bio,
          avatar: user.avatar,
        },
        message: 'Profile updated successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update preferences
export async function updatePreferences(req, res, next) {
  try {
    const userId = req.userId;
    const { language, theme, notifications, categories } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (!user.preferences) {
      user.preferences = {};
    }

    if (language) user.preferences.language = language;
    if (theme) user.preferences.theme = theme;
    if (notifications) {
      user.preferences.notifications = {
        ...user.preferences.notifications,
        ...notifications,
      };
    }
    if (categories !== undefined) user.preferences.categories = categories;

    await user.save();

    return res.status(200).json({
      data: {
        preferences: user.preferences,
        message: 'Preferences updated successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update password
export async function updatePassword(req, res, next) {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'All password fields are required' }
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'New passwords do not match' }
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' }
      });
    }

    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Verify current password
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(401).json({
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' }
      });
    }

    // Hash and save new password
    const salt = await bcrypt.genSalt(12);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.refreshTokenVersion = (user.refreshTokenVersion || 0) + 1; // Invalidate old tokens
    await user.save();

    return res.status(200).json({
      data: {
        message: 'Password updated successfully',
        refreshTokensInvalidated: true,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update email
export async function updateEmail(req, res, next) {
  try {
    const userId = req.userId;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' }
      });
    }

    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: { code: 'INVALID_PASSWORD', message: 'Password is incorrect' }
      });
    }

    // Check if email is taken
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && existingUser._id.toString() !== userId) {
      return res.status(409).json({
        error: { code: 'EMAIL_TAKEN', message: 'Email is already in use' }
      });
    }

    user.email = email.toLowerCase();
    await user.save();

    return res.status(200).json({
      data: {
        email: user.email,
        message: 'Email updated successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update notification settings
export async function updateNotificationSettings(req, res, next) {
  try {
    const userId = req.userId;
    const { email, push, newFollowers, newReleases } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (!user.preferences) {
      user.preferences = {};
    }
    if (!user.preferences.notifications) {
      user.preferences.notifications = {};
    }

    if (email !== undefined) user.preferences.notifications.email = email;
    if (push !== undefined) user.preferences.notifications.push = push;
    if (newFollowers !== undefined) user.preferences.notifications.newFollowers = newFollowers;
    if (newReleases !== undefined) user.preferences.notifications.newReleases = newReleases;

    await user.save();

    return res.status(200).json({
      data: {
        notifications: user.preferences.notifications,
        message: 'Notification settings updated successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Deactivate account
export async function deactivateAccount(req, res, next) {
  try {
    const userId = req.userId;
    const { password, reason } = req.body;

    if (!password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Password is required to deactivate account' }
      });
    }

    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: { code: 'INVALID_PASSWORD', message: 'Password is incorrect' }
      });
    }

    user.isActive = false;
    user.deactivatedAt = new Date();
    user.deactivationReason = reason || 'User requested deactivation';
    await user.save();

    return res.status(200).json({
      data: {
        message: 'Account deactivated successfully',
        deactivatedAt: user.deactivatedAt,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Reactivate account
export async function reactivateAccount(req, res, next) {
  try {
    const userId = req.userId;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Password is required to reactivate account' }
      });
    }

    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: { code: 'INVALID_PASSWORD', message: 'Password is incorrect' }
      });
    }

    user.isActive = true;
    user.deactivatedAt = null;
    user.deactivationReason = null;
    await user.save();

    return res.status(200).json({
      data: {
        message: 'Account reactivated successfully',
        isActive: user.isActive,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Delete account (hard delete)
export async function deleteAccount(req, res, next) {
  try {
    const userId = req.userId;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Password is required to delete account' }
      });
    }

    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: { code: 'INVALID_PASSWORD', message: 'Password is incorrect' }
      });
    }

    // Delete user (consider cascading deletes)
    await user.deleteOne();

    return res.status(200).json({
      data: {
        message: 'Account deleted successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
