import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { getSessionRevision, subscribeSessionChanges } from '@/src/services/sessionLifecycle';

import { getCurrentUser, hasEchooSession, registerPushToken } from '@/src/services/echooApi';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const registrations = new Map<string, Promise<string | null>>();
export async function registerEchooPushNotifications(options: { requestPermission?: boolean } = {}) {
  const revision = getSessionRevision();
  const key = `${revision}:${options.requestPermission !== false}`;
  const pending = registrations.get(key);
  if (pending) return pending;
  const task = registerDevice(options, revision);
  registrations.set(key, task);
  try { return await task; }
  finally { registrations.delete(key); }
}

async function registerDevice(options: { requestPermission?: boolean }, revision: number) {
  if (Platform.OS === 'web') return null;
  if (!await hasEchooSession()) return null;

  const user = await getCurrentUser();
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
    : options.requestPermission === false ? existing : await Notifications.requestPermissionsAsync();
  if (permissions.status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!token) return null;
  if (getSessionRevision() !== revision) throw new Error('Push registration session changed.');
  await SecureStore.setItemAsync('echoo.devicePushToken', token);

  await registerPushToken({
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  return token;
}

export function startPushRegistrationRecovery() {
  if (Platform.OS === 'web') return () => undefined;
  let disposed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(timer);
    if (disposed || AppState.currentState !== 'active') return;
    void registerEchooPushNotifications({ requestPermission: false }).then(() => { attempt = 0; }).catch(() => {
      if (disposed) return;
      timer = setTimeout(run, Math.min(60_000, 2000 * 2 ** Math.min(attempt++, 5)));
    });
  };
  const appSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') run();
    else clearTimeout(timer);
  });
  const tokenSubscription = Notifications.addPushTokenListener(run);
  const unsubscribeSession = subscribeSessionChanges(run);
  run();
  return () => {
    disposed = true; clearTimeout(timer); appSubscription.remove(); tokenSubscription.remove(); unsubscribeSession();
  };
}
