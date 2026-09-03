export const userRoles = (user = {}) => (
  Array.isArray(user.roles) ? user.roles.map(String) : []
);

export const hasCreatorCapability = (user = {}) => (
  user.capabilities?.creator === true ||
  user.userType === 'creator' ||
  userRoles(user).includes('creator')
);

// Creator setup is separate from the shared Echoo account onboarding state.
// setupCompleted is supported for future records, while isApproved is the
// existing persisted completion marker used by Creator setup today.
export const hasCompletedCreatorSetup = (user = {}) => {
  if (!hasCreatorCapability(user)) return false;

  const profile = user.creatorProfile || {};
  if (profile.setupCompleted === true) return true;
  if (profile.setupCompleted === false) return false;
  if (profile.isApproved === true) return true;
  if (profile.isApproved === false && (profile.creatorType || profile.category)) return false;

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
