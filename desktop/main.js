const { app, BrowserWindow, Menu, shell, ipcMain, Notification, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';
const LIVE_APP_URL = 'https://echoo.digi02.org';
const SAFE_PROTOCOLS = new Set(['https:', 'http:']);
const TRAY_ICON = path.join(__dirname, 'build', 'icons', '512x512.png');
const NOTIFICATION_COPY = {
  message: 'A new message arrived in your live room.',
  'room-started': 'Your live room is now active.',
  'room-ended': 'Your live room has ended.',
};
const NOTIFICATION_EVENT_KEYS = Object.freeze({
  message: 'message',
  'room-started': 'roomStarted',
  'room-ended': 'roomEnded',
});
const DEFAULT_NOTIFICATION_EVENTS = Object.freeze({
  message: true,
  roomStarted: true,
  roomEnded: true,
});

let mainWindow;
let tray;
let isQuitting = false;
let notificationPreferences = {
  notificationsEnabled: false,
  notificationEvents: { ...DEFAULT_NOTIFICATION_EVENTS },
};
let roomState = {
  active: false,
  muted: false,
  canToggleMute: false,
};

function notificationPreferencePath() {
  return path.join(app.getPath('userData'), 'desktop-preferences.json');
}

function copyNotificationPreferences() {
  return {
    notificationsEnabled: notificationPreferences.notificationsEnabled,
    notificationEvents: { ...notificationPreferences.notificationEvents },
  };
}

function normalizeNotificationEvents(value) {
  const events = { ...DEFAULT_NOTIFICATION_EVENTS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return events;

  for (const key of Object.keys(DEFAULT_NOTIFICATION_EVENTS)) {
    if (typeof value[key] === 'boolean') events[key] = value[key];
  }
  return events;
}

function loadNotificationPreference() {
  try {
    const stored = JSON.parse(fs.readFileSync(notificationPreferencePath(), 'utf8'));
    notificationPreferences = {
      notificationsEnabled: stored?.notificationsEnabled === true,
      notificationEvents: normalizeNotificationEvents(stored?.notificationEvents),
    };
  } catch {
    notificationPreferences = {
      notificationsEnabled: false,
      notificationEvents: { ...DEFAULT_NOTIFICATION_EVENTS },
    };
  }
}

function persistNotificationPreferences(nextPreferences) {
  try {
    const preferencePath = notificationPreferencePath();
    const temporaryPath = `${preferencePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(nextPreferences), 'utf8');
    fs.renameSync(temporaryPath, preferencePath);
    notificationPreferences = nextPreferences;
    updateTrayMenu();
    return true;
  } catch {
    return false;
  }
}

function setNotificationPreferences(update) {
  const nextPreferences = copyNotificationPreferences();
  if (typeof update?.notificationsEnabled === 'boolean') {
    nextPreferences.notificationsEnabled = update.notificationsEnabled;
  }

  const requestedEvents = update?.notificationEvents;
  if (requestedEvents && typeof requestedEvents === 'object' && !Array.isArray(requestedEvents)) {
    for (const key of Object.keys(DEFAULT_NOTIFICATION_EVENTS)) {
      if (typeof requestedEvents[key] === 'boolean') {
        nextPreferences.notificationEvents[key] = requestedEvents[key];
      }
    }
  }

  persistNotificationPreferences(nextPreferences);
  return copyNotificationPreferences();
}

function setNotificationPreference(enabled) {
  return setNotificationPreferences({ notificationsEnabled: enabled === true }).notificationsEnabled;
}

function notificationsAreEnabled() {
  return notificationPreferences.notificationsEnabled === true;
}

function isNotificationEventEnabled(type) {
  const preferenceKey = NOTIFICATION_EVENT_KEYS[type];
  return Boolean(preferenceKey && notificationPreferences.notificationEvents[preferenceKey] === true);
}

function getNotificationPreferences() {
  return copyNotificationPreferences();
}

function getStartUrl() {
  return process.env.ECHOO_URL || LIVE_APP_URL;
}

function isEchooUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'echoo.digi02.org' || (isDev && url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function canOpenExternally(value) {
  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function openExternalSafely(value) {
  if (canOpenExternally(value)) {
    await shell.openExternal(value);
  }
}

function loadEchoo(url = getStartUrl()) {
  if (mainWindow && isEchooUrl(url)) {
    mainWindow.loadURL(url);
  }
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function sendRoomCommand(command) {
  if (!roomState.active || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('desktop:room-command', command);
}

const trayActions = {
  open: showMainWindow,
  toggleMute: () => sendRoomCommand('toggle-mute'),
  leaveRoom: () => sendRoomCommand('leave-room'),
};

function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip(
    roomState.active
      ? `Echoo · Live room ${roomState.muted ? 'muted' : 'playing in background'}`
      : 'Echoo Broadcast Studio',
  );

  const roomItems = roomState.active
    ? [
        {
          label: roomState.muted ? 'Unmute live room' : 'Mute live room',
          enabled: roomState.canToggleMute,
          click: trayActions.toggleMute,
        },
        { label: 'Leave live room', click: trayActions.leaveRoom },
        { type: 'separator' },
      ]
    : [];

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Echoo', click: trayActions.open },
    ...(roomState.active ? [{ label: 'Keep room playing in background', enabled: false }] : []),
    ...roomItems,
    { type: 'separator' },
    {
      label: 'Desktop notifications',
      type: 'checkbox',
      checked: notificationsAreEnabled(),
      click: (item) => setNotificationPreference(item.checked),
    },
    { type: 'separator' },
    {
      label: 'Quit Echoo',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function createTray() {
  tray = new Tray(TRAY_ICON);
  updateTrayMenu();
  tray.on('click', showMainWindow);
}

function showDesktopNotification(type) {
  if (!notificationsAreEnabled()) return { shown: false, reason: 'disabled' };
  if (!NOTIFICATION_COPY[type]) return { shown: false, reason: 'unsupported-event' };
  if (!isNotificationEventEnabled(type)) return { shown: false, reason: 'event-disabled' };
  if (!Notification.isSupported()) return { shown: false, reason: 'unsupported' };
  if (mainWindow?.isFocused()) return { shown: false, reason: 'window-focused' };

  const notification = new Notification({
    title: 'Echoo',
    body: NOTIFICATION_COPY[type],
    icon: TRAY_ICON,
  });
  notification.on('click', showMainWindow);
  notification.show();
  return { shown: true, reason: 'shown' };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'Echoo Broadcast Studio',
    icon: TRAY_ICON,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
    backgroundColor: '#F8FBFF',
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  loadEchoo();

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    mainWindow.loadFile(path.join(__dirname, 'offline.html'), {
      query: { reason: errorDescription, url: validatedURL || getStartUrl() },
    });
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isEchooUrl(url)) return;
    event.preventDefault();
    void openExternalSafely(url);
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (isEchooUrl(url)) return;
    event.preventDefault();
    void openExternalSafely(url);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isEchooUrl(url)) loadEchoo(url);
    else void openExternalSafely(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (roomState.active && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const template = [
    {
      label: 'Echoo',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Open Echoo', accelerator: 'CmdOrCtrl+O', click: showMainWindow },
        { label: 'Refresh room', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { type: 'separator' },
        ...(process.platform === 'darwin' ? [{ role: 'services' }, { type: 'separator' }] : []),
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload Echoo', role: 'reload' },
        ...(isDev ? [{ role: 'forceReload' }, { role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' },
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'Open Echoo on the web', click: () => openExternalSafely(LIVE_APP_URL) },
        { label: 'Report an issue', click: () => openExternalSafely('https://github.com/effiukp/Echoo-main/issues') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('desktop:get-app-info', () => ({
  appName: app.getName(),
  appVersion: app.getVersion(),
  platform: process.platform,
  startUrl: getStartUrl(),
}));

ipcMain.handle('desktop:reload', () => {
  mainWindow?.webContents.reload();
});

ipcMain.handle('desktop:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});

ipcMain.handle('desktop:open-external', async (_event, url) => {
  if (typeof url !== 'string' || !canOpenExternally(url)) return false;
  await openExternalSafely(url);
  return true;
});

ipcMain.handle('desktop:set-room-state', (_event, nextState) => {
  roomState = {
    active: Boolean(nextState?.active),
    muted: Boolean(nextState?.muted),
    canToggleMute: Boolean(nextState?.canToggleMute),
  };
  updateTrayMenu();
  return roomState;
});

ipcMain.handle('desktop:get-room-state', () => roomState);
ipcMain.handle('desktop:get-notification-preference', () => notificationsAreEnabled());
ipcMain.handle('desktop:set-notification-preference', (_event, enabled) => setNotificationPreference(enabled));
ipcMain.handle('desktop:get-notification-preferences', () => getNotificationPreferences());
ipcMain.handle('desktop:set-notification-preferences', (_event, update) => setNotificationPreferences(update));
ipcMain.handle('desktop:notify', (_event, payload) => showDesktopNotification(payload?.type));

app.whenReady().then(() => {
  app.setAppUserModelId('org.echoo.desktop');
  loadNotificationPreference();
  createTray();
  createWindow();

  if (process.env.ECHOO_DESKTOP_TEST === '1') {
    globalThis.__echooDesktopTest = {
      invokeTrayAction(action) {
        if (!Object.hasOwn(trayActions, action)) return false;
        trayActions[action]();
        return true;
      },
    };
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
});
