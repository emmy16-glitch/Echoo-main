import { api } from './api.js';
import onboardingService from './onboardingService.js';
import { accountStorageKey } from './accountStorage.js';

export const accountRoles = (user = {}) => (
  Array.isArray(user.roles) ? user.roles.map(String) : []
);

export const hasListenerProfile = (user = {}) => Boolean(
  user.id || user._id || user.email || user.username
);

export const hasCreatorCapability = (user = {}) => Boolean(
  user.capabilities?.creator === true ||
  user.userType === 'creator' ||
  accountRoles(user).includes('creator')
);

export const hasCompletedProfile = (user = {}) => {
  if (typeof user.profileCompleted === 'boolean') return user.profileCompleted;
  return user.onboardingCompleted === true;
};

export const hasCompletedCreatorProfile = (user = {}) => {
  if (!hasCreatorCapability(user)) return false;
  if (typeof user.creatorOnboardingCompleted === 'boolean') {
    return user.creatorOnboardingCompleted;
  }
  return user.onboardingCompleted === true && Boolean(user.creatorProfile?.creatorType);
};

export const canAccessExperience = (user, experience) => {
  if (experience === 'listener') return hasListenerProfile(user) && hasCompletedProfile(user);
  if (experience === 'creator') return hasCompletedCreatorProfile(user);
  return false;
};

const currentUserFromResponse = (response) => response?.data?.user || response?.data || null;

export const saveAccountUser = (user) => {
  if (!user || typeof user !== 'object') return null;
  localStorage.setItem('user', JSON.stringify(user));
  if (hasCompletedProfile(user)) {
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
  } else {
    localStorage.removeItem('echooProfileCompleted');
    localStorage.removeItem('echooOnboardingCompleted');
  }
  return user;
};

export const getStoredExperience = (fallback = 'listener') => {
  const key = accountStorageKey('echooActiveExperience');
  const experience = key ? localStorage.getItem(key) : null;
  return ['creator', 'listener'].includes(experience) ? experience : fallback;
};

export const saveActiveExperience = (experience) => {
  if (!['creator', 'listener'].includes(experience)) return;
  const key = accountStorageKey('echooActiveExperience');
  if (key) localStorage.setItem(key, experience);
  // Remove the old shared-browser key so another account can never inherit it.
  localStorage.removeItem('echooActiveExperience');
};

export const resolveExperienceSwitch = async (
  targetExperience,
  {
    loadCurrentUser = () => api.auth.getCurrentUser(),
    activateCreator = () => onboardingService.activateCreator(),
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
    if (!canAccessExperience(user, 'listener')) {
      throw new Error('Finish your Echoo profile before opening Listener.');
    }
    saveActiveExperience('listener');
    return { user, route: '/listen', requiresSetup: false };
  }

  if (hasCompletedCreatorProfile(user)) {
    saveActiveExperience('creator');
    return { user, route: '/creator-studio', requiresSetup: false };
  }

  if (!hasCreatorCapability(user)) {
    const activationResponse = await activateCreator();
    user = currentUserFromResponse(activationResponse);
    if (!user) throw new Error('Unable to start Channel setup.');
    saveUser(user);
  }

  // Channel setup is part of the same authenticated account. Listener remains
  // the active experience until setup actually completes.
  saveActiveExperience('listener');
  return {
    user,
    route: '/create-channel',
    requiresSetup: true,
  };
};
