const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';
const LIVE_APP_URL = 'https://echoo.digi02.org';
const SAFE_PROTOCOLS = new Set(['https:', 'http:']);

let mainWindow;

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'Echoo Broadcast Studio',
    icon: path.join(__dirname, 'build', 'icons', '512x512.png'),
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
    if (isEchooUrl(url)) {
      loadEchoo(url);
    } else {
      void openExternalSafely(url);
    }
    return { action: 'deny' };
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
        { label: 'Open Echoo', accelerator: 'CmdOrCtrl+O', click: () => loadEchoo() },
        { label: 'Refresh room', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { type: 'separator' },
        ...(process.platform === 'darwin' ? [{ role: 'services' }, { type: 'separator' }] : []),
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
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
        { role: 'selectAll' }
      ]
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
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Open Echoo on the web',
          click: async () => {
            await openExternalSafely(LIVE_APP_URL);
          }
        },
        {
          label: 'Report an issue',
          click: async () => {
            await openExternalSafely('https://github.com/effiukp/Echoo-main/issues');
          },
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
