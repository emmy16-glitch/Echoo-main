export const userRoles = (user = {}) => (
  Array.isArray(user.roles) ? user.roles.map(String) : []
);

// Listener access belongs to the Echoo account itself. It is not a role the
// user can lose when Creator capability is enabled.
export const hasListenerCapability = (user = {}) => Boolean(
  user?._id || user?.id || user?.email || user?.username
);

export const hasCreatorCapability = (user = {}) => (
  user.userType === 'creator' || userRoles(user).includes('creator')
);

export const hasCompletedProfileSetup = (user = {}) => {
  if (typeof user.profileCompleted === 'boolean') return user.profileCompleted;

  // Compatibility for accounts created before profile completion was split
  // from Creator onboarding.
  return user.onboardingCompleted === true;
};

export const hasCompletedCreatorSetup = (user = {}) => {
  if (!hasCreatorCapability(user)) return false;

  if (typeof user.creatorOnboardingCompleted === 'boolean') {
    return user.creatorOnboardingCompleted;
  }

  // Existing Creator accounts only have the legacy onboarding flag. Preserve
  // them without requiring a destructive migration.
  return user.onboardingCompleted === true && Boolean(user.creatorProfile?.creatorType);
};

export const creatorOnboardingStep = (user = {}) => {
  const profile = user.creatorProfile || {};
  if (!profile.creatorType) return 1;
  if (!profile.category) return 2;
  if (profile.creatorType === 'organization' && !profile.about) return 3;
  return 4;
};
