import { apiRequest } from './api.js';

const normalizeNotification = (item) => {
  if (!item) return null;
  return {
    ...item,
    id: item.id || item._id || null,
    read: Boolean(item.read),
    createdAt: item.createdAt || null,
  };
};

const notificationService = {
  list: async ({ page = 1, limit = 50, unreadOnly = false } = {}) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      unreadOnly: String(Boolean(unreadOnly)),
    });

    const response = await apiRequest(`/notifications?${params.toString()}`);
    const raw = Array.isArray(response?.data?.notifications)
      ? response.data.notifications
      : [];

    return {
      ...response,
      data: {
        notifications: raw.map(normalizeNotification).filter(Boolean),
        unreadCount: Number(response?.data?.unreadCount) || 0,
        pagination: response?.data?.pagination || {},
      },
    };
  },

  markRead: async (notificationId) => {
    return apiRequest(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'PATCH' }
    );
  },

  markAllRead: async () => {
    return apiRequest('/notifications/read-all', { method: 'PATCH' });
  },

  remove: async (notificationId) => {
    return apiRequest(`/notifications/${encodeURIComponent(notificationId)}`, {
      method: 'DELETE',
    });
  },
};

export default notificationService;
