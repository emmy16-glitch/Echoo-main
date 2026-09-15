'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  ipcMain,
  shell,
  dialog,
  nativeImage,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

// ---------------------------------------------------------------------------
// Logging: electron-log writes to the OS-appropriate log dir
// (~/Library/Logs/Echoo, ~/.config/Echoo/logs, %USERPROFILE%\AppData\Roaming\Echoo\logs)
// and mirrors to console in development.
// ---------------------------------------------------------------------------
log.transports.file.level = 'info';
log.transports.console.level = app.isPackaged ? 'warn' : 'debug';
autoUpdater.logger = log;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
// Vite dev server URL. Single source of truth: VITE_PORT env, else the
// `|| '<port>'` default in frontend/vite.config.js (project-specific 5273 —
// NOT Vite's 5173 default, which collides on shared multi-user machines).
// The desktop `npm run dev` launcher resolves this the same way and waits
// for the server; the gate below is defense-in-depth for direct `npm start`
// use. ECHOO_DEV_URL overrides everything. The frontend runs with
// `--strictPort`, so a squatted port fails loudly at `npm run dev` time
// instead of silently falling back behind our back.
const DEV_URL = process.env.ECHOO_DEV_URL || process.env.ECHOO_URL || 'http://localhost:5273';
// An explicitly provided URL (tests, debugging) is trusted as-is: the
// identity-marker gate below only applies to the default dev port, where a
// squatter may be serving foreign content on a shared machine.
const DEV_URL_IS_EXPLICIT = Boolean(process.env.ECHOO_DEV_URL || process.env.ECHOO_URL);
// How long to wait for the dev server before showing the error screen.
const DEV_WAIT_MS = Number(process.env.DEV_WAIT_MS || '5000');
// Identity marker injected by frontend/index.html (<meta name="echoo-app">).
// Kept in sync with dev-all.sh and scripts/dev-launcher.js. A reachable port
// is not proof on a shared machine — require the marker before loadURL.
const ECHOO_IDENTITY_MARKER = 'name="echoo-app"';

// Production bundle. `npm run dist` ALWAYS rebuilds it first
// ("dist": "npm run build --prefix ../frontend && electron-builder"),
// so packaging can never silently ship a blank window. electron-builder copies
// frontend/dist INTO the packaged app (see the {from,to} entry in the `files`
// array in package.json), so this path resolves inside the asar in prod.
// NOTE: an earlier revision pointed at ../../frontend/dist relative to the
// repo — that 404s in the installed app (resources/frontend/... doesn't exist)
// and was caught by the packaged boot test via did-fail-load.
const PROD_INDEX = path.join(__dirname, '../frontend-dist/index.html');
const OFFLINE_PAGE = path.join(__dirname, 'offline.html');

// DevTools are gated: dev builds, or packaged builds with an explicit opt-in.
const DEBUG_TOOLS =
  !app.isPackaged ||
  process.env.ECHOO_DEBUG === '1' ||
  process.argv.includes('--echoo-debug');

// Origins the app window itself is allowed to navigate to. Everything else
// (chat links, profile links, help URLs) opens in the OS default browser.
function appOrigins() {
  if (!app.isPackaged) {
    try {
      return [new URL(DEV_URL).origin];
    } catch {
      return ['http://localhost:5273'];
    }
  }
  return ['file://'];
}

function isAppUrl(url) {
  const origins = appOrigins();
  if (url.startsWith('file://')) return !app.isPackaged ? false : true;
  return origins.some((origin) => url === origin || url.startsWith(`${origin}/`));
}

let mainWindow = null;
let tray = null;
let roomState = { active: false, muted: false, canToggleMute: false };
let isQuitting = false;
let quitTimer = null;
let backendChild = null;
let trayHideNoticed = false;

// ---------------------------------------------------------------------------
// Bundled backend: the installed app ships its own Echoo API (extraResources)
// and starts it automatically — end users never run `node src/app.js`.
// The server runs via ELECTRON_RUN_AS_NODE (Electron's embedded Node; the
// backend has zero native modules, verified), with cwd pointed at per-user
// app storage so uploads/mongo-data never touch the read-only app bundle.
// If an Echoo API is ALREADY on the port (developer running the repo stack),
// it is reused instead of spawning a second one.
// ---------------------------------------------------------------------------
const BACKEND_PORT = Number(process.env.ECHOO_BACKEND_PORT || '5017');
const BACKEND_HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/health`;

function backendEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'src', 'app.js');
  }
  return path.resolve(__dirname, '../../backend/src/app.js');
}

function serverDataDir() {
  const dir = path.join(app.getPath('userData'), 'server-data');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    log.warn('[echoo-desktop] could not create server data dir:', error.message);
  }
  return dir;
}

// Stable per-machine JWT secrets for the bundled server (stored 0600 in
// userData). The backend's built-in dev default would otherwise be identical
// on every install. Explicit env always wins — this only fills the gap.
function serverSecrets() {
  const file = path.join(app.getPath('userData'), 'echoo-server-secrets.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.jwtSecret && parsed.jwtRefreshSecret) return parsed;
  } catch {
    // Missing or corrupt — generate fresh below.
  }
  const secrets = {
    jwtSecret: crypto.randomBytes(48).toString('hex'),
    jwtRefreshSecret: crypto.randomBytes(48).toString('hex'),
  };
  try {
    fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  } catch (error) {
    log.warn('[echoo-desktop] could not persist server secrets:', error.message);
  }
  return secrets;
}

// Zero-config installs: the packager may bake a LiveKit config into the
// installer (resources/backend/server-defaults.env, via
// scripts/prepare-bundled-backend.js). On first launch it is copied to
// server-data/.env so the bundled backend picks it up. A user-written
// server-data/.env ALWAYS wins — it is never overwritten.
function seedServerEnv(dataDir) {
  try {
    const userEnv = path.join(dataDir, '.env');
    if (fs.existsSync(userEnv)) return;
    const template = path.join(
      app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..'),
      app.isPackaged ? path.join('backend', 'server-defaults.env') : '.bundled-server-env'
    );
    if (!fs.existsSync(template)) return;
    const raw = fs.readFileSync(template, 'utf8').trim();
    if (!raw) return; // built without embedded config — nothing to seed
    fs.writeFileSync(userEnv, `${raw}\n`, { mode: 0o600 });
    log.info('[echoo-desktop] seeded server-data/.env from the installer defaults');
  } catch (error) {
    log.warn('[echoo-desktop] could not seed server .env:', error.message);
  }
}

function fetchBackendHealth(timeoutMs = 2500) {
  return new Promise((resolve) => {
    const lib = require('node:http');
    let settled = false;
    const done = (healthy) => {
      if (!settled) {
        settled = true;
        resolve(healthy);
      }
    };
    const timer = setTimeout(() => {
      req.destroy();
      done(false);
    }, timeoutMs);
    if (timer.unref) timer.unref();
    const req = lib.get(BACKEND_HEALTH_URL, { headers: { Accept: 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        if (body.length <= 64 * 1024) body += chunk.toString('utf8');
      });
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(body);
          done(parsed.status === 'ok' && parsed.service === 'echoo-api');
        } catch {
          done(false);
        }
      });
      res.on('error', () => {
        clearTimeout(timer);
        done(false);
      });
    });
    req.on('error', () => {
      clearTimeout(timer);
      done(false);
    });
  });
}

async function startBundledBackend() {
  if (backendChild) return;
  if (await fetchBackendHealth()) {
    log.info(`[echoo-desktop] Echoo API already on :${BACKEND_PORT} — reusing it, no bundled server started`);
    return;
  }

  const entry = backendEntry();
  if (!fs.existsSync(entry)) {
    log.warn(`[echoo-desktop] bundled backend not found at ${entry} — API-dependent features need a manually started server`);
    return;
  }

  const secrets = serverSecrets();
  const dataDir = serverDataDir();
  seedServerEnv(dataDir);
  try {
    backendChild = spawn(process.execPath, [entry], {
      cwd: dataDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ECHOO_DESKTOP: '1',
        PORT: String(BACKEND_PORT),
        JWT_SECRET: process.env.JWT_SECRET || secrets.jwtSecret,
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || secrets.jwtRefreshSecret,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    backendChild = null;
    log.warn('[echoo-desktop] could not spawn bundled backend:', error.message);
    return;
  }

  log.info(`[echoo-desktop] bundled Echoo API starting (pid ${backendChild.pid}, data: ${dataDir})`);
  backendChild.stdout?.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim()) log.info(`[backend] ${line.trim()}`);
    }
  });
  backendChild.stderr?.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim()) log.warn(`[backend] ${line.trim()}`);
    }
  });
  backendChild.on('error', (error) => {
    log.warn('[echoo-desktop] bundled backend process error:', error.message);
    backendChild = null;
  });
  backendChild.on('exit', (code, signal) => {
    log.warn(`[echoo-desktop] bundled backend exited (code ${code}, signal ${signal})`);
    backendChild = null;
  });
}

function stopBundledBackend() {
  const child = backendChild;
  backendChild = null;
  if (!child || child.exitCode !== null) return;
  try {
    child.kill('SIGTERM');
    const killer = setTimeout(() => {
      try {
        if (child.exitCode === null) child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }, 3000);
    if (killer.unref) killer.unref();
  } catch (error) {
    log.warn('[echoo-desktop] could not stop bundled backend:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Single instance: a second launch focuses the existing window instead of
// opening a duplicate instance.
// ---------------------------------------------------------------------------
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    log.info('[echoo-desktop] second launch — focusing existing window');
    showAndFocusWindow();
  });
}

// ---------------------------------------------------------------------------
// Notification preferences (persisted in userData)
// ---------------------------------------------------------------------------
const DEFAULT_NOTIFICATION_EVENTS = Object.freeze({
  message: true,
  roomStarted: true,
  roomEnded: true,
  listenerJoined: true,
});

function prefsFile() {
  return path.join(app.getPath('userData'), 'echoo-desktop-prefs.json');
}

function readPrefs() {
  try {
    const raw = fs.readFileSync(prefsFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      notificationsEnabled: parsed.notificationsEnabled !== false,
      notificationEvents: {
        ...DEFAULT_NOTIFICATION_EVENTS,
        ...(parsed.notificationEvents || {}),
      },
    };
  } catch {
    return {
      notificationsEnabled: true,
      notificationEvents: { ...DEFAULT_NOTIFICATION_EVENTS },
    };
  }
}

function writePrefs(prefs) {
  try {
    fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
    fs.writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2));
  } catch (error) {
    log.warn('[echoo-desktop] could not persist notification prefs:', error.message);
  }
  return prefs;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    resizable: true,
    title: 'Echoo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // MUST stay true — never weaken for convenience
      nodeIntegration: false, // MUST stay false — renderer gets only the bridge
      sandbox: true, // Compatible: preload only uses contextBridge + ipcRenderer
    },
  });

  // External links (chat messages, profile links, help URLs) open in the OS
  // default browser — never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (!isAppUrl(url)) {
        shell.openExternal(url).catch((error) => log.warn('[echoo-desktop] openExternal failed:', error.message));
        return { action: 'deny' };
      }
    } catch (error) {
      log.warn('[echoo-desktop] setWindowOpenHandler error:', error.message);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      shell.openExternal(url).catch((error) => log.warn('[echoo-desktop] openExternal failed:', error.message));
    }
  });

  // Load failure (missing frontend/dist in prod, dev server down in dev) shows
  // a retry/offline page instead of a blank/broken window.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL.includes('offline.html')) return; // already showing it (query string included)
    log.warn(`[echoo-desktop] load failed (${errorCode} ${errorDescription}): ${validatedURL}`);
    mainWindow?.loadFile(OFFLINE_PAGE).catch((error) => {
      log.error('[echoo-desktop] could not load offline page:', error.message);
    });
  });

  if (!app.isPackaged) {
    // Never open a blank window: verify the dev server is actually reachable
    // first (covers the race where Electron starts before Vite, and the case
    // where `npm start` is run without any dev server at all).
    void loadDevUrl();
  } else {
    mainWindow.loadFile(PROD_INDEX);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Media-app behavior: closing the window while a live room is active hides
  // to the tray instead of quitting, so minimizing never kills the audio.
  // Quit explicitly via tray > Quit or File > Quit (those set isQuitting).
  mainWindow.on('close', (event) => {
    if (!isQuitting && roomState.active && mainWindow) {
      event.preventDefault();
      mainWindow.hide();
      if (!trayHideNoticed) {
        trayHideNoticed = true;
        try {
          const notice = new Notification({
            title: 'Echoo keeps playing',
            body: 'The live room moved to the tray. Quit from the tray menu to stop playback.',
          });
          notice.on('click', () => showAndFocusWindow());
          notice.show();
        } catch {
          // Notifications may be unavailable — hiding still worked.
        }
      }
    }
  });

  return mainWindow;
}

function showAndFocusWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } catch (error) {
    log.warn('[echoo-desktop] showAndFocusWindow failed:', error.message);
  }
}

function sendRoomCommand(command) {
  try {
    mainWindow?.webContents.send('echoo:room-command', command);
  } catch (error) {
    log.warn('[echoo-desktop] sendRoomCommand failed:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Dev-server reachability gate (dev only — Bug 1 fix)
// ---------------------------------------------------------------------------
// A TCP-level check with a short retry loop: proves the Vite server is live
// before loadURL, instead of showing a blank window when the port is dead or
// squatted. Any listening socket counts as "up" (even a non-Vite squatter —
// that misconfiguration surfaces visibly as the wrong content, never a blank
// window — while port conflicts themselves are caught earlier by the `predev`
// port check and `--strictPort`, which fail loudly).
function isTcpReachable(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function waitForDevServer(devUrl, totalMs) {
  let parsed;
  try {
    parsed = new URL(devUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  const host = parsed.hostname || 'localhost';
  const port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
  const deadline = Date.now() + totalMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    if (await isTcpReachable(host, port)) return true;
    if (Date.now() >= deadline) return false;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }
}

// Loads the dev URL if reachable AND identifiably Echoo; otherwise shows the
// offline page with a specific error instead of a blank window (unreachable)
// or, worse, somebody else's app (reachable but foreign content).
async function loadDevUrl() {
  if (!mainWindow) return;
  try {
    if (await waitForDevServer(DEV_URL, DEV_WAIT_MS)) {
      if (DEV_URL_IS_EXPLICIT) {
        await mainWindow.loadURL(DEV_URL);
        return;
      }
      const identity = await fetchDevIdentity(DEV_URL);
      if (identity === true) {
        await mainWindow.loadURL(DEV_URL);
        return;
      }
      log.warn(`[echoo-desktop] dev URL responded but is not Echoo (no identity marker): ${DEV_URL}`);
      await mainWindow.loadFile(OFFLINE_PAGE, {
        query: { reason: 'foreign-content', url: DEV_URL },
      });
      return;
    }
  } catch (error) {
    log.warn('[echoo-desktop] dev URL load threw:', error.message);
  }
  log.warn(`[echoo-desktop] dev server not reachable at ${DEV_URL} after ${DEV_WAIT_MS}ms — showing error screen`);
  try {
    await mainWindow.loadFile(OFFLINE_PAGE, {
      query: { reason: 'dev-unreachable', url: DEV_URL },
    });
  } catch (error) {
    log.error('[echoo-desktop] could not load offline page:', error.message);
  }
}

// Fetch up to 128KB of the dev server's `/` and require the Echoo identity
// marker. Resolves true only for genuine Echoo content, false for foreign
// content or fetch failures. Main-process twin of the dev-launcher check.
function fetchDevIdentity(devUrl, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(devUrl);
    } catch {
      resolve(false);
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve(true);
      return;
    }
    const lib = parsed.protocol === 'https:' ? require('node:https') : require('node:http');
    let settled = false;
    const done = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    const timer = setTimeout(() => {
      req.destroy();
      done(false);
    }, timeoutMs);
    // Avoid keeping the app alive on this timer if everything else is done.
    if (timer.unref) timer.unref();
    const req = lib.get(
      {
        hostname: parsed.hostname || 'localhost',
        port: Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80),
        path: '/',
        headers: { Accept: 'text/html' },
      },
      (res) => {
        let chunks = 0;
        let body = '';
        res.on('data', (chunk) => {
          chunks += chunk.length;
          if (chunks <= 128 * 1024) body += chunk.toString('utf8');
        });
        res.on('end', () => {
          clearTimeout(timer);
          done(body.includes(ECHOO_IDENTITY_MARKER));
        });
        res.on('error', () => {
          clearTimeout(timer);
          done(false);
        });
      }
    );
    req.on('error', () => {
      clearTimeout(timer);
      done(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Content-Security-Policy (production only)
// ---------------------------------------------------------------------------
// The built frontend needs NO unsafe-inline / unsafe-eval: index.html has no
// inline scripts (verified), no CSS-in-JS or eval() in the bundles, and React
// inline `style={}` props go through CSSOM (not blocked by CSP). Dev is left
// alone so Vite HMR / React DevTools keep working.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  'img-src \'self\' data: blob: https: http://localhost:5017 http://127.0.0.1:5017',
  'media-src \'self\' blob: data: https: http://localhost:5017 http://127.0.0.1:5017',
  // localhost: API + socket.io (project-specific backend port 5017);
  // https:/wss: for LiveKit Cloud (deployment-specific hosts).
  'connect-src \'self\' http://localhost:5017 ws://localhost:5017 http://127.0.0.1:5017 ws://127.0.0.1:5017 https: wss:',
  "worker-src 'self' blob:",
  'child-src blob:',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function installProdCsp() {
  try {
    const { session } = require('electron');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // Only stamp file:// app responses; never touch remote content.
      if (details.url.startsWith('file://')) {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [PROD_CSP],
          },
        });
      } else {
        callback({});
      }
    });
    log.info('[echoo-desktop] production CSP installed');
  } catch (error) {
    log.warn('[echoo-desktop] could not install CSP:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Native menu: macOS convention (app menu with product name first) vs
// Windows/Linux convention (File > Quit, Help > About).
// ---------------------------------------------------------------------------
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];

  if (isMac) {
    template.push({
      label: 'Echoo',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? [{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }]
        : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
    ],
  });

  const viewSubmenu = [
    { role: 'reload' },
    { role: 'forceReload' },
    ...(DEBUG_TOOLS ? [{ role: 'toggleDevTools' }] : []),
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
  template.push({ label: 'View', submenu: viewSubmenu });

  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
    ],
  });

  const helpSubmenu = [
    {
      label: 'Echoo Support & Docs',
      click: async () => {
        await shell.openExternal('https://github.com/emmy16-glitch/Echoo-main');
      },
    },
  ];
  if (!isMac) {
    helpSubmenu.push({ type: 'separator' }, { role: 'about' });
  }
  template.push({ role: 'help', submenu: helpSubmenu });

  if (!isMac) {
    template.unshift({
      label: 'File',
      submenu: [{ role: 'quit' }],
    });
  }

  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } catch (error) {
    log.warn('[echoo-desktop] could not set application menu:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Tray (with room-state actions + macOS dark-mode-aware template icon)
// ---------------------------------------------------------------------------
function resolveTrayIcon() {
  const dir = path.join(__dirname, '../assets');
  if (process.platform === 'darwin') {
    for (const name of ['tray-iconTemplate.png', 'tray-icon.png']) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return { path: p, template: name.includes('Template') };
    }
    return null;
  }
  for (const name of ['tray-icon.png', 'trayIcon.png', 'icon.png']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return { path: p, template: false };
  }
  return null;
}

function buildTrayMenu() {
  const items = [{ label: 'Show Echoo', click: () => showAndFocusWindow() }];
  if (roomState.active) {
    items.push({ type: 'separator' });
    if (roomState.canToggleMute) {
      items.push({
        label: roomState.muted ? 'Unmute room audio' : 'Mute room audio',
        click: () => {
          showAndFocusWindow();
          sendRoomCommand('toggle-mute');
        },
      });
    }
    items.push({
      label: 'Leave live room',
      click: () => {
        showAndFocusWindow();
        sendRoomCommand('leave-room');
      },
    });
  }
  items.push({ type: 'separator' }, { label: 'Quit', click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}

function refreshTrayMenu() {
  try {
    tray?.setContextMenu(buildTrayMenu());
  } catch (error) {
    log.warn('[echoo-desktop] could not refresh tray menu:', error.message);
  }
}

function createTray() {
  if (tray) return tray;

  const resolved = resolveTrayIcon();
  let image;
  if (resolved) {
    image = nativeImage.createFromPath(resolved.path);
    // Template images let macOS tint the menu-bar icon for light/dark mode.
    if (resolved.template) image.setTemplateImage(true);
  } else {
    image = nativeImage.createEmpty();
    log.warn('[echoo-desktop] no tray icon under desktop/assets/ — using empty placeholder');
  }

  try {
    tray = new Tray(image);
  } catch (error) {
    log.error('[echoo-desktop] could not create tray:', error.message);
    return null;
  }
  tray.setToolTip('Echoo');
  tray.setContextMenu(buildTrayMenu());

  // Clicking the tray icon itself toggles window visibility.
  tray.on('click', () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      showAndFocusWindow();
    }
  });

  return tray;
}

// ---------------------------------------------------------------------------
// IPC: native notifications
// ---------------------------------------------------------------------------
// Renderer calls notifyDesktop(type) from frontend/src/services/desktopBridge.js
// at real trigger points: chat:message (listener + creator rooms),
// broadcast:status live transitions, presence listener joins.
// Neutral copy only — room/message content stays private while in background.
const NOTIFICATION_COPY = {
  message: { title: 'Echoo', body: 'New chat message in the live room.' },
  roomStarted: { title: 'Echoo', body: 'A station you follow just went live.' },
  roomEnded: { title: 'Echoo', body: 'The live room has ended.' },
  listenerJoined: { title: 'Echoo', body: 'A new listener joined your broadcast.' },
};

function normalizeNotificationType(type) {
  const t = String(type || '').toLowerCase().replace(/_/g, '-');
  const aliases = {
    'room-started': 'roomStarted',
    'roomstarted': 'roomStarted',
    'room-ended': 'roomEnded',
    'roomended': 'roomEnded',
    'listener-joined': 'listenerJoined',
    'listenerjoined': 'listenerJoined',
    message: 'message',
  };
  return aliases[t] || null;
}

function showNotification({ title, body, silent }) {
  const notification = new Notification({ title, body, silent: silent === true });
  // Click-through: focusing/restoring the main window, like tray "Show Echoo".
  notification.on('click', () => showAndFocusWindow());
  notification.show();
}

function registerIpc() {
  ipcMain.handle('echoo:get-app-info', async () => {
    try {
      return {
        ok: true,
        appName: app.getName(),
        appVersion: app.getVersion(),
        platform: process.platform,
        startUrl: DEV_URL,
      };
    } catch (error) {
      log.warn('[echoo-desktop] get-app-info failed:', error.message);
      return { ok: false };
    }
  });

  ipcMain.handle('echoo:get-room-state', async () => {
    try {
      return { ...roomState };
    } catch (error) {
      log.warn('[echoo-desktop] get-room-state failed:', error.message);
      return { ...roomState };
    }
  });

  ipcMain.handle('echoo:notify', async (_event, options = {}) => {
    try {
      const prefs = readPrefs();
      if (prefs.notificationsEnabled !== true) return { shown: false, reason: 'disabled' };
      if (!Notification.isSupported()) return { shown: false, reason: 'notifications-unsupported' };

      let title = 'Echoo';
      let body = '';
      if (options && typeof options.type === 'string') {
        const key = normalizeNotificationType(options.type);
        if (!key) return { shown: false, reason: 'unknown-type' };
        if (prefs.notificationEvents[key] !== true) return { shown: false, reason: 'event-disabled' };
        ({ title, body } = NOTIFICATION_COPY[key]);
      } else {
        title = typeof options.title === 'string' && options.title ? options.title : 'Echoo';
        body = typeof options.body === 'string' ? options.body : '';
      }

      showNotification({ title, body, silent: options.silent === true });
      return { shown: true };
    } catch (error) {
      log.warn('[echoo-desktop] echoo:notify failed:', error.message);
      return { shown: false, reason: 'error' };
    }
  });

  ipcMain.handle('echoo:get-notification-preferences', async () => {
    try {
      return readPrefs();
    } catch (error) {
      log.warn('[echoo-desktop] get-notification-preferences failed:', error.message);
      return { notificationsEnabled: true, notificationEvents: { ...DEFAULT_NOTIFICATION_EVENTS } };
    }
  });

  ipcMain.handle('echoo:set-notification-preferences', async (_event, update = {}) => {
    try {
      const prefs = readPrefs();
      if (typeof update.notificationsEnabled === 'boolean') {
        prefs.notificationsEnabled = update.notificationsEnabled;
      }
      if (update.notificationEvents && typeof update.notificationEvents === 'object') {
        for (const key of Object.keys(DEFAULT_NOTIFICATION_EVENTS)) {
          if (typeof update.notificationEvents[key] === 'boolean') {
            prefs.notificationEvents[key] = update.notificationEvents[key];
          }
        }
      }
      return writePrefs(prefs);
    } catch (error) {
      log.warn('[echoo-desktop] set-notification-preferences failed:', error.message);
      return readPrefs();
    }
  });

  // Back-compat singular aliases.
  ipcMain.handle('echoo:get-notification-preference', async () => {
    const prefs = readPrefs();
    return { notificationsEnabled: prefs.notificationsEnabled };
  });
  ipcMain.handle('echoo:set-notification-preference', async (_event, enabled) => {
    const prefs = readPrefs();
    prefs.notificationsEnabled = enabled === true;
    return { notificationsEnabled: writePrefs(prefs).notificationsEnabled };
  });

  ipcMain.handle('echoo:set-room-state', async (_event, state = {}) => {
    try {
      roomState = {
        active: state.active === true,
        muted: state.muted === true,
        canToggleMute: state.canToggleMute === true,
      };
      refreshTrayMenu();
      return { ...roomState };
    } catch (error) {
      log.warn('[echoo-desktop] set-room-state failed:', error.message);
      return { ...roomState };
    }
  });

  // --- Auto-launch on system startup (optional toggle) ---------------------
  // NOTE: setLoginItemSettings is a no-op inside sandboxed Linux packaging
  // (Snap/Flatpak strict confinement blocks login-item registration). Our
  // build target is AppImage, which is NOT sandboxed that way, so this works
  // there — if the target ever changes to Snap/Flatpak this will silently do
  // nothing and needs a .desktop autostart-file approach instead.
  ipcMain.handle('echoo:set-auto-launch', async (_event, enabled) => {
    try {
      const openAtLogin = enabled === true;
      app.setLoginItemSettings({ openAtLogin });
      return { openAtLogin };
    } catch (error) {
      log.warn('[echoo-desktop] set-auto-launch failed:', error.message);
      return { openAtLogin: false };
    }
  });

  ipcMain.handle('echoo:get-auto-launch', async () => {
    try {
      const { openAtLogin } = app.getLoginItemSettings();
      return { openAtLogin: !!openAtLogin };
    } catch (error) {
      log.warn('[echoo-desktop] get-auto-launch failed:', error.message);
      return { openAtLogin: false };
    }
  });

  ipcMain.handle('echoo:reload', async () => {
    try {
  if (DEV_URL_IS_EXPLICIT) {
    // Test/debug override (also honored in packaged builds so the packaged
    // boot test can point at a fixture server).
    void loadDevUrl();
  } else if (!app.isPackaged) {
        await loadDevUrl();
      } else {
        mainWindow?.loadFile(PROD_INDEX);
      }
      return { ok: true };
    } catch (error) {
      log.warn('[echoo-desktop] reload failed:', error.message);
      return { ok: false };
    }
  });

  // Graceful-shutdown handshake: renderer answers will-quit with quitReady().
  // Creator recording library: ~/Desktop/Echoo Recordings. The renderer asks
  // MP3 vs WAV first, then the native dialog opens in that library folder so
  // every PC copy lands in one place. The server copy is always MP3.
  ipcMain.handle('echoo:save-recording', async (_event, options = {}) => {
    try {
      const format = String(options?.format || 'mp3').toLowerCase() === 'wav' ? 'wav' : 'mp3';
      const rawName = String(options?.filename || `echoo-recording.${format}`)
        .replace(/[\\/:*?"<>|]/g, '-')
        .slice(0, 120) || `echoo-recording.${format}`;
      const filename = rawName.toLowerCase().endsWith(`.${format}`) ? rawName : `${rawName}.${format}`;
      const libraryDir = path.join(app.getPath('desktop'), 'Echoo Recordings');
      await fs.promises.mkdir(libraryDir, { recursive: true });
      const result = await dialog.showSaveDialog(mainWindow, {
        title: `Save recording as ${format.toUpperCase()} — Echoo Recordings`,
        defaultPath: path.join(libraryDir, filename),
        filters: format === 'wav'
          ? [{ name: 'WAV audio', extensions: ['wav'] }, { name: 'All files', extensions: ['*'] }]
          : [{ name: 'MP3 audio', extensions: ['mp3'] }, { name: 'All files', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePath) return { saved: false, cancelled: true };
      const buffer = Buffer.isBuffer(options?.data) ? options.data : Buffer.from(options?.data || []);
      if (!buffer.length) return { saved: false, error: 'Recording bytes are empty.' };
      await fs.promises.writeFile(result.filePath, buffer);
      return { saved: true, path: result.filePath };
    } catch (error) {
      log.warn('[echoo-desktop] save-recording failed:', error.message);
      return { saved: false, error: error?.message || String(error) };
    }
  });

  ipcMain.on('echoo:quit-ready', () => {
    if (quitTimer) {
      clearTimeout(quitTimer);
      quitTimer = null;
    }
    log.info('[echoo-desktop] renderer reported clean shutdown — exiting');
    stopBundledBackend();
    isQuitting = true;
    app.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Auto-updates (GitHub Releases). Non-blocking: failures (offline, no releases
// yet, no network) are logged and never block startup. A 404 for the update
// manifest just means nothing is published for this channel yet — that is
// routine on a fresh repo, so it logs at info instead of warning.
// ---------------------------------------------------------------------------
function isMissingReleaseError(error) {
  const message = String(error?.message || error || '');
  return message.includes('404') || message.includes('latest-linux.yml') || message.includes('latest.yml');
}

function checkForUpdates() {
  if (!app.isPackaged) return; // updater needs a packaged app with update metadata
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', async () => {
      log.info('[echoo-desktop] update downloaded — prompting for restart');
      try {
        const { response } = await dialog.showMessageBox(mainWindow || undefined, {
          type: 'info',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          title: 'Echoo update ready',
          message: 'An Echoo update has been downloaded. Restart now to install it?',
        });
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      } catch (error) {
        log.warn('[echoo-desktop] update prompt failed:', error.message);
      }
    });
    autoUpdater.on('error', (error) => {
      if (isMissingReleaseError(error)) {
        log.info('[echoo-desktop] no published desktop release found — skipping update check');
        return;
      }
      log.warn('[echoo-desktop] update check failed (non-fatal):', error?.message || error);
    });
    autoUpdater.checkForUpdates().catch((error) => {
      if (isMissingReleaseError(error)) {
        log.info('[echoo-desktop] no published desktop release found — skipping update check');
        return;
      }
      log.warn('[echoo-desktop] update check failed (non-fatal):', error?.message || error);
    });
  } catch (error) {
    log.warn('[echoo-desktop] could not start update check (non-fatal):', error.message);
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
function startApp() {
  try {
    registerIpc();
    buildMenu();
    // The window loads immediately (first launch may download the embedded
    // database binary in the background — the UI degrades gracefully until
    // the API answers); the server never blocks the shell from opening.
    void startBundledBackend();
    createWindow();
    createTray();
    if (app.isPackaged) installProdCsp();
    checkForUpdates();

    app.on('activate', () => {
      // macOS: recreate window on dock click when none are open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    log.error('[echoo-desktop] startup failed:', error);
    app.quit();
  }
}

// Graceful shutdown: give the renderer a chance to leave LiveKit rooms and
// close sockets before the process exits (2s grace, then force).
app.on('before-quit', (event) => {
  if (isQuitting || !mainWindow) return;
  event.preventDefault();
  log.info('[echoo-desktop] quit requested — waiting for renderer cleanup');
  try {
    mainWindow.webContents.send('echoo:will-quit');
  } catch (error) {
    log.warn('[echoo-desktop] will-quit send failed:', error.message);
  }
  quitTimer = setTimeout(() => {
    quitTimer = null;
    log.warn('[echoo-desktop] renderer cleanup timed out — forcing quit');
    stopBundledBackend();
    isQuitting = true;
    app.exit(0);
  }, 2000);
  if (quitTimer.unref) quitTimer.unref();
});

app.on('will-quit', () => {
  if (quitTimer) {
    clearTimeout(quitTimer);
    quitTimer = null;
  }
});

process.on('uncaughtException', (error) => {
  log.error('[echoo-desktop] uncaughtException:', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('[echoo-desktop] unhandledRejection:', reason);
});

if (singleInstance) {
  app.whenReady().then(startApp);
}

app.on('window-all-closed', () => {
  // Quit on non-mac; stay alive in dock/tray on macOS.
  if (process.platform !== 'darwin') app.quit();
});
