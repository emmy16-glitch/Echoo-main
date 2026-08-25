const desktop = () => (typeof window !== 'undefined' ? window.echooDesktop : undefined);

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

export const onDesktopRoomCommand = (listener) => {
  if (!isEchooDesktop()) return () => {};
  return desktop().onRoomCommand(listener);
};
