import { api } from './api.js';
import onboardingService from './onboardingService.js';
import {
  accountRoles,
  canAccessExperience,
  hasCompletedCreatorProfile,
  hasCreatorCapability,
  hasListenerProfile,
} from './accountCapabilities.js';

export {
  accountRoles,
  canAccessExperience,
  hasCompletedCreatorProfile,
  hasCreatorCapability,
  hasListenerProfile,
};

const currentUserFromResponse = (response) => response?.data?.user || response?.data || null;

export const saveAccountUser = (user) => {
  if (!user || typeof user !== 'object') return null;

  localStorage.setItem('user', JSON.stringify(user));

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

  // Echoo has one account identity. Creator activation only adds capability;
  // Channel setup completes that capability before Creator Studio access.
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooActiveExperience', 'creator');

  return {
    user,
    // The root route intentionally opens Listener discovery for guests and
    // listeners. Sending an activated account there immediately bounces the
    // user back to Listener and leaves them stuck on “Finish Channel setup”.
    // The creator guard owns the incomplete-capability case and renders the
    // Channel setup flow before Creator Studio becomes available.
    route: '/creator-studio',
    requiresSetup: true,
  };
};
