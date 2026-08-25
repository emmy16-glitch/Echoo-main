const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('echooDesktop', {
  isDesktop: true,
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('desktop:get-app-info'),
  reload: () => ipcRenderer.invoke('desktop:reload'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
});

console.log('[Echoo Desktop] Native bridge initialized');
