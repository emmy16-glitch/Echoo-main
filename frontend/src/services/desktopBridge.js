const desktop = () => (typeof window !== 'undefined' ? window.echooDesktop : undefined);

export const DESKTOP_NOTIFICATION_EVENTS = Object.freeze({
  message: true,
  roomStarted: true,
  roomEnded: true,
});

export const isEchooDesktop = () => Boolean(desktop()?.isDesktop);

export const setDesktopRoomState = (state) => {
  if (!isEchooDesktop()) return Promise.resolve(null);
  return desktop().setRoomState({
    active: Boolean(state?.active),
    muted: Boolean(state?.muted),
    canToggleMute: Boolean(state?.canToggleMute),
  });
};

export const notifyDesktop = (type) => {
  if (!isEchooDesktop()) return Promise.resolve({ shown: false });
  return desktop().notify({ type });
};

export const getDesktopNotificationPreference = () => {
  if (!isEchooDesktop()) return Promise.resolve(null);
  return desktop().getNotificationPreference();
};

export const setDesktopNotificationPreference = (enabled) => {
  if (!isEchooDesktop()) return Promise.resolve(null);
  return desktop().setNotificationPreference(enabled === true);
};

export const getDesktopNotificationPreferences = () => {
  if (!isEchooDesktop()) return Promise.resolve(null);
  return desktop().getNotificationPreferences();
};

export const setDesktopNotificationPreferences = (preferences) => {
  if (!isEchooDesktop()) return Promise.resolve(null);
  return desktop().setNotificationPreferences(preferences);
};

export const onDesktopRoomCommand = (listener) => {
  if (!isEchooDesktop()) return () => {};
  return desktop().onRoomCommand(listener);
};
