import User from '../models/User.js';
import {
  accountCapabilities,
  creatorOnboardingStep,
  hasCompletedCreatorSetup,
  hasCreatorCapability,
} from '../utils/accountCapabilities.js';

const notFound = (res) => res.status(404).json({
  error: { code: 'NOT_FOUND', message: 'User not found' },
});

const enableCreatorCapability = async (user) => {
  // userType is retained as a legacy capability marker for older backend code.
  // It must never be interpreted as a separate account or active workspace.
  user.userType = 'creator';
  user.roles = [...new Set(['listener', ...(user.roles || []), 'creator'])];

  // isApproved is the existing persisted completion marker for CreatorSetup.
  // Preserve completed legacy creators, otherwise explicitly mark setup pending.
  if (user.creatorProfile?.isApproved !== true) {
    user.creatorProfile.isApproved = false;
  }

  user.onboardingStep = creatorOnboardingStep(user);
  await user.save();
  return user;
};

export async function activateCreator(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    await enableCreatorCapability(user);

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        capabilities: accountCapabilities(user),
        creatorSetupCompleted: hasCompletedCreatorSetup(user),
        nextStep: hasCompletedCreatorSetup(user) ? 'complete' : 'creator-type-selection',
        message: hasCompletedCreatorSetup(user)
          ? 'Creator Studio is ready.'
          : 'Channel setup is ready.',
        onboardingStep: creatorOnboardingStep(user),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

// Legacy compatibility endpoint. New Echoo signup never asks the user to pick a
// role: every account is a Listener and Creator is enabled later as a capability.
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
      await enableCreatorCapability(user);
    } else {
      user.roles = [...new Set(['listener', ...(user.roles || [])])];
      if (!hasCreatorCapability(user)) user.userType = 'listener';
      await user.save();
    }

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        capabilities: accountCapabilities(user),
        nextStep: userType === 'creator' ? 'creator-type-selection' : 'listener-home',
        message: userType === 'creator'
          ? 'Channel setup is ready.'
          : 'Listener experience is ready.',
        onboardingStep: userType === 'creator' ? creatorOnboardingStep(user) : user.onboardingStep,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function chooseCreatorType(req, res, next) {
  try {
    const {
      creatorType,
      artistName,
      organizationName,
      organizationType,
      website,
      location,
    } = req.body;

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
        error: {
          code: 'FORBIDDEN',
          message: 'Create a Channel before setting creator details',
        },
      });
    }

    // Existing model helpers still use userType as the legacy capability flag.
    user.userType = 'creator';

    if (creatorType === 'individual' && !artistName) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Artist name is required for individual creators',
        },
      });
    }

    if (creatorType === 'organization' && (!organizationName || !organizationType)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: !organizationName ? 'Organization name is required' : 'Organization type is required',
        },
      });
    }

    await user.setCreatorType(creatorType, {
      artistName,
      organizationName,
      organizationType,
      website,
      location,
    });
    user.creatorProfile.isApproved = false;
    await user.save();

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        nextStep: 'content-info',
        message: 'Creator type saved. Now tell us about your Channel.',
        onboardingStep: creatorOnboardingStep(user),
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

    user.userType = 'creator';
    await user.updateContentInfo({
      category,
      contentDescription: contentDescription || '',
      genres: genres || [],
    });
    user.creatorProfile.isApproved = false;
    await user.save();

    const nextStep = user.creatorProfile.creatorType === 'organization'
      ? 'organization-details'
      : 'complete';

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        nextStep,
        message: 'Channel content info saved.',
        onboardingStep: creatorOnboardingStep(user),
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
        error: {
          code: 'FORBIDDEN',
          message: 'Only organization Channels can update organization details',
        },
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

    user.userType = 'creator';
    await user.updateOrganizationInfo({
      organizationName,
      category,
      about: about || '',
      contentDescription: contentDescription || '',
      organizationLogo: organizationLogo || null,
    });
    user.creatorProfile.isApproved = false;
    await user.save();

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        nextStep: 'complete',
        message: 'Organization Channel details saved.',
        onboardingStep: creatorOnboardingStep(user),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

// Completes optional Creator/Channel setup only. It intentionally does not
// rewrite the shared account onboarding flag that unlocked Listener.
export async function completeOnboarding(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return notFound(res);

    if (!hasCreatorCapability(user)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Creator capability is required' },
      });
    }

    if (!user.creatorProfile?.creatorType || !user.creatorProfile?.category) {
      return res.status(400).json({
        error: {
          code: 'CREATOR_SETUP_INCOMPLETE',
          message: 'Finish your Channel identity and category before continuing',
        },
      });
    }

    user.userType = 'creator';
    user.roles = [...new Set(['listener', ...(user.roles || []), 'creator'])];
    user.creatorProfile.isApproved = true;
    user.onboardingStep = 4;
    await user.save();

    return res.status(200).json({
      data: {
        message: 'Your Channel is ready. Opening Creator Studio.',
        redirect: '/creator-studio',
        creatorSetupCompleted: true,
        capabilities: accountCapabilities(user),
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

    const accountComplete = Boolean(user.onboardingCompleted);
    const creatorEnabled = hasCreatorCapability(user);
    const creatorComplete = hasCompletedCreatorSetup(user);
    const creatorStep = creatorOnboardingStep(user);

    let currentStep = 'profile-setup';
    if (accountComplete && !creatorEnabled) currentStep = 'listener-ready';
    if (accountComplete && creatorEnabled && !creatorComplete) {
      if (creatorStep === 1) currentStep = 'select-creator-type';
      else if (creatorStep === 2) currentStep = 'content-info';
      else if (creatorStep === 3) currentStep = 'organization-details';
      else currentStep = 'complete-creator-setup';
    }
    if (accountComplete && creatorComplete) currentStep = 'complete';

    return res.status(200).json({
      data: {
        isOnboardingComplete: accountComplete,
        isCreatorSetupComplete: creatorComplete,
        capabilities: accountCapabilities(user),
        userType: user.userType || 'listener',
        currentStep,
        onboardingStep: user.onboardingStep || 0,
        creatorOnboardingStep: creatorStep,
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

    user.onboardingCompleted = true;
    user.onboardingStep = Math.max(Number(user.onboardingStep) || 0, 5);
    await user.save();

    return res.status(200).json({
      data: {
        message: 'Account profile setup skipped',
        redirect: '/listen',
        user: user.toJSON(),
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

    if (user.onboardingCompleted) {
      return res.status(400).json({
        error: {
          code: 'ONBOARDING_COMPLETED',
          message: 'Account profile setup is already completed',
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

    // This is the one mandatory onboarding milestone. Completing it always
    // lands the account in Listener; Creator is optional and added later.
    user.roles = [...new Set(['listener', ...(user.roles || [])])];
    user.onboardingCompleted = true;
    user.onboardingStep = 5;
    await user.save();

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        capabilities: accountCapabilities(user),
        message: 'Profile setup completed successfully.',
        redirect: '/listen',
        onboardingCompleted: true,
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
        error: {
          code: 'INVALID_TYPE',
          message: 'Only JPEG, PNG, GIF, and WEBP images are allowed',
        },
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

    if (!user.onboardingCompleted) {
      user.roles = [...new Set(['listener', ...(user.roles || [])])];
      user.onboardingCompleted = true;
      user.onboardingStep = 5;
      await user.save();
    }

    return res.status(200).json({
      data: {
        message: 'Profile setup skipped',
        redirect: '/listen',
        user: user.toJSON(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Skip profile setup error:', error);
    return next(error);
  }
}
