export const accountRoles = (user = {}) => (
  Array.isArray(user.roles) ? user.roles.map(String) : []
);

export const hasListenerProfile = (user = {}) => Boolean(
  user.id || user._id || user.email || user.username
);

export const hasCreatorCapability = (user = {}) => (
  user.userType === 'creator' || accountRoles(user).includes('creator')
);

const creatorTypeOf = (user = {}) => (
  user.creatorProfile?.creatorType || user.creatorType || ''
);

export const hasCompletedCreatorProfile = (user = {}) => (
  hasCreatorCapability(user) &&
  user.onboardingCompleted === true &&
  Boolean(String(creatorTypeOf(user)).trim())
);

export const canAccessExperience = (user, experience) => {
  if (experience === 'listener') return hasListenerProfile(user);
  if (experience === 'creator') return hasCompletedCreatorProfile(user);
  return false;
};
