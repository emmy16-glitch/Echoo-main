import {
  getDesktopInitialDeepLink,
  onDesktopDeepLink,
  onDesktopWillQuit,
  quitDesktopReady,
} from './desktopBridge';
import realtimeService from './realtimeService';
import { stopLiveKitPublishing } from './livekitPublisher';

let installed = false;

const applyDesktopRoute = (route) => {
  const candidate = String(route || '').trim();
  if (!/^\/(?:listen|creator-studio|login|register|reset-password)(?:\/|\?|$)/.test(candidate)) {
    return;
  }
  window.location.hash = `#${candidate}`;
};

// Graceful-shutdown handshake for Echoo Desktop: the native shell sends
// 'echoo:will-quit' and waits up to 2s for quitReady() before forcing exit.
// Leave LiveKit + realtime sockets here so a quit mid-broadcast never leaves
// a ghost publisher or dangling socket row on the backend.
export const installDesktopLifecycle = () => {
  if (installed) return () => {};
  if (typeof window === 'undefined' || !window.echooDesktop?.isDesktop) return () => {};
  installed = true;

  const unsubscribeQuit = onDesktopWillQuit(async () => {
    try {
      await Promise.race([
        (async () => {
          try {
            await stopLiveKitPublishing();
          } catch {
            // Publishing may already be stopped — never block shutdown.
          }
          try {
            realtimeService.disconnect();
          } catch {
            // Socket may already be closed — never block shutdown.
          }
        })(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } finally {
      quitDesktopReady();
    }
  });
  const unsubscribeDeepLink = onDesktopDeepLink(applyDesktopRoute);
  void getDesktopInitialDeepLink().then(applyDesktopRoute).catch(() => null);

  return () => {
    installed = false;
    unsubscribeQuit();
    unsubscribeDeepLink();
  };
};
