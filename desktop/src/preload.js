'use strict';

// Preload bridge for the Echoo desktop shell (src/main.js).
// Context-isolated: the renderer gets ONLY window.echooDesktop — no
// nodeIntegration, no raw ipcRenderer. Every method maps 1:1 to an
// `echoo:*` handler registered in src/main.js.

const { contextBridge, ipcRenderer } = require('electron');

const ROOM_COMMAND_CHANNEL = 'echoo:room-command';
const WILL_QUIT_CHANNEL = 'echoo:will-quit';
const DEEP_LINK_CHANNEL = 'echoo:deep-link';

contextBridge.exposeInMainWorld('echooDesktop', {
  isDesktop: true,
  platform: process.platform,

  getAppInfo: () => ipcRenderer.invoke('echoo:get-app-info'),
  reload: () => ipcRenderer.invoke('echoo:reload'),
  getInitialDeepLink: () => ipcRenderer.invoke('echoo:get-initial-deep-link'),
  onDeepLink: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = (_event, route) => listener(String(route || ''));
    ipcRenderer.on(DEEP_LINK_CHANNEL, handler);
    return () => ipcRenderer.removeListener(DEEP_LINK_CHANNEL, handler);
  },

  setRoomState: (state) => ipcRenderer.invoke('echoo:set-room-state', {
    active: state?.active === true,
    mode: ['creator', 'listener'].includes(String(state?.mode || '').toLowerCase())
      ? String(state.mode).toLowerCase()
      : 'idle',
    title: String(state?.title || '').slice(0, 120),
    muted: state?.muted === true,
    canToggleMute: state?.canToggleMute === true,
    keepAwake: state?.keepAwake === true,
  }),
  getRoomState: () => ipcRenderer.invoke('echoo:get-room-state'),
  onRoomCommand: (listener) => {
    if (typeof listener !== 'function') return () => {};
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
    if (typeof listener !== 'function') return () => {};
    const handler = () => listener();
    ipcRenderer.on(WILL_QUIT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(WILL_QUIT_CHANNEL, handler);
  },
  quitReady: () => ipcRenderer.send('echoo:quit-ready'),

  // Creator recording library. Automatic copies go straight into the
  // organized ~/Desktop/Echoo Recordings/<year>/<month>/ library. Explicit
  // exports keep the native Save dialog.
  // Long recordings must never cross the Electron bridge as one giant
  // ArrayBuffer. Open one destination, append bounded chunks, then commit.
  beginRecordingSave: (options) => ipcRenderer.invoke('echoo:recording-save-begin', {
    filename: String(options?.filename || ''),
    format: options?.format === 'wav' ? 'wav' : 'mp3',
    automatic: options?.automatic === true,
    startedAt: options?.startedAt || null,
  }),
  appendRecordingChunk: (sessionId, data) =>
    ipcRenderer.invoke('echoo:recording-save-chunk', {
      sessionId: String(sessionId || ''),
      data,
    }),
  finishRecordingSave: (sessionId) =>
    ipcRenderer.invoke('echoo:recording-save-finish', String(sessionId || '')),
  abortRecordingSave: (sessionId) =>
    ipcRenderer.invoke('echoo:recording-save-abort', String(sessionId || '')),

  // Legacy bounded-save entry point kept for compatibility with older
  // renderer bundles. Current builds use the chunked protocol above.
  saveRecording: (options) => ipcRenderer.invoke('echoo:save-recording', {
    filename: String(options?.filename || ''),
    format: options?.format === 'wav' ? 'wav' : 'mp3',
    data: options?.data,
    automatic: options?.automatic === true,
    startedAt: options?.startedAt || null,
  }),
  openRecordingsFolder: (targetPath = '') =>
    ipcRenderer.invoke('echoo:open-recordings-folder', String(targetPath || '')),
  openRecording: (targetPath) =>
    ipcRenderer.invoke('echoo:open-recording', String(targetPath || '')),
  showRecording: (targetPath) =>
    ipcRenderer.invoke('echoo:show-recording', String(targetPath || '')),
  renameRecording: (targetPath, name) =>
    ipcRenderer.invoke('echoo:rename-recording', {
      path: String(targetPath || ''),
      name: String(name || ''),
    }),
  trashRecording: (targetPath) =>
    ipcRenderer.invoke('echoo:trash-recording', String(targetPath || '')),
});
