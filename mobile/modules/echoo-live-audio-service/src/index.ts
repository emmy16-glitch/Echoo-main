import { PermissionsAndroid, Platform } from 'react-native';

export type LiveAudioServiceInfo = {
  title: string;
  artist?: string;
  broadcastId?: string;
};

type NativeLiveAudioService = {
  start: (title: string, artist: string, broadcastId: string) => boolean;
  stop: () => boolean;
};

let nativeModule: NativeLiveAudioService | null = null;

try {
  // Lazy require: the native module is absent on iOS/web/Expo Go, where the
  // service is a no-op by design.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireNativeModule } = require('expo-modules-core');
  nativeModule = requireNativeModule(
    'EchooLiveAudioService'
  ) as NativeLiveAudioService;
} catch {
  // Expo Go / iOS / web: no native module — callers treat `false` as
  // "background service unavailable" and audio simply attempts to play
  // without it (exactly today's behavior, never a regression).
  nativeModule = null;
}

// Starts the Android foreground service (mediaPlayback type) with a
// lock-screen notification. Resolves true when the service accepted the
// request, false when unavailable — best-effort by design.
export async function startLiveAudioService(
  info: LiveAudioServiceInfo
): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule) return false;
  try {
    return (
      nativeModule.start(
        String(info.title || 'Live on Echoo'),
        String(info.artist || ''),
        String(info.broadcastId || '')
      ) === true
    );
  } catch {
    return false;
  }
}

export async function stopLiveAudioService(): Promise<void> {
  if (Platform.OS !== 'android' || !nativeModule) return;
  try {
    nativeModule.stop();
  } catch {
    // Stopping is best-effort; a dead service is already stopped.
  }
}

export function isLiveAudioServiceAvailable(): boolean {
  return Platform.OS === 'android' && nativeModule !== null;
}

// Foreground-service notifications need an explicit runtime grant on
// Android 13+. Ask once per session entry point; a denial only hides the
// notification shade entry — audio keeps playing.
export async function ensureLiveAudioNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
