import { api } from './api.js';
import onboardingService from './onboardingService.js';

export const accountRoles = (user = {}) => (
  Array.isArray(user.roles) ? user.roles.map(String) : []
);

export const hasListenerProfile = (user = {}) => Boolean(
  user.id || user._id || user.email || user.username
);

export const hasCreatorCapability = (user = {}) => (
  user.capabilities?.creator === true ||
  user.userType === 'creator' ||
  accountRoles(user).includes('creator')
);

// Creator/Channel setup is independent from shared Account/Profile onboarding.
// New accounts use setupCompleted. isApproved remains a migration marker only
// because older Echoo creator setup historically wrote that field.
export const hasCompletedCreatorProfile = (user = {}) => {
  if (!hasCreatorCapability(user)) return false;

  const profile = user.creatorProfile || {};
  if (profile.setupCompleted === true) return true;
  if (profile.setupCompleted === false) return false;
  if (profile.isApproved === true) return true;

  const legacyStep = Number(user.onboardingStep);
  return Boolean(
    profile.creatorType &&
    profile.category &&
    user.onboardingCompleted === true &&
    Number.isFinite(legacyStep) &&
    legacyStep >= 5
  );
};

export const canAccessExperience = (user, experience) => {
  if (experience === 'listener') return hasListenerProfile(user);
  if (experience === 'creator') return hasCompletedCreatorProfile(user);
  return false;
};

const currentUserFromResponse = (response) => response?.data?.user || response?.data || null;

export const saveAccountUser = (user) => {
  if (!user || typeof user !== 'object') return null;

  localStorage.setItem('user', JSON.stringify(user));

  // echooRole used to describe which account the user had. That concept no
  // longer exists. Keep active workspace in echooActiveExperience only.
  localStorage.removeItem('echooRole');

  if (user.onboardingCompleted === true) {
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooProfileCompleted', 'true');
  } else if (user.onboardingCompleted === false) {
    localStorage.removeItem('echooOnboardingCompleted');
    localStorage.removeItem('echooProfileCompleted');
  }

  return user;
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
    if (!hasListenerProfile(user)) throw new Error('Listener experience is unavailable.');
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
    if (!user) throw new Error('Unable to start Channel setup.');
    saveUser(user);
  }

  // The signed-in Echoo identity is already complete. Only Channel/Creator
  // setup remains, and switching experiences must never trigger another login.
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooActiveExperience', 'creator');

  return {
    user,
    route: '/?source=switch&experience=creator',
    requiresSetup: true,
  };
};
