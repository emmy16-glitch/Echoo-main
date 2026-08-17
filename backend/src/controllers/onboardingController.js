import User from '../models/User.js';

// Step 1: Choose user type (Listener or Creator)
export async function chooseUserType(req, res, next) {
  try {
    const { userType } = req.body;
    const userId = req.userId;

    if (!userType || !['listener', 'creator'].includes(userType)) {
      return res.status(400).json({
        error: { 
          code: 'VALIDATION_ERROR', 
          message: 'Please select either "listener" or "creator"' 
        }
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (user.onboardingCompleted) {
      return res.status(400).json({
        error: { 
          code: 'ONBOARDING_COMPLETED', 
          message: 'Onboarding already completed' 
        }
      });
    }

    await user.setUserType(userType);

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        nextStep: userType === 'creator' ? 'creator-type-selection' : 'dashboard',
        message: `You've chosen to start as a ${userType}!`,
        onboardingStep: user.onboardingStep,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Step 2: Choose creator type (Individual or Organization)
export async function chooseCreatorType(req, res, next) {
  try {
    const { creatorType, artistName, organizationName, organizationType, website, location } = req.body;
    const userId = req.userId;

    if (!creatorType || !['individual', 'organization'].includes(creatorType)) {
      return res.status(400).json({
        error: { 
          code: 'VALIDATION_ERROR', 
          message: 'Please select either "individual" or "organization"' 
        }
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (user.userType !== 'creator') {
      return res.status(403).json({
        error: { 
          code: 'FORBIDDEN', 
          message: 'Only creators can set creator type' 
        }
      });
    }

    if (creatorType === 'individual') {
      if (!artistName) {
        return res.status(400).json({
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Artist name is required for individual creators' 
          }
        });
      }
    } else {
      if (!organizationName) {
        return res.status(400).json({
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Organization name is required' 
          }
        });
      }
      if (!organizationType) {
        return res.status(400).json({
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Organization type is required' 
          }
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
        message: 'Creator type set! Now tell us about your content.',
        onboardingStep: user.onboardingStep,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Step 3: Update content info (Category + Description)
export async function updateContentInfo(req, res, next) {
  try {
    const { category, contentDescription, genres } = req.body;
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (user.userType !== 'creator') {
      return res.status(403).json({
        error: { 
          code: 'FORBIDDEN', 
          message: 'Only creators can update content info' 
        }
      });
    }

    if (!category) {
      return res.status(400).json({
        error: { 
          code: 'VALIDATION_ERROR', 
          message: 'Category is required' 
        }
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
        nextStep: nextStep,
        message: 'Content info saved!',
        onboardingStep: user.onboardingStep,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Step 4: Update organization details (for Organization creators)
export async function updateOrganizationDetails(req, res, next) {
  try {
    const { 
      organizationName, 
      category, 
      about, 
      contentDescription, 
      organizationLogo 
    } = req.body;
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (user.userType !== 'creator' || user.creatorProfile.creatorType !== 'organization') {
      return res.status(403).json({
        error: { 
          code: 'FORBIDDEN', 
          message: 'Only organization creators can update organization details' 
        }
      });
    }

    if (!organizationName) {
      return res.status(400).json({
        error: { 
          code: 'VALIDATION_ERROR', 
          message: 'Organization name is required' 
        }
      });
    }

    if (!category) {
      return res.status(400).json({
        error: { 
          code: 'VALIDATION_ERROR', 
          message: 'Category is required' 
        }
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
        message: 'Organization profile complete!',
        onboardingStep: user.onboardingStep,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Step 5: Complete onboarding
export async function completeOnboarding(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Set creator profile as approved
    if (user.userType === 'creator') {
      user.creatorProfile.isApproved = true;
    }

    await user.completeOnboarding();

    return res.status(200).json({
      data: {
        message: 'Onboarding completed successfully! Your creator studio is ready.',
        redirect: '/studio/dashboard',
        user: user.toJSON(),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get onboarding status
export async function getOnboardingStatus(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    let currentStep = 'select-user-type';
    if (user.onboardingCompleted) {
      currentStep = 'complete';
    } else if (user.userType === 'creator') {
      const step = user.onboardingStep || 0;
      if (step === 1) currentStep = 'select-creator-type';
      else if (step === 2) currentStep = 'content-info';
      else if (step === 3) currentStep = 'organization-details';
      else if (step === 4) currentStep = 'complete';
    }

    return res.status(200).json({
      data: {
        isOnboardingComplete: user.onboardingCompleted || false,
        userType: user.userType || 'listener',
        currentStep: currentStep,
        onboardingStep: user.onboardingStep || 0,
        creatorType: user.creatorProfile?.creatorType || null,
        user: user.toJSON(),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Skip onboarding
export async function skipOnboarding(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    user.onboardingCompleted = true;
    if (user.userType === 'creator') {
      user.creatorProfile.isApproved = true;
    }
    await user.save();

    return res.status(200).json({
      data: {
        message: 'Onboarding skipped',
        redirect: user.userType === 'creator' ? '/studio/dashboard' : '/dashboard',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Step 4: Complete profile setup
export async function completeProfileSetup(req, res, next) {
  try {
    const userId = req.userId;
    const { 
      displayName, 
      bio, 
      avatar,
      preferences 
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // If user is already onboarded, redirect
    if (user.onboardingCompleted) {
      return res.status(400).json({
        error: { 
          code: 'ONBOARDING_COMPLETED', 
          message: 'Onboarding already completed' 
        }
      });
    }

    // Update profile fields
    if (displayName) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (avatar) user.avatar = avatar;

    // Update preferences
    if (preferences) {
      if (preferences.theme) user.preferences.theme = preferences.theme;
      if (preferences.language) user.preferences.language = preferences.language;
      if (preferences.categories) user.preferences.categories = preferences.categories;
    }

    // Mark onboarding as complete
    user.onboardingCompleted = true;
    user.onboardingStep = 5; // Profile setup step
    await user.save();

    // Determine redirect based on user type
    const redirect = user.userType === 'creator' ? '/studio/dashboard' : '/dashboard';

    return res.status(200).json({
      data: {
        user: user.toJSON(),
        message: 'Profile setup completed successfully!',
        redirect,
        onboardingCompleted: true,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Profile setup error:', error);
    next(error);
  }
}

// Upload profile picture (avatar)
export async function uploadProfilePicture(req, res, next) {
  try {
    const userId = req.userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: { code: 'NO_FILE', message: 'No image file uploaded' }
      });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: { code: 'INVALID_TYPE', message: 'Only JPEG, PNG, GIF, and WEBP images are allowed' }
      });
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds 5MB limit' }
      });
    }

    // Create avatar URL
    const avatarUrl = `/uploads/avatars/${file.filename}`;

    // Update user avatar
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    user.avatar = avatarUrl;
    await user.save();

    return res.status(200).json({
      data: {
        avatar: avatarUrl,
        message: 'Profile picture uploaded successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    next(error);
  }
}

// Skip profile setup (for users who want to skip)
export async function skipProfileSetup(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (!user.onboardingCompleted) {
      user.onboardingCompleted = true;
      user.onboardingStep = 5;
      await user.save();
    }

    const redirect = user.userType === 'creator' ? '/studio/dashboard' : '/dashboard';

    return res.status(200).json({
      data: {
        message: 'Profile setup skipped',
        redirect,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Skip profile setup error:', error);
    next(error);
  }
}
