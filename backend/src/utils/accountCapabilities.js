export const userRoles = (user = {}) => (
  Array.isArray(user.roles) ? user.roles.map(String) : []
);

export const hasCreatorCapability = (user = {}) => (
  user.capabilities?.creator === true ||
  user.userType === 'creator' ||
  userRoles(user).includes('creator')
);

// Creator setup is separate from the shared Echoo Account/Profile onboarding.
// New records always get an explicit setupCompleted value when Creator is
// activated. Legacy creator records did not have that flag, so only a creator
// that already has the minimum Channel identity (type + category) and had
// completed the old onboarding flow is treated as ready for Creator Studio.
export const hasCompletedCreatorSetup = (user = {}) => {
  if (!hasCreatorCapability(user)) return false;

  const profile = user.creatorProfile || {};
  if (profile.setupCompleted === true) return true;
  if (profile.setupCompleted === false) return false;

  return Boolean(
    profile.creatorType &&
    profile.category &&
    user.onboardingCompleted === true
  );
};

export const creatorOnboardingStep = (user = {}) => {
  const profile = user.creatorProfile || {};
  if (!profile.creatorType) return 1;
  if (!profile.category) return 2;
  if (profile.creatorType === 'organization' && !profile.about) return 3;
  return 4;
};

export const accountCapabilities = (user = {}) => ({
  listener: true,
  creator: hasCreatorCapability(user),
});
