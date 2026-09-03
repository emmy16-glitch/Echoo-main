export const userRoles = (user = {}) => (
  Array.isArray(user.roles) ? user.roles.map(String) : []
);

export const hasCreatorCapability = (user = {}) => (
  user.capabilities?.creator === true ||
  user.userType === 'creator' ||
  userRoles(user).includes('creator')
);

// Creator setup is separate from the shared Echoo account onboarding state.
// setupCompleted is supported for future records, while isApproved and the old
// step-5 completion shape preserve creators made before this unification.
export const hasCompletedCreatorSetup = (user = {}) => {
  if (!hasCreatorCapability(user)) return false;

  const profile = user.creatorProfile || {};
  if (profile.setupCompleted === true) return true;
  if (profile.setupCompleted === false) return false;
  if (profile.isApproved === true) return true;

  const legacyStep = Number(user.onboardingStep);
  const hasLegacyStep = Number.isFinite(legacyStep) && legacyStep > 0;

  if (!hasLegacyStep) {
    return Boolean(profile.creatorType && user.onboardingCompleted === true);
  }

  return Boolean(
    profile.creatorType &&
    profile.category &&
    user.onboardingCompleted === true &&
    legacyStep >= 5
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
