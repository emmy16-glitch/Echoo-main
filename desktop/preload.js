const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('echooDesktop', {
  isDesktop: true,
  platform: process.platform,
  // Add more native bridges here if needed
});

console.log('[Echoo Desktop] Native bridge initialized');
