import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { API_URL, getCurrentUser } from '@/src/services/echooApi';

const ACCESS_TOKEN_KEY = 'echoo.accessToken';

export type EchooNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  icon?: string | null;
  link?: string | null;
  read: boolean;
  readAt?: string | null;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export type NotificationPage = {
  notifications: EchooNotification[];
  unreadCount: number;
};

async function getNativeAccessToken() {
  if (Platform.OS === 'web') return '';

  // This call also exercises Echoo's refresh flow when the access token has expired.
  await getCurrentUser();
  return (await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)) || '';
}

async function notificationRequest(path = '', options: { method?: string } = {}) {
  const accessToken = await getNativeAccessToken();
  if (!accessToken) {
    const error = new Error('Sign in to view Echoo notifications') as Error & {
      code?: string;
      status?: number;
    };
    error.code = 'AUTH_REQUIRED';
    error.status = 401;
    throw error;
  }

  const response = await fetch(`${API_URL}/notifications${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || payload?.message || `Request failed: ${response.status}`
    ) as Error & { code?: string; status?: number };
    error.code = payload?.error?.code || 'REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function getNotifications(limit = 50): Promise<NotificationPage> {
  const payload = await notificationRequest(`?page=1&limit=${Math.max(1, Math.min(100, limit))}`);
  const rawNotifications = Array.isArray(payload?.data?.notifications)
    ? payload.data.notifications
    : [];

  return {
    notifications: rawNotifications.map((item: any): EchooNotification => ({
      id: String(item?.id || item?._id || ''),
      type: String(item?.type || 'system_announcement'),
      title: String(item?.title || 'Echoo notification'),
      message: String(item?.message || ''),
      icon: item?.icon || null,
      link: item?.link || null,
      read: Boolean(item?.read),
      readAt: item?.readAt || null,
      createdAt: item?.createdAt,
      metadata: item?.metadata && typeof item.metadata === 'object' ? item.metadata : {},
    })),
    unreadCount: Number(payload?.data?.unreadCount) || 0,
  };
}

export async function getUnreadNotificationCount() {
  const page = await getNotifications(1);
  return page.unreadCount;
}

export async function markNotificationRead(notificationId: string) {
  if (!notificationId) return;
  await notificationRequest(`/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead() {
  await notificationRequest('/read-all', { method: 'PATCH' });
}

export async function deleteNotification(notificationId: string) {
  if (!notificationId) return;
  await notificationRequest(`/${encodeURIComponent(notificationId)}`, { method: 'DELETE' });
}
