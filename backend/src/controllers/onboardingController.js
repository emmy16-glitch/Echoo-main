import User from '../models/User.js';
import {
  creatorOnboardingStep,
  hasCompletedCreatorSetup,
  hasCompletedProfileSetup,
  hasCreatorCapability,
} from '../utils/accountCapabilities.js';

const notFound = (res) => res.status(404).json({
  error: { code: 'NOT_FOUND', message: 'User not found' },
});

const creatorStepName = (user) => {
  const step = creatorOnboardingStep(user);
  if (step === 1) return 'select-creator-type';
  if (step === 2) return 'content-info';
  if (step === 3) return 'organization-details';
  return 'complete';
};

export async function activateCreator(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    if (!hasCreatorCapability(user)) {
      user.userType = 'creator';
      user.roles = [...new Set(['listener', ...(user.roles || []), 'creator'])];
      user.creatorOnboardingCompleted = false;
      user.onboardingStep = creatorOnboardingStep(user);
      // Do not touch profileCompleted/onboardingCompleted here. Becoming a
      // Creator never removes Listener access from the same Echoo account.
      await user.save();
    }

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        nextStep: hasCompletedCreatorSetup(user) ? 'creator-studio' : creatorStepName(user),
        message: hasCompletedCreatorSetup(user)
          ? 'Creator Studio is already available.'
          : 'Channel setup is ready.',
        onboardingStep: user.onboardingStep,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

// Deprecated compatibility endpoint. Echoo no longer has separate Listener
// and Creator account identities; Creator is an optional capability.
export async function chooseUserType(req, res, next) {
  try {
    const { userType } = req.body;
    if (!userType || !['listener', 'creator'].includes(userType)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please select either "listener" or "creator"',
        },
      });
    }

    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    if (userType === 'creator') {
      if (!hasCreatorCapability(user)) {
        user.userType = 'creator';
        user.roles = [...new Set(['listener', ...(user.roles || []), 'creator'])];
        user.creatorOnboardingCompleted = false;
        user.onboardingStep = creatorOnboardingStep(user);
        await user.save();
      }
    } else if (!hasCompletedProfileSetup(user)) {
      // Preserve old clients that used "choose listener" as the last account
      // onboarding step, while keeping any existing Creator capability.
      user.roles = [...new Set(['listener', ...(user.roles || [])])];
      user.profileCompleted = true;
      user.onboardingCompleted = true;
      user.onboardingStep = 5;
      await user.save();
    }

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        nextStep: userType === 'creator' ? creatorStepName(user) : 'dashboard',
        message: userType === 'creator'
          ? 'Channel setup is ready.'
          : 'Your Echoo account is ready to listen.',
        onboardingStep: user.onboardingStep,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function chooseCreatorType(req, res, next) {
  try {
    const { creatorType, artistName, organizationName, organizationType, website, location } = req.body;

    if (!creatorType || !['individual', 'organization'].includes(creatorType)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please select either "individual" or "organization"',
        },
      });
    }

    const user = await User.findById(req.userId);
    if (!user) return notFound(res);
    if (!hasCreatorCapability(user)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Create your Channel before continuing Creator setup' },
      });
    }

    if (creatorType === 'individual' && !artistName) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Artist name is required for individual creators' },
      });
    }

    if (creatorType === 'organization') {
      if (!organizationName) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Organization name is required' },
        });
      }
      if (!organizationType) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Organization type is required' },
        });
      }
    }

    await user.setCreatorType(creatorType, {
      artistName,
      organizationName,
      organizationType,
      website,
      location,
    });

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        nextStep: 'content-info',
        message: 'Channel identity saved. Now tell us about your content.',
        onboardingStep: user.onboardingStep,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateContentInfo(req, res, next) {
  try {
    const { category, contentDescription, genres } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    if (!hasCreatorCapability(user)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Creator capability is required' },
      });
    }

    if (!category) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Category is required' },
      });
    }

    await user.updateContentInfo({
      category,
      contentDescription: contentDescription || '',
      genres: genres || [],
    });

    const nextStep = user.creatorProfile.creatorType === 'organization'
      ? 'organization-details'
      : 'complete';

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        nextStep,
        message: 'Content info saved.',
        onboardingStep: user.onboardingStep,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateOrganizationDetails(req, res, next) {
  try {
    const {
      organizationName,
      category,
      about,
      contentDescription,
      organizationLogo,
    } = req.body;

    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    if (!hasCreatorCapability(user) || user.creatorProfile?.creatorType !== 'organization') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only organization creators can update organization details' },
      });
    }

    if (!organizationName || !category) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: !organizationName ? 'Organization name is required' : 'Category is required',
        },
      });
    }

    await user.updateOrganizationInfo({
      organizationName,
      category,
      about: about || '',
      contentDescription: contentDescription || '',
      organizationLogo: organizationLogo || null,
    });

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        nextStep: 'complete',
        message: 'Organization profile complete.',
        onboardingStep: user.onboardingStep,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function completeOnboarding(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    if (hasCreatorCapability(user)) {
      user.creatorProfile.isApproved = true;
      user.creatorOnboardingCompleted = true;
      user.onboardingStep = 5;
      await user.save();
    } else {
      user.profileCompleted = true;
      user.onboardingCompleted = true;
      user.onboardingStep = 5;
      await user.save();
    }

    return res.status(200).json({
      data: {
        message: hasCreatorCapability(user)
          ? 'Channel setup completed successfully. Creator Studio is ready.'
          : 'Your Echoo account is ready.',
        redirect: hasCreatorCapability(user) ? '/creator-studio' : '/listen',
        user: user.toJSON(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function getOnboardingStatus(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    const profileCompleted = hasCompletedProfileSetup(user);
    const creatorCompleted = hasCompletedCreatorSetup(user);
    const creatorEnabled = hasCreatorCapability(user);

    let currentStep = profileCompleted ? 'complete' : 'profile-setup';
    if (creatorEnabled && !creatorCompleted) currentStep = creatorStepName(user);

    return res.status(200).json({
      data: {
        isOnboardingComplete: profileCompleted,
        profileCompleted,
        creatorOnboardingCompleted: creatorCompleted,
        capabilities: {
          listener: true,
          creator: creatorEnabled,
        },
        userType: user.userType || 'listener',
        currentStep,
        onboardingStep: user.onboardingStep || 0,
        creatorType: user.creatorProfile?.creatorType || null,
        user: user.toJSON(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function skipOnboarding(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    if (hasCreatorCapability(user)) {
      user.creatorProfile.isApproved = true;
      user.creatorOnboardingCompleted = true;
      user.onboardingStep = 5;
    } else {
      user.profileCompleted = true;
      user.onboardingCompleted = true;
      user.onboardingStep = 5;
    }
    await user.save();

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        message: hasCreatorCapability(user) ? 'Channel setup skipped' : 'Profile setup skipped',
        redirect: hasCreatorCapability(user) ? '/creator-studio' : '/listen',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function completeProfileSetup(req, res, next) {
  try {
    const {
      displayName,
      bio,
      avatar,
      preferences,
    } = req.body;

    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    if (hasCompletedProfileSetup(user)) {
      return res.status(400).json({
        error: {
          code: 'PROFILE_COMPLETED',
          message: 'Profile setup already completed',
        },
      });
    }

    if (displayName) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (avatar) user.avatar = avatar;

    if (preferences) {
      if (preferences.theme) user.preferences.theme = preferences.theme;
      if (preferences.language) user.preferences.language = preferences.language;
      if (preferences.categories) user.preferences.categories = preferences.categories;
    }

    user.profileCompleted = true;
    // Keep the old field true for older clients. Creator setup has its own
    // creatorOnboardingCompleted flag and must never flip this back to false.
    user.onboardingCompleted = true;
    user.onboardingStep = 5;
    await user.save();

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        message: 'Profile setup completed successfully.',
        redirect: '/listen',
        onboardingCompleted: true,
        profileCompleted: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Profile setup error:', error);
    return next(error);
  }
}

export async function uploadProfilePicture(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        error: { code: 'NO_FILE', message: 'No image file uploaded' },
      });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: { code: 'INVALID_TYPE', message: 'Only JPEG, PNG, GIF, and WEBP images are allowed' },
      });
    }

    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds 5MB limit' },
      });
    }

    const avatarUrl = `/uploads/avatars/${file.filename}`;
    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    user.avatar = avatarUrl;
    await user.save();

    return res.status(200).json({
      data: {
        avatar: avatarUrl,
        user: user.toJSON(),
        message: 'Profile picture uploaded successfully',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    return next(error);
  }
}

export async function skipProfileSetup(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    if (!hasCompletedProfileSetup(user)) {
      user.profileCompleted = true;
      user.onboardingCompleted = true;
      user.onboardingStep = 5;
      await user.save();
    }

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        message: 'Profile setup skipped',
        redirect: '/listen',
        profileCompleted: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Skip profile setup error:', error);
    return next(error);
  }
}
