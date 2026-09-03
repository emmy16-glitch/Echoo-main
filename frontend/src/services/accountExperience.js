import { api } from './api.js';
import onboardingService from './onboardingService.js';

export const accountRoles = (user = {}) => (
  Array.isArray(user.roles) ? user.roles.map(String) : []
);

export const hasListenerProfile = (user = {}) => Boolean(
  user.id || user._id || user.email || user.username
);

export const hasCreatorCapability = (user = {}) => (
  user.userType === 'creator' || accountRoles(user).includes('creator')
);

export const hasCompletedCreatorProfile = (user = {}) => (
  hasCreatorCapability(user) &&
  user.onboardingCompleted === true
);

export const canAccessExperience = (user, experience) => {
  if (experience === 'listener') return hasListenerProfile(user);
  if (experience === 'creator') return hasCompletedCreatorProfile(user);
  return false;
};

const currentUserFromResponse = (response) => response?.data?.user || response?.data || null;

export const saveAccountUser = (user) => {
  if (!user || typeof user !== 'object') return null;
  localStorage.setItem('user', JSON.stringify(user));
  if (user.userType) localStorage.setItem('echooRole', user.userType);
  if (user.onboardingCompleted === true) {
    localStorage.setItem('echooOnboardingCompleted', 'true');
  } else if (user.onboardingCompleted === false) {
    localStorage.removeItem('echooOnboardingCompleted');
  }
  return user;
};

export const resolveExperienceSwitch = async (
  targetExperience,
  {
    loadCurrentUser = () => api.auth.getCurrentUser(),
    activateCreator = () => onboardingService.chooseUserType('creator'),
    saveUser = saveAccountUser,
  } = {}
) => {
  if (!['creator', 'listener'].includes(targetExperience)) {
    throw new Error('Unsupported Echoo experience.');
  }

  const currentResponse = await loadCurrentUser();
  let user = currentUserFromResponse(currentResponse);
  if (!user) throw new Error('Unable to verify this Echoo account.');
  saveUser(user);

  if (targetExperience === 'listener') {
    if (!hasListenerProfile(user)) throw new Error('Listener profile is unavailable.');
    localStorage.setItem('echooActiveExperience', 'listener');
    return { user, route: '/listen', requiresSetup: false };
  }

  if (hasCompletedCreatorProfile(user)) {
    localStorage.setItem('echooActiveExperience', 'creator');
    return { user, route: '/creator-studio', requiresSetup: false };
  }

  if (!hasCreatorCapability(user)) {
    const activationResponse = await activateCreator();
    user = currentUserFromResponse(activationResponse);
    if (!user) throw new Error('Unable to start Creator setup.');
    saveUser(user);
  }

  // Existing authenticated accounts have already completed the shared account
  // identity step; only Creator-specific setup remains.
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooActiveExperience', 'creator');

  return {
    user,
    route: '/?source=switch&experience=creator',
    requiresSetup: true,
  };
};
