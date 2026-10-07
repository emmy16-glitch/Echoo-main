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

// A mode change is a client-side navigation, not an authentication event.  The
// signed-in user that already owns the current shell is sufficient to move
// between the two experiences when both profiles are complete.  Keep this
// decision separate from the network-backed setup path below so switching
// never waits on /auth/me during a healthy session.
export const resolveCachedExperienceSwitch = (targetExperience, cachedUser) => {
  if (!['creator', 'listener'].includes(targetExperience) || !cachedUser || typeof cachedUser !== 'object') {
    return null;
  }

  if (targetExperience === 'listener' && hasListenerProfile(cachedUser)) {
    return { user: cachedUser, route: '/listen', requiresSetup: false };
  }

  if (targetExperience === 'creator' && hasCompletedCreatorProfile(cachedUser)) {
    return { user: cachedUser, route: '/creator-studio', requiresSetup: false };
  }

  return null;
};

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

  const cachedResult = resolveCachedExperienceSwitch(targetExperience, readStoredAccountUser());
  if (cachedResult) {
    localStorage.setItem('echooActiveExperience', targetExperience);
    return cachedResult;
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

const readStoredAccountUser = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem('user') || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
};
