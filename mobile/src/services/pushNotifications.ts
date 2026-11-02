import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getCurrentUser, registerPushToken } from '@/src/services/echooApi';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerEchooPushNotifications() {
  if (Platform.OS === 'web') return null;

  const user = await getCurrentUser().catch(() => null);
  if (!user) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('live-alerts', {
      name: 'Live broadcasts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 150, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const permissions = existing.status === 'granted'
    ? existing
    : await Notifications.requestPermissionsAsync();
  if (permissions.status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!token) return null;

  await registerPushToken({
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  return token;
}
