const { contextBridge, ipcRenderer } = require('electron');

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
  notify: (event) => ipcRenderer.invoke('desktop:notify', event),
  onRoomCommand: (listener) => {
    const handler = (_event, command) => listener(command);
    ipcRenderer.on('desktop:room-command', handler);
    return () => ipcRenderer.removeListener('desktop:room-command', handler);
  },
});

console.log('[Echoo Desktop] Native bridge initialized');
