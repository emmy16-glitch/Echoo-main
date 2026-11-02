import { PermissionsAndroid, Platform } from 'react-native';

export type LiveAudioServiceInfo = {
  title: string;
  artist?: string;
  broadcastId?: string;
  kind?: 'audio' | 'live' | 'broadcast';
};

type NativeLiveAudioService = {
  start: (title: string, artist: string, broadcastId: string, kind: string) => boolean;
  stop: () => boolean;
};

let nativeModule: NativeLiveAudioService | null = null;

try {
  // Lazy require keeps Expo Go and web working without the native bridge.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireNativeModule } = require('expo-modules-core');
  nativeModule = requireNativeModule(
    'EchooLiveAudioService'
  ) as NativeLiveAudioService;
} catch {
  // The caller treats an unavailable native bridge as a best-effort no-op.
  nativeModule = null;
}

// Android starts a mediaPlayback foreground service. iOS publishes the live
// stream to Now Playing so listeners can see it in Control Center/lock screen.
export async function startLiveAudioService(
  info: LiveAudioServiceInfo
): Promise<boolean> {
  if (!nativeModule || Platform.OS === 'web') return false;
  // Recorded audio already owns the system media session through expo-audio.
  // Only LiveKit listener audio needs this native bridge on iOS.
  if (Platform.OS === 'ios' && info.kind === 'audio') {
    nativeModule.stop();
    return false;
  }
  try {
    return (
      nativeModule.start(
        String(info.title || (info.kind === 'audio' ? 'Playing on Echoo' : 'Live on Echoo')),
        String(info.artist || ''),
        String(info.broadcastId || ''),
        info.kind === 'audio' ? 'audio' : info.kind === 'broadcast' ? 'broadcast' : 'live'
      ) === true
    );
  } catch {
    return false;
  }
}

export async function stopLiveAudioService(): Promise<void> {
  if (!nativeModule || Platform.OS === 'web') return;
  try {
    nativeModule.stop();
  } catch {
    // Stopping is best-effort; a dead service is already stopped.
  }
}

export function isLiveAudioServiceAvailable(): boolean {
  return Platform.OS !== 'web' && nativeModule !== null;
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
