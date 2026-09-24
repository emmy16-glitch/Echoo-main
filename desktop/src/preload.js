'use strict';

// Preload bridge for the Echoo desktop shell (src/main.js).
// Context-isolated: the renderer gets ONLY window.echooDesktop — no
// nodeIntegration, no raw ipcRenderer. Every method maps 1:1 to an
// `echoo:*` handler registered in src/main.js.

const { contextBridge, ipcRenderer } = require('electron');

const ROOM_COMMAND_CHANNEL = 'echoo:room-command';
const WILL_QUIT_CHANNEL = 'echoo:will-quit';

contextBridge.exposeInMainWorld('echooDesktop', {
  isDesktop: true,
  platform: process.platform,

  getAppInfo: () => ipcRenderer.invoke('echoo:get-app-info'),
  reload: () => ipcRenderer.invoke('echoo:reload'),

  setRoomState: (state) => ipcRenderer.invoke('echoo:set-room-state', {
    active: state?.active === true,
    muted: state?.muted === true,
    canToggleMute: state?.canToggleMute === true,
  }),
  getRoomState: () => ipcRenderer.invoke('echoo:get-room-state'),
  onRoomCommand: (listener) => {
    const handler = (_event, command) => listener(command);
    ipcRenderer.on(ROOM_COMMAND_CHANNEL, handler);
    return () => ipcRenderer.removeListener(ROOM_COMMAND_CHANNEL, handler);
  },

  notify: (options) => ipcRenderer.invoke('echoo:notify', options || {}),
  getNotificationPreferences: () => ipcRenderer.invoke('echoo:get-notification-preferences'),
  setNotificationPreferences: (preferences) =>
    ipcRenderer.invoke('echoo:set-notification-preferences', preferences || {}),
  getNotificationPreference: () => ipcRenderer.invoke('echoo:get-notification-preference'),
  setNotificationPreference: (enabled) =>
    ipcRenderer.invoke('echoo:set-notification-preference', enabled === true),

  getAutoLaunch: () => ipcRenderer.invoke('echoo:get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('echoo:set-auto-launch', enabled === true),

  // Graceful-shutdown handshake: main sends will-quit, renderer answers
  // quitReady() after leaving LiveKit rooms and closing sockets.
  onWillQuit: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(WILL_QUIT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(WILL_QUIT_CHANNEL, handler);
  },
  quitReady: () => ipcRenderer.send('echoo:quit-ready'),

  // Creator recording library. Automatic copies go straight into the
  // organized ~/Desktop/Echoo Recordings/<year>/<month>/ library. Explicit
  // exports keep the native Save dialog.
  saveRecording: (options) => ipcRenderer.invoke('echoo:save-recording', {
    filename: String(options?.filename || ''),
    format: options?.format === 'wav' ? 'wav' : 'mp3',
    data: options?.data,
    automatic: options?.automatic === true,
    startedAt: options?.startedAt || null,
  }),
  openRecordingsFolder: (targetPath = '') =>
    ipcRenderer.invoke('echoo:open-recordings-folder', String(targetPath || '')),
});
