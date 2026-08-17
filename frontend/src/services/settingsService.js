import { apiRequest } from './api.js';

const settingsService = {
  get: async () => apiRequest('/settings'),

  updateProfile: async (payload) =>
    apiRequest('/settings/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updatePreferences: async (payload) =>
    apiRequest('/settings/preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

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
