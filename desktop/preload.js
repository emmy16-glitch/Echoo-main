const { contextBridge, ipcRenderer } = require('electron');

const DESKTOP_NOTIFICATION_EVENT_KEYS = ['message', 'roomStarted', 'roomEnded'];

function toNotificationPreferencesUpdate(value) {
  const update = {};
  if (typeof value?.notificationsEnabled === 'boolean') {
    update.notificationsEnabled = value.notificationsEnabled;
  }

  if (value?.notificationEvents && typeof value.notificationEvents === 'object' && !Array.isArray(value.notificationEvents)) {
    update.notificationEvents = {};
    for (const key of DESKTOP_NOTIFICATION_EVENT_KEYS) {
      if (typeof value.notificationEvents[key] === 'boolean') {
        update.notificationEvents[key] = value.notificationEvents[key];
      }
    }
  }
  return update;
}

contextBridge.exposeInMainWorld('echooDesktop', {
  isDesktop: true,
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('desktop:get-app-info'),
  reload: () => ipcRenderer.invoke('desktop:reload'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  setRoomState: (state) => ipcRenderer.invoke('desktop:set-room-state', state),
  getRoomState: () => ipcRenderer.invoke('desktop:get-room-state'),
  getNotificationPreference: () => ipcRenderer.invoke('desktop:get-notification-preference'),
  setNotificationPreference: (enabled) => ipcRenderer.invoke('desktop:set-notification-preference', enabled === true),
  getNotificationPreferences: () => ipcRenderer.invoke('desktop:get-notification-preferences'),
  setNotificationPreferences: (preferences) =>
    ipcRenderer.invoke('desktop:set-notification-preferences', toNotificationPreferencesUpdate(preferences)),
  notify: (event) => ipcRenderer.invoke('desktop:notify', event),
  onRoomCommand: (listener) => {
    const handler = (_event, command) => listener(command);
    ipcRenderer.on('desktop:room-command', handler);
    return () => ipcRenderer.removeListener('desktop:room-command', handler);
  },
});

console.log('[Echoo Desktop] Native bridge initialized');
