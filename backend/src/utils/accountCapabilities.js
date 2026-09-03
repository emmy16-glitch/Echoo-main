export const userRoles = (user = {}) => (
  Array.isArray(user.roles) ? user.roles.map(String) : []
);

export const hasCreatorCapability = (user = {}) => (
  user.userType === 'creator' || userRoles(user).includes('creator')
);

export const hasCompletedCreatorSetup = (user = {}) => (
  hasCreatorCapability(user) &&
  user.onboardingCompleted === true &&
  Boolean(user.creatorProfile?.creatorType)
);

export const creatorOnboardingStep = (user = {}) => {
  const profile = user.creatorProfile || {};
  if (!profile.creatorType) return 1;
  if (!profile.category) return 2;
  if (profile.creatorType === 'organization' && !profile.about) return 3;
  return 4;
};
