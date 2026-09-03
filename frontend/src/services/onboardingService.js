import { apiRequest } from './api.js';

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const hasCompletedProfile = (user = {}) => {
  if (typeof user.profileCompleted === 'boolean') return user.profileCompleted;
  return user.onboardingCompleted === true;
};

const saveUser = (user) => {
  if (!user) return null;

  const mergedUser = {
    ...getStoredUser(),
    ...user,
  };

  localStorage.setItem('user', JSON.stringify(mergedUser));

  if (hasCompletedProfile(mergedUser)) {
    localStorage.setItem('echooProfileCompleted', 'true');
    // Legacy compatibility only. Creator setup must never clear this shared
    // account-completion marker.
    localStorage.setItem('echooOnboardingCompleted', 'true');
  } else {
    localStorage.removeItem('echooProfileCompleted');
    localStorage.removeItem('echooOnboardingCompleted');
  }

  // `echooRole` used to choose an account identity. It is intentionally no
  // longer written; Creator and Listener are experiences on one account.
  localStorage.removeItem('echooRole');

  return mergedUser;
};

const onboardingService = {
  getStatus: async () => {
    const response = await apiRequest('/onboarding/status');
    if (response?.data?.user) saveUser(response.data.user);
    return response;
  },

  updateProfile: async (userId, data) => {
    if (!userId) {
      throw new Error('User ID is missing. Please sign in again.');
    }

    const response = await apiRequest(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        bio: data.bio ?? '',
        avatar: data.avatar ?? null,
        ...(data.displayName ? { displayName: data.displayName } : {}),
      }),
    });

    if (response?.data) saveUser(response.data);
    return response;
  },

  completeProfile: async (data) => {
    const response = await apiRequest('/onboarding/profile-setup', {
      method: 'POST',
      body: JSON.stringify({
        displayName: data.displayName,
        bio: data.bio ?? '',
        avatar: data.avatar ?? null,
      }),
    });

    if (response?.data?.user) saveUser(response.data.user);
    return response;
  },

  activateCreator: async () => {
    const response = await apiRequest('/onboarding/activate-creator', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (response?.data?.user) saveUser(response.data.user);
    return response;
  },

  chooseCreatorType: async (data) => {
    const response = await apiRequest('/onboarding/choose-creator-type', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (response?.data?.user) saveUser(response.data.user);
    return response;
  },

  updateContentInfo: async ({ category, contentDescription, genres = [] }) => {
    const response = await apiRequest('/onboarding/content-info', {
      method: 'POST',
      body: JSON.stringify({
        category,
        contentDescription,
        genres,
      }),
    });

    if (response?.data?.user) saveUser(response.data.user);
    return response;
  },

  updateOrganizationDetails: async (data) => {
    const response = await apiRequest('/onboarding/organization-details', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (response?.data?.user) saveUser(response.data.user);
    return response;
  },

  complete: async () => {
    const response = await apiRequest('/onboarding/complete', {
      method: 'POST',
    });

    if (response?.data?.user) saveUser(response.data.user);
    return response;
  },

  refreshStatus: async () => onboardingService.getStatus(),

  getLocalUser: () => getStoredUser(),

  isLocallyCompleted: () => hasCompletedProfile(getStoredUser()),

  clearOnboardingCache: () => {
    localStorage.removeItem('echooRole');
    localStorage.removeItem('echooOnboardingCompleted');
    localStorage.removeItem('echooProfileCompleted');
  },

  saveUser,
};

export default onboardingService;
