const { app, BrowserWindow, Menu, shell, ipcMain, Notification, Tray } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';
const LIVE_APP_URL = 'https://echoo.digi02.org';
const SAFE_PROTOCOLS = new Set(['https:', 'http:']);
const TRAY_ICON = path.join(__dirname, 'build', 'icons', '512x512.png');
const NOTIFICATION_COPY = {
  message: 'A new message arrived in your live room.',
  'room-started': 'Your live room is now active.',
  'room-ended': 'Your live room has ended.',
};

let mainWindow;
let tray;
let isQuitting = false;
let roomState = {
  active: false,
  muted: false,
  canToggleMute: false,
};

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
          click: () => sendRoomCommand('toggle-mute'),
        },
        { label: 'Leave live room', click: () => sendRoomCommand('leave-room') },
        { type: 'separator' },
      ]
    : [];

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Echoo', click: showMainWindow },
    ...(roomState.active ? [{ label: 'Keep room playing in background', enabled: false }] : []),
    ...roomItems,
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
  if (!NOTIFICATION_COPY[type] || !Notification.isSupported() || mainWindow?.isFocused()) {
    return { shown: false };
  }

  const notification = new Notification({
    title: 'Echoo',
    body: NOTIFICATION_COPY[type],
    icon: TRAY_ICON,
  });
  notification.on('click', showMainWindow);
  notification.show();
  return { shown: true };
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
ipcMain.handle('desktop:notify', (_event, payload) => showDesktopNotification(payload?.type));

app.whenReady().then(() => {
  app.setAppUserModelId('org.echoo.desktop');
  createTray();
  createWindow();

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
