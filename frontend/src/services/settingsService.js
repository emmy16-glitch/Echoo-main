import { apiRequest } from './api.js';
import { syncThemeFromAccount } from '../theme/themePreference.js';

const settingsService = {
  get: async () => {
    const response = await apiRequest('/settings');
    syncThemeFromAccount(response?.data?.preferences?.theme || 'system');
    return response;
  },

  updateProfile: async (payload) =>
    apiRequest('/settings/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updatePreferences: async (payload) => {
    const response = await apiRequest('/settings/preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    syncThemeFromAccount(response?.data?.preferences?.theme || payload?.theme || 'system');
    window.dispatchEvent(
      new CustomEvent('echoo-preferences-updated', {
        detail: response?.data?.preferences || payload || {},
      })
    );
    return response;
  },

  updateNotifications: async (payload) =>
    apiRequest('/settings/notifications', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updatePassword: async (payload) =>
    apiRequest('/settings/password', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updateEmail: async (payload) =>
    apiRequest('/settings/email', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

export default settingsService;
