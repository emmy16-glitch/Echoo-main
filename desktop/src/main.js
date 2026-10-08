'use strict';

const desktopStartupStartedAt = process.hrtime.bigint();

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  ipcMain,
  shell,
  dialog,
  clipboard,
  nativeImage,
  powerSaveBlocker,
  screen,
  protocol,
  desktopCapturer,
  session,
  systemPreferences,
  net: electronNet,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const tcpNet = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { fileURLToPath, pathToFileURL } = require('node:url');
const log = require('electron-log');
const {
  findEchooDeepLink,
  isPathInside,
  normalizeExternalUrl,
  normalizeExternalWebUrl,
  normalizeRoute,
} = require('./main/security');

// ---------------------------------------------------------------------------
// Logging: electron-log writes to the OS-appropriate log dir
// (~/Library/Logs/Echoo, ~/.config/Echoo/logs, %USERPROFILE%\AppData\Roaming\Echoo\logs)
// and mirrors to console in development.
// ---------------------------------------------------------------------------
log.transports.file.level = 'info';
log.transports.console.level = app.isPackaged ? 'warn' : 'debug';
const desktopStartupEvents = [];
let autoUpdater = null;

function getAutoUpdater() {
  if (!autoUpdater) {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.logger = log;
  }
  return autoUpdater;
}

function logStartupEvent(event, details = '') {
  const elapsedMs = Math.max(
    0,
    Math.round(Number(process.hrtime.bigint() - desktopStartupStartedAt) / 1_000_000)
  );
  const entry = { event, elapsedMs };
  desktopStartupEvents.push(entry);
  const suffix = details ? ` ${details}` : '';
  log.info(`[desktop-startup] ${event} +${elapsedMs}ms${suffix}`);
  return entry;
}

logStartupEvent('process-start');

// Keep the installed/runtime product identity user-facing while the internal
// npm package name remains echoo-desktop.
app.setName('Echoo');

// Blank white window on some Windows machines is caused by GPU/blacklisted
// drivers. Opt out of hardware acceleration via ECHOO_DISABLE_GPU=1 or
// --disable-gpu (must run before app.whenReady, hence here at the top).
if (
  process.platform === 'win32' &&
  (process.env.ECHOO_DISABLE_GPU === '1' || process.argv.includes('--disable-gpu'))
) {
  app.disableHardwareAcceleration();
  log.info('[echoo-desktop] hardware acceleration disabled (ECHOO_DISABLE_GPU/--disable-gpu)');
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
// Public website identity is returned for browser/share handoff only. The
// packaged product always renders local application code and connects to the
// shared production platform through its public API contracts.
const PUBLIC_APP_ORIGIN = process.env.ECHOO_PUBLIC_ORIGIN || 'https://echoo.digi02.org';
// Vite dev server URL. Single source of truth: VITE_PORT env, else the
// `|| '<port>'` default in frontend/vite.config.js (project-specific 5273 —
// NOT Vite's 5173 default, which collides on shared multi-user machines).
// The desktop `npm run dev` launcher resolves this the same way and waits
// for the server; the gate below is defense-in-depth for direct `npm start`
// use. ECHOO_DEV_URL overrides everything. The frontend runs with
// `strictPort: false`, so a squatted port may fall back silently at
// `npm run dev` time — the identity-marker gate is what protects Electron
// instead of launching a stranger's page.
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

// Production renderer and startup surfaces are generated/verified before
// electron-builder packages them into the application asar.
const PROD_ROOT = path.resolve(__dirname, '../frontend-dist');
const PROD_INDEX = path.join(PROD_ROOT, 'index.html');
const OFFLINE_PAGE = path.join(__dirname, '../offline.html');
const SPLASH_PAGE = path.join(__dirname, '../splash.html');
const WINDOWS_APP_ICON = path.join(__dirname, '../assets/generated/icon.ico');
const PACKAGED_APP_SCHEME = 'echoo-app';
const PACKAGED_APP_ORIGIN = `${PACKAGED_APP_SCHEME}://app`;
const PACKAGED_RENDERER_URL = `${PACKAGED_APP_ORIGIN}/index.html`;

// Give the locally packaged renderer a real, isolated origin. Using file://
// serializes cross-origin API/WebSocket requests as Origin: null, forcing the
// production server to trust every opaque/null browser origin. A privileged
// app-only scheme keeps the renderer local while giving CORS one exact origin.
protocol.registerSchemesAsPrivileged([
  {
    scheme: PACKAGED_APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// DevTools are gated: dev builds, or packaged builds with an explicit opt-in.
const DEBUG_TOOLS =
  !app.isPackaged ||
  process.env.ECHOO_DEBUG === '1' ||
  process.argv.includes('--echoo-debug');
const SMOKE_TEST_MODE = app.isPackaged
  ? String(process.env.ECHOO_DESKTOP_SMOKE_TEST || '')
  : '';
const SMOKE_TEST = ['1', 'second-instance', 'offline', 'scale'].includes(SMOKE_TEST_MODE);
const SECOND_INSTANCE_SMOKE_TEST = SMOKE_TEST_MODE === 'second-instance';
const OFFLINE_SMOKE_TEST = SMOKE_TEST_MODE === 'offline';
const DISPLAY_SCALE_SMOKE_TEST = SMOKE_TEST_MODE === 'scale';
const configuredStartupReadyTimeout = Number(process.env.ECHOO_STARTUP_READY_TIMEOUT_MS || '20000');
const STARTUP_READY_TIMEOUT_MS = Number.isFinite(configuredStartupReadyTimeout)
  ? Math.max(1000, configuredStartupReadyTimeout)
  : 20000;
const STARTUP_TEST_MODE = app.isPackaged
  ? String(process.env.ECHOO_DESKTOP_STARTUP_TEST || '')
  : '';
const STARTUP_TEST_APP_READY_NEVER = STARTUP_TEST_MODE === 'never-ready';
const configuredAppReadyDelay = Number(process.env.ECHOO_TEST_APP_READY_DELAY_MS || '0');
const STARTUP_TEST_APP_READY_DELAY_MS = STARTUP_TEST_MODE === 'delayed-ready'
  && Number.isFinite(configuredAppReadyDelay)
  ? Math.min(15_000, Math.max(0, configuredAppReadyDelay))
  : 0;
const SPLASH_INTRO_FALLBACK_MS = 1800;

// Origins the app window itself is allowed to navigate to. Everything else
// (chat links, profile links, help URLs) opens in the OS default browser.
// Packaged builds permit the private echoo-app:// renderer and the bundled
// file:// startup/error surfaces only. Dev builds permit only Vite.
function appOrigins() {
  if (!app.isPackaged) {
    try {
      return [new URL(DEV_URL).origin];
    } catch {
      return ['http://localhost:5273'];
    }
  }
  return [PACKAGED_APP_ORIGIN, 'file://'];
}

function isAppUrl(url) {
  const origins = appOrigins();
  if (url.startsWith('file://')) {
    if (!app.isPackaged) return false;
    try {
      const candidate = path.resolve(fileURLToPath(url));
      const applicationRoot = path.resolve(__dirname, '..');
      return isPathInside(applicationRoot, candidate);
    } catch {
      return false;
    }
  }
  return origins.some((origin) => url === origin || url.startsWith(`${origin}/`));
}

function openExternalUrl(url) {
  const normalized = normalizeExternalUrl(url);
  if (!normalized) {
    log.warn('[echoo-desktop] blocked unsafe external URL');
    return false;
  }
  void shell.openExternal(normalized).catch((error) => {
    log.warn('[echoo-desktop] openExternal failed:', error.message);
  });
  return true;
}

async function openExternalWebUrl(url) {
  const normalized = normalizeExternalWebUrl(url);
  if (!normalized) {
    log.warn('[echoo-desktop] blocked unsafe renderer external URL');
    return { opened: false, error: 'Only safe web links can be opened.' };
  }
  try {
    await shell.openExternal(normalized);
    return { opened: true, url: normalized };
  } catch (error) {
    log.warn('[echoo-desktop] renderer openExternal failed:', error.message);
    return { opened: false, error: error?.message || String(error) };
  }
}

async function openRendererExternalUrl(url) {
  const normalized = normalizeExternalUrl(url);
  if (!normalized) {
    log.warn('[echoo-desktop] blocked unsafe renderer external target');
    return { opened: false, error: 'Only safe web and email links can be opened.' };
  }
  try {
    await shell.openExternal(normalized);
    return { opened: true, url: normalized };
  } catch (error) {
    log.warn('[echoo-desktop] renderer external target failed:', error.message);
    return { opened: false, error: 'Windows could not open the requested app.' };
  }
}

let mainWindow = null;
let splashWindow = null;
let tray = null;
let roomState = {
  active: false,
  mode: 'idle',
  kind: 'idle',
  title: '',
  muted: false,
  playing: false,
  canToggleMute: false,
  canTogglePlay: false,
  keepAwake: false,
};
let powerSaveBlockerId = null;
let pendingUpdateReady = false;
let pendingUpdateVersion = '';
let updatePromptOpen = false;
let creatorQuitWarningOpen = false;
let rendererRecoveryPromptOpen = false;
let rendererCrashed = false;
let mainWindowNativeReady = false;
let mainWindowRendererReady = false;
let startupReadyTimer = null;
let delayedAppReadyTimer = null;
let splashIntroFallbackTimer = null;
let splashIntroComplete = false;
let splashFinishRequested = false;
let rendererLoadGeneration = 0;
let rendererLifecyclePhase = 'idle';
let mainWindowVisibleGeneration = -1;
let postStartupTasksScheduled = false;
let isQuitting = false;
let quitFinalizing = false;
let quitTimer = null;
let trayHideNoticed = false;
const recordingSaveSessions = new Map();

function refreshRecordingTaskbarProgress() {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return;

  const sessions = [...recordingSaveSessions.values()];
  if (!sessions.length) {
    mainWindow.setProgressBar(-1);
    return;
  }

  const fullyMeasured = sessions.every(
    (session) => Number.isFinite(session.totalBytes) && session.totalBytes > 0
  );

  if (!fullyMeasured) {
    mainWindow.setProgressBar(2, { mode: 'indeterminate' });
    return;
  }

  const totalBytes = sessions.reduce((sum, session) => sum + session.totalBytes, 0);
  const writtenBytes = sessions.reduce(
    (sum, session) => sum + Math.min(session.bytesWritten, session.totalBytes),
    0
  );
  mainWindow.setProgressBar(
    totalBytes > 0 ? Math.min(1, writtenBytes / totalBytes) : 0,
    { mode: 'normal' }
  );
}

// Paths chosen through Echoo's native Save dialog are trusted for this
// process lifetime. This lets the post-save banner Open/Show/Rename/Trash an
// explicit export outside the managed Echoo Recordings library without ever
// exposing an arbitrary filesystem path primitive to the renderer.
const trustedRecordingPaths = new Set();
let pendingDeepLink = findEchooDeepLink(process.argv);
let smokeSecondInstanceRoute = '';
const MAX_RECORDING_IPC_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_LEGACY_RECORDING_IPC_BYTES = 16 * 1024 * 1024;
const RECORDING_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.webm']);

function recordingsLibraryRoot() {
  return path.join(app.getPath('desktop'), 'Echoo Recordings');
}

function rememberRecordingPath(value) {
  const candidate = path.resolve(String(value || ''));
  if (value && RECORDING_EXTENSIONS.has(path.extname(candidate).toLowerCase())) {
    trustedRecordingPaths.add(candidate);
  }
  return candidate;
}

function forgetRecordingPath(value) {
  if (!value) return;
  trustedRecordingPaths.delete(path.resolve(String(value)));
}

function safeRecordingPath(value, { mustExist = true } = {}) {
  const candidate = path.resolve(String(value || ''));
  const root = path.resolve(recordingsLibraryRoot());
  const trusted = trustedRecordingPaths.has(candidate);
  if (!value || (!isPathInside(root, candidate) && !trusted)) return null;
  if (!RECORDING_EXTENSIONS.has(path.extname(candidate).toLowerCase())) return null;
  if (mustExist && (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile())) return null;
  return candidate;
}

function safeRecordingFolder(value) {
  const candidate = path.resolve(String(value || ''));
  const root = path.resolve(recordingsLibraryRoot());
  if (!value) return root;
  if (isPathInside(root, candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return candidate;
  }

  for (const trustedPath of trustedRecordingPaths) {
    if (path.dirname(trustedPath) === candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

function recordingDestinationInUse(candidate) {
  const resolved = path.resolve(candidate);
  return [...recordingSaveSessions.values()].some(
    (session) => path.resolve(session.destination) === resolved
  );
}

function recordingPartialPath(destination, sessionId) {
  return `${destination}.echoo-partial-${sessionId}`;
}

async function commitRecordingPartial(partialPath, destination, sessionId) {
  try {
    await fs.promises.rename(partialPath, destination);
    return;
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code) || !fs.existsSync(destination)) {
      throw error;
    }
  }

  // Windows can reject rename-over-existing even after the native Save dialog
  // confirmed replacement. Keep the previous file recoverable until the fully
  // synced replacement has been moved into place.
  const backupPath = `${destination}.echoo-backup-${sessionId}`;
  await fs.promises.rename(destination, backupPath);
  try {
    await fs.promises.rename(partialPath, destination);
    await fs.promises.rm(backupPath, { force: true });
  } catch (error) {
    if (!fs.existsSync(destination) && fs.existsSync(backupPath)) {
      await fs.promises.rename(backupPath, destination).catch(() => null);
    }
    throw error;
  }
}

async function writeRecordingAtomically(destination, buffer) {
  const sessionId = crypto.randomUUID();
  const partialPath = recordingPartialPath(destination, sessionId);
  let handle = null;
  try {
    handle = await fs.promises.open(partialPath, 'wx');
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = null;
    await commitRecordingPartial(partialPath, destination, sessionId);
  } catch (error) {
    await handle?.close().catch(() => null);
    await fs.promises.rm(partialPath, { force: true }).catch(() => null);
    throw error;
  }
}

async function preserveInterruptedRecordingSessions(reason = 'renderer unavailable') {
  const sessions = [...recordingSaveSessions.entries()];
  if (!sessions.length) {
    refreshRecordingTaskbarProgress();
    return;
  }

  for (const [sessionId, session] of sessions) {
    recordingSaveSessions.delete(sessionId);
    try {
      await session.writeChain.catch(() => null);
      if (session.bytesWritten > 0) {
        await session.handle.sync().catch(() => null);
      }
      await session.handle.close().catch(() => null);

      if (session.bytesWritten > 0 && fs.existsSync(session.partialPath)) {
        log.warn(
          `[echoo-desktop] preserved interrupted recording partial (${reason}): ${session.partialPath}`
        );
      } else {
        await fs.promises.rm(session.partialPath, { force: true }).catch(() => null);
      }
    } catch (error) {
      log.warn('[echoo-desktop] could not preserve interrupted recording session:', error.message);
    }
  }
  refreshRecordingTaskbarProgress();
}

function syncPowerSaveBlocker() {
  const shouldBlock = roomState.active === true && roomState.keepAwake === true;

  if (shouldBlock && powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    log.info('[echoo-desktop] app suspension blocked for active creator broadcast');
    return;
  }

  if (!shouldBlock && powerSaveBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }
    powerSaveBlockerId = null;
    log.info('[echoo-desktop] app suspension blocker released');
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
  app.on('second-instance', (_event, argv) => {
    log.info('[echoo-desktop] second launch — focusing existing window');
    const secondInstanceRoute = findEchooDeepLink(argv);
    pendingDeepLink = secondInstanceRoute || pendingDeepLink;
    if (SECOND_INSTANCE_SMOKE_TEST && secondInstanceRoute) {
      smokeSecondInstanceRoute = secondInstanceRoute;
    }
    showAndFocusWindow();
    dispatchPendingDeepLink();
    if (SECOND_INSTANCE_SMOKE_TEST && secondInstanceRoute) {
      setTimeout(() => {
        void completePackagedSmokeTest();
      }, 750);
    }
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

const DEFAULT_WINDOW_BOUNDS = Object.freeze({ width: 1280, height: 800 });
const MIN_WINDOW_BOUNDS = Object.freeze({ width: 760, height: 440 });
let windowStateSaveTimer = null;

function windowStateFile() {
  return path.join(app.getPath('userData'), 'echoo-window-state.json');
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fitWindowBoundsToDisplay(bounds, display) {
  const workArea = display?.workArea || {
    x: 0,
    y: 0,
    width: DEFAULT_WINDOW_BOUNDS.width,
    height: DEFAULT_WINDOW_BOUNDS.height,
  };
  const minWidth = Math.min(MIN_WINDOW_BOUNDS.width, workArea.width);
  const minHeight = Math.min(MIN_WINDOW_BOUNDS.height, workArea.height);
  const requestedWidth = Number.isFinite(Number(bounds?.width))
    ? Math.round(Number(bounds.width))
    : DEFAULT_WINDOW_BOUNDS.width;
  const requestedHeight = Number.isFinite(Number(bounds?.height))
    ? Math.round(Number(bounds.height))
    : DEFAULT_WINDOW_BOUNDS.height;
  const width = clampNumber(requestedWidth, Math.max(1, minWidth), Math.max(1, workArea.width));
  const height = clampNumber(requestedHeight, Math.max(1, minHeight), Math.max(1, workArea.height));
  const maxX = workArea.x + Math.max(0, workArea.width - width);
  const maxY = workArea.y + Math.max(0, workArea.height - height);
  const x = Number.isFinite(Number(bounds?.x))
    ? clampNumber(Math.round(Number(bounds.x)), workArea.x, maxX)
    : Math.round(workArea.x + Math.max(0, workArea.width - width) / 2);
  const y = Number.isFinite(Number(bounds?.y))
    ? clampNumber(Math.round(Number(bounds.y)), workArea.y, maxY)
    : Math.round(workArea.y + Math.max(0, workArea.height - height) / 2);

  return {
    x,
    y,
    width,
    height,
    minWidth: Math.max(1, minWidth),
    minHeight: Math.max(1, minHeight),
  };
}

function readWindowState() {
  let parsed = {};
  try {
    parsed = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'));
  } catch {
    parsed = {};
  }

  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay?.() || displays[0] || null;
  const requestedBounds = {
    x: Number(parsed.x),
    y: Number(parsed.y),
    width: Number(parsed.width),
    height: Number(parsed.height),
  };

  let display = primaryDisplay;
  if (Number.isFinite(requestedBounds.x) && Number.isFinite(requestedBounds.y)) {
    try {
      display = screen.getDisplayMatching({
        x: requestedBounds.x,
        y: requestedBounds.y,
        width: Math.max(1, Number.isFinite(requestedBounds.width) ? requestedBounds.width : 1),
        height: Math.max(1, Number.isFinite(requestedBounds.height) ? requestedBounds.height : 1),
      }) || primaryDisplay;
    } catch {
      display = primaryDisplay;
    }
  }

  const fitted = fitWindowBoundsToDisplay(requestedBounds, display);
  return { ...fitted, maximized: parsed.maximized === true };
}

function persistWindowState(window) {
  if (!window || window.isDestroyed()) return;
  try {
    const bounds = window.getNormalBounds();
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: window.isMaximized(),
    };
    fs.mkdirSync(path.dirname(windowStateFile()), { recursive: true });
    fs.writeFileSync(windowStateFile(), JSON.stringify(state, null, 2));
  } catch (error) {
    log.warn('[echoo-desktop] could not persist window state:', error.message);
  }
}

function scheduleWindowStateSave(window) {
  if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    persistWindowState(window);
  }, 250);
  if (windowStateSaveTimer.unref) windowStateSaveTimer.unref();
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createSplashWindow() {
  if (!app.isPackaged || !fs.existsSync(SPLASH_PAGE)) return null;
  if (splashWindow && !splashWindow.isDestroyed()) return splashWindow;
  splashWindow = null;

  splashIntroComplete = false;
  splashFinishRequested = false;
  const createdSplash = new BrowserWindow({
    width: 216,
    height: 216,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    show: false,
    center: true,
    skipTaskbar: true,
    alwaysOnTop: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  splashWindow = createdSplash;
  logStartupEvent('splash-created');
  clearSplashIntroFallback();
  createdSplash.once('ready-to-show', () => {
    if (createdSplash !== splashWindow || createdSplash.isDestroyed()) return;
    createdSplash.show();
    logStartupEvent('splash-visible');
  });
  createdSplash.on('closed', () => {
    if (splashWindow === createdSplash) splashWindow = null;
  });
  void createdSplash.loadFile(SPLASH_PAGE).catch((error) => {
    log.warn('[echoo-desktop] splash failed to load:', error.message);
    if (splashWindow === createdSplash) destroySplashWindow('load-failed');
    void revealMainWindowWhenReady();
  });
  return createdSplash;
}

function clearSplashIntroFallback() {
  if (!splashIntroFallbackTimer) return;
  clearTimeout(splashIntroFallbackTimer);
  splashIntroFallbackTimer = null;
}

function markSplashIntroComplete(window, source = 'animation') {
  if (
    splashIntroComplete ||
    !window ||
    window !== splashWindow ||
    window.isDestroyed()
  ) return;

  splashIntroComplete = true;
  clearSplashIntroFallback();
  logStartupEvent('splash-intro-complete', `source=${source}`);
  void revealMainWindowWhenReady();
}

function requestSplashFinish() {
  if (
    splashIntroComplete ||
    splashFinishRequested ||
    !splashWindow ||
    splashWindow.isDestroyed()
  ) return;

  splashFinishRequested = true;
  logStartupEvent('splash-finish-requested');
  splashWindow.webContents.send('echoo:splash-finish');
  clearSplashIntroFallback();
  const finishingSplash = splashWindow;
  splashIntroFallbackTimer = setTimeout(() => {
    splashIntroFallbackTimer = null;
    markSplashIntroComplete(finishingSplash, 'finish-fallback');
  }, SPLASH_INTRO_FALLBACK_MS);
  if (splashIntroFallbackTimer.unref) splashIntroFallbackTimer.unref();
}

function destroySplashWindow(reason = 'complete') {
  const current = splashWindow;
  splashWindow = null;
  clearSplashIntroFallback();
  if (!current) return;
  if (!current.isDestroyed()) current.destroy();
  logStartupEvent('splash-destroyed', `reason=${reason}`);
}

function clearStartupReadyTimeout() {
  if (!startupReadyTimer) return;
  clearTimeout(startupReadyTimer);
  startupReadyTimer = null;
}

function clearDelayedAppReady() {
  if (!delayedAppReadyTimer) return;
  clearTimeout(delayedAppReadyTimer);
  delayedAppReadyTimer = null;
}

function schedulePostStartupTasks() {
  if (postStartupTasksScheduled) return;
  postStartupTasksScheduled = true;
  setImmediate(() => {
    createTray();
    checkForUpdates();
  });
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const firstRevealForGeneration = mainWindowVisibleGeneration !== rendererLoadGeneration;
  clearStartupReadyTimeout();
  clearDelayedAppReady();
  mainWindow.show();
  mainWindow.focus();
  if (firstRevealForGeneration) {
    mainWindowVisibleGeneration = rendererLoadGeneration;
    logStartupEvent('main-visible', `phase=${rendererLifecyclePhase}`);
  }
  destroySplashWindow('main-visible');
  schedulePostStartupTasks();
  if (firstRevealForGeneration) void completePackagedSmokeTest();
}

function rendererUrlCanRevealImmediately(url) {
  const value = String(url || '');
  return (
    value.startsWith('file://') ||
    value.startsWith('data:text/html') ||
    value.includes('/offline.html')
  );
}

async function revealMainWindowWhenReady() {
  if (!app.isPackaged || !mainWindow || mainWindow.isDestroyed()) {
    revealMainWindow();
    return;
  }
  if (!mainWindowNativeReady) return;
  if (mainWindowRendererReady) {
    if (splashWindow && !splashWindow.isDestroyed() && !splashIntroComplete) {
      requestSplashFinish();
      return;
    }
    revealMainWindow();
    return;
  }

  const currentUrl = mainWindow.webContents.getURL();
  if (rendererUrlCanRevealImmediately(currentUrl)) {
    mainWindowRendererReady = true;
    revealMainWindow();
    return;
  }
  // The packaged React renderer reports readiness over the narrow preload
  // bridge. Navigation completion and DOM polling are not app readiness.
}

function armStartupReadyTimeout(generation) {
  if (!app.isPackaged) return;
  clearStartupReadyTimeout();
  startupReadyTimer = setTimeout(() => {
    startupReadyTimer = null;
    if (
      generation !== rendererLoadGeneration ||
      rendererLifecyclePhase !== 'renderer-loading' ||
      mainWindowRendererReady ||
      !mainWindow ||
      mainWindow.isDestroyed() ||
      rendererUrlCanRevealImmediately(mainWindow.webContents.getURL())
    ) return;

    const timedOutUrl = mainWindow.webContents.getURL();
    logStartupEvent('renderer-ready-timeout', `generation=${generation}`);
    log.error('[echoo-desktop] renderer did not report app-ready before startup timeout');
    void loadOfflinePage('startup-timeout', timedOutUrl).catch((error) => {
      log.error('[echoo-desktop] could not show startup recovery:', error.message);
    });
  }, STARTUP_READY_TIMEOUT_MS);
  if (startupReadyTimer.unref) startupReadyTimer.unref();
}

function createWindow() {
  const savedWindowState = readWindowState();
  mainWindowNativeReady = !app.isPackaged;
  mainWindowRendererReady = !app.isPackaged;
  mainWindow = new BrowserWindow({
    width: savedWindowState.width,
    height: savedWindowState.height,
    x: savedWindowState.x,
    y: savedWindowState.y,
    minWidth: savedWindowState.minWidth,
    minHeight: savedWindowState.minHeight,
    resizable: true,
    show: !app.isPackaged,
    title: 'Echoo',
    icon: WINDOWS_APP_ICON,
    // Match the canonical renderer canvas before its first paint so Windows
    // never inserts a white frame between the splash and the local app shell.
    backgroundColor: '#f7f9fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // MUST stay true — never weaken for convenience
      nodeIntegration: false, // MUST stay false — renderer gets only the bridge
      sandbox: true, // Compatible: preload only uses contextBridge + ipcRenderer
    },
  });
  logStartupEvent('main-window-created');

  const markMainWindowNativeReady = (source) => {
    if (mainWindowNativeReady) return;
    mainWindowNativeReady = true;
    if (savedWindowState.maximized) mainWindow?.maximize();
    logStartupEvent('native-ready', `source=${source}`);
  };

  mainWindow.once('ready-to-show', () => {
    markMainWindowNativeReady('ready-to-show');
    if (!app.isPackaged) {
      revealMainWindow();
      return;
    }
    void revealMainWindowWhenReady();
  });

  const windowForState = mainWindow;
  for (const eventName of ['move', 'resize', 'maximize', 'unmaximize']) {
    windowForState.on(eventName, () => scheduleWindowStateSave(windowForState));
  }

  // Echoo has one primary desktop window. Never let window.open create a
  // browser-like child Electron window. Fold internal routes back into the
  // existing renderer and hand public/help links to the Windows default app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (isAppUrl(url)) {
        let route = '';
        try {
          const parsed = new URL(url);
          const hashRoute = parsed.hash?.startsWith('#/') ? parsed.hash.slice(1) : '';
          const pathRoute =
            parsed.pathname && parsed.pathname !== '/index.html'
              ? `${parsed.pathname}${parsed.search || ''}`
              : '';
          route = normalizeRoute(hashRoute || pathRoute) || '';
        } catch {
          route = '';
        }
        if (route) {
          mainWindow.webContents.send('echoo:deep-link', route);
          showAndFocusWindow();
        }
        return { action: 'deny' };
      }
      openExternalUrl(url);
      return { action: 'deny' };
    } catch (error) {
      log.warn('[echoo-desktop] setWindowOpenHandler error:', error.message);
      return { action: 'deny' };
    }
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openExternalUrl(url);
    }
  });

  // Use restrained native Windows text context menus instead of a custom
  // decorative menu. This gives inputs/chat editors normal cut/copy/paste
  // behavior and selected read-only text a native Copy action.
  mainWindow.webContents.on('context-menu', (_event, params = {}) => {
    const template = [];
    if (params.isEditable) {
      template.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      );
    } else if (String(params.selectionText || '').trim()) {
      template.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' });
    }

    if (template.length) {
      Menu.buildFromTemplate(template).popup({ window: mainWindow });
    }
  });

  // Distinguish a real main-document reload from an in-place HashRouter route
  // change. The desktop splash belongs to renderer boot/reload only; treating a
  // hash navigation (for example session-expiry -> #/login or restoring a
  // Listener workspace) as a fresh renderer boot recreates the splash after
  // APP_READY and guarantees a false startup timeout because React is already
  // mounted and will not emit a second boot-ready signal.
  mainWindow.webContents.on(
    'did-start-navigation',
    (_event, url, isInPlace, isMainFrame) => {
      if (
        !app.isPackaged ||
        rendererLifecyclePhase === 'recovery-loading' ||
        isMainFrame === false ||
        isInPlace === true ||
        !isAppUrl(url)
      ) {
        return;
      }

      // Explicit loadPackagedRenderer() already prepares before loadURL. This
      // second call is intentionally idempotent there, while native Chromium
      // reloads still get a fresh generation, splash and APP_READY watchdog.
      preparePackagedRendererLoad('main-frame-navigation');
    }
  );
  mainWindow.webContents.on('did-start-loading', () => {
    logStartupEvent('renderer-load-start', `phase=${rendererLifecyclePhase}`);
  });
  mainWindow.webContents.on('did-fail-load', (
    _event,
    errorCode,
    errorDescription,
    validatedURL,
    isMainFrame
  ) => {
    // Chromium reports ERR_ABORTED when a load is deliberately replaced by a
    // retry, deep link, or recovery navigation. Subframe failures must also
    // stay inside the React surface instead of replacing the whole app.
    if (errorCode === -3 || isMainFrame === false) return;
    if (validatedURL.includes('offline.html')) return; // already showing it (query string included)
    log.warn(`[echoo-desktop] load failed (${errorCode} ${errorDescription}): ${validatedURL}`);
    void loadOfflinePage(`${errorCode} ${errorDescription}`, validatedURL).catch((error) => {
      log.error('[echoo-desktop] could not load offline page:', error.message);
    });
  });
  mainWindow.webContents.on('did-finish-load', () => {
    rendererCrashed = false;
    logStartupEvent('renderer-load-complete', `phase=${rendererLifecyclePhase}`);
    // On some installed Windows launches (and when the process is started
    // hidden by automation), BrowserWindow's ready-to-show event never fires
    // even though Chromium finished the main document. A completed main-frame
    // load is sufficient native-window readiness; React APP_READY remains the
    // separate authoritative signal that the Echoo shell is usable.
    markMainWindowNativeReady('did-finish-load');
    dispatchPendingDeepLink();
    void revealMainWindowWhenReady();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details = {}) => {
    if (isQuitting || details.reason === 'clean-exit') return;

    rendererCrashed = true;
    log.error(
      `[echoo-desktop] renderer process gone: ${details.reason || 'unknown'} ${details.exitCode ?? ''}`
    );
    void preserveInterruptedRecordingSessions('renderer crash');

    if (rendererRecoveryPromptOpen || !mainWindow || mainWindow.isDestroyed()) return;
    rendererRecoveryPromptOpen = true;
    void dialog.showMessageBox(mainWindow, {
      type: 'error',
      buttons: ['Restart Echoo', 'Close'],
      defaultId: 0,
      cancelId: 1,
      title: 'Echoo stopped unexpectedly',
      message: 'Echoo needs to reopen its interface.',
      detail: 'Any recording data already written to disk has been preserved. Restart Echoo to continue.',
    }).then(async ({ response }) => {
      if (response === 0 && mainWindow && !mainWindow.isDestroyed()) {
        try {
          if (DEV_URL_IS_EXPLICIT || !app.isPackaged) await loadDevUrl();
          else await loadPackagedRenderer();
        } catch (error) {
          log.error('[echoo-desktop] renderer restart failed:', error.message);
          await loadOfflinePage('Echoo could not restart its interface.', '').catch(() => null);
        }
        return;
      }

      isQuitting = true;
      app.quit();
    }).catch((error) => {
      log.warn('[echoo-desktop] renderer recovery prompt failed:', error.message);
    }).finally(() => {
      rendererRecoveryPromptOpen = false;
    });
  });

  if (!app.isPackaged) {
    // Never open a blank window: verify the dev server is actually reachable
    // first (covers the race where Electron starts before Vite, and the case
    // where `npm start` is run without any dev server at all).
    void loadDevUrl();
  } else if (DEV_URL_IS_EXPLICIT) {
    // Packaged test/debug override (packaged boot test points at a fixture
    // server via ECHOO_URL/ECHOO_DEV_URL).
    void loadDevUrl();
  } else {
    // Production always boots the bundled renderer. Server failures are shown
    // inside the real Echoo shell instead of becoming a browser error page.
    void loadPackagedRenderer();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Media-app behavior: closing the window while a live room is active hides
  // to the tray instead of quitting, so minimizing never kills the audio.
  // Quit explicitly via tray > Quit or File > Quit (those set isQuitting).
  mainWindow.on('close', (event) => {
    persistWindowState(mainWindow);
    const recordingSaveActive = recordingSaveSessions.size > 0;
    if (!isQuitting && (roomState.active || recordingSaveActive) && mainWindow) {
      event.preventDefault();
      mainWindow.hide();
      if (!trayHideNoticed) {
        trayHideNoticed = true;
        try {
          const creatorActive = roomState.mode === 'creator';
          const replayActive = roomState.kind === 'replay';
          const notice = new Notification({
            title: recordingSaveActive
              ? 'Recording save continues'
              : creatorActive
                ? 'Your broadcast stays live'
                : replayActive
                  ? 'Audio keeps playing'
                  : 'Echoo keeps playing',
            body: recordingSaveActive
              ? 'Echoo is finishing your recording in the tray. Reopen Echoo any time while it saves.'
              : creatorActive
                ? 'Your broadcast is still live while Echoo is in the tray. Open Echoo to manage or end it safely.'
                : replayActive
                  ? 'Your Echoo audio is still playing in the background.'
                  : 'Live audio is still playing while Echoo is in the tray. Open Echoo to return to the room.',
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

function dispatchPendingDeepLink() {
  if (!pendingDeepLink || !mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.webContents.isLoading()) return;
  const route = pendingDeepLink;
  pendingDeepLink = null;
  mainWindow.webContents.send('echoo:deep-link', route);
}

async function completePackagedSmokeTest() {
  if (!SMOKE_TEST || !mainWindow || mainWindow.isDestroyed()) return;
  if (SECOND_INSTANCE_SMOKE_TEST && !smokeSecondInstanceRoute) return;

  const markerPath = path.join(app.getPath('temp'), 'echoo-desktop-smoke.json');
  try {
    await new Promise((resolve) => setTimeout(resolve, 750));
    const result = await mainWindow.webContents.executeJavaScript(`(() => ({
      protocol: window.location.protocol,
      hash: window.location.hash,
      identity: document.querySelector('meta[name="echoo-app"]')?.content || '',
      rootChildren: document.querySelector('#root')?.childElementCount || 0,
      desktopBridge: window.echooDesktop?.isDesktop === true,
      devicePixelRatio: window.devicePixelRatio || 1,
      viewportWidth: window.innerWidth || 0,
      viewportHeight: window.innerHeight || 0,
      documentWidth: document.documentElement?.scrollWidth || 0,
      screenAvailWidth: window.screen?.availWidth || 0,
      screenAvailHeight: window.screen?.availHeight || 0,
      userDataPath: ${JSON.stringify(app.getPath('userData'))},
      recordingsLibraryPath: ${JSON.stringify(recordingsLibraryRoot())}
    }))()`);
    const routeVerified = !SECOND_INSTANCE_SMOKE_TEST
      || result?.hash === `#${smokeSecondInstanceRoute}`;
    const scaleLayoutVerified = !DISPLAY_SCALE_SMOKE_TEST
      || (
        Number(result?.viewportWidth) > 0 &&
        Number(result?.viewportHeight) > 0 &&
        Number(result?.documentWidth) <= Number(result?.viewportWidth) + 2 &&
        (
          Number(result?.screenAvailWidth) <= 0 ||
          Number(result?.viewportWidth) <= Number(result?.screenAvailWidth) + 2
        ) &&
        (
          Number(result?.screenAvailHeight) <= 0 ||
          Number(result?.viewportHeight) <= Number(result?.screenAvailHeight) + 2
        )
      );
    const passed = result?.protocol === `${PACKAGED_APP_SCHEME}:`
      && result?.identity === 'echoo-frontend'
      && result?.rootChildren > 0
      && result?.desktopBridge === true
      && routeVerified
      && scaleLayoutVerified;
    const desktopWindows = BrowserWindow.getAllWindows();
    fs.writeFileSync(
      markerPath,
      JSON.stringify({
        passed,
        smokeMode: SMOKE_TEST_MODE,
        secondInstanceRoute: smokeSecondInstanceRoute,
        offlineNetworkBlocked: OFFLINE_SMOKE_TEST,
        startupEvents: desktopStartupEvents,
        browserWindowCount: desktopWindows.length,
        visibleWindowCount: desktopWindows.filter((window) => window.isVisible()).length,
        splashWindowCount: desktopWindows.filter(
          (window) => window.webContents.getURL().includes('splash.html')
        ).length,
        ...result,
      }, null, 2)
    );
    isQuitting = true;
    app.exit(passed ? 0 : 1);
  } catch (error) {
    fs.writeFileSync(markerPath, JSON.stringify({ passed: false, error: error?.message || String(error) }, null, 2));
    isQuitting = true;
    app.exit(1);
  }
}

// Loads the bundled offline/error page. If the file itself is missing from the
// package (the old Windows blank-screen bug), falls back to an inline data-URL
// page so the window NEVER renders blank white without an explanation.
function loadOfflinePage(reason, url) {
  if (app.isPackaged) {
    rendererLoadGeneration += 1;
    rendererLifecyclePhase = 'recovery-loading';
    mainWindowRendererReady = false;
    clearStartupReadyTimeout();
    clearDelayedAppReady();
    destroySplashWindow('recovery');
    logStartupEvent('recovery-navigation-start', `reason=${String(reason || 'unknown').slice(0, 64)}`);
  }
  const query = { reason: reason || 'unknown', url: url || (app.isPackaged ? PROD_INDEX : DEV_URL) };
  const revealRecovery = (loadPromise) => Promise.resolve(loadPromise).then((result) => {
    if (app.isPackaged && mainWindow && !mainWindow.isDestroyed()) {
      mainWindowRendererReady = true;
      rendererLifecyclePhase = 'recovery-visible';
      logStartupEvent('recovery-ready');
      revealMainWindow();
    }
    return result;
  });
  if (fs.existsSync(OFFLINE_PAGE)) {
    return revealRecovery(mainWindow?.loadFile(OFFLINE_PAGE, { query }));
  }
  log.error(`[echoo-desktop] offline page missing at ${OFFLINE_PAGE} — showing inline fallback`);
  const safeReason = String(query.reason).replace(/[<>&"]/g, '');
  return revealRecovery(mainWindow?.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><title>Echoo needs a connection</title>` +
        `<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fbff;color:#164f9d;font-family:Arial,sans-serif">` +
        `<main style="text-align:center;max-width:420px"><h1>Echoo could not start.</h1>` +
        `<p>(${safeReason}) Restart the app. If this keeps happening, reinstall from the latest release.</p></main></body>`
    )}`
  ));
}

function preparePackagedRendererLoad(trigger = 'explicit') {
  if (!app.isPackaged || !mainWindow || mainWindow.isDestroyed()) return;
  if (rendererLifecyclePhase === 'renderer-loading') return rendererLoadGeneration;

  rendererLoadGeneration += 1;
  rendererLifecyclePhase = 'renderer-loading';
  mainWindowRendererReady = false;
  clearDelayedAppReady();
  armStartupReadyTimeout(rendererLoadGeneration);
  logStartupEvent('renderer-load-prepared', `generation=${rendererLoadGeneration} trigger=${trigger}`);

  createSplashWindow();

  // Never expose an in-between Chromium document while the local React shell
  // is replacing the offline/recovery surface.
  mainWindow.hide();
  return rendererLoadGeneration;
}

async function loadPackagedRenderer() {
  if (!mainWindow) return;
  preparePackagedRendererLoad('load-packaged-renderer');
  if (!fs.existsSync(PROD_INDEX)) {
    log.error(`[echoo-desktop] packaged renderer missing at ${PROD_INDEX}`);
    await loadOfflinePage('renderer-missing', PROD_INDEX);
    return;
  }
  try {
    await mainWindow.loadURL(PACKAGED_RENDERER_URL);
  } catch (error) {
    log.error('[echoo-desktop] packaged renderer failed to load:', error.message);
    await loadOfflinePage('renderer-load-failed', PROD_INDEX);
  }
}

function showAndFocusWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  try {
    if (app.isPackaged && (!mainWindowNativeReady || !mainWindowRendererReady)) {
      // A second launch during startup reuses the canonical splash without
      // stealing focus back from whichever Windows app the user selected.
      if (splashWindow && !splashWindow.isDestroyed() && !splashWindow.isVisible()) {
        splashWindow.showInactive();
      }
      void revealMainWindowWhenReady();
      return;
    }
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
// port check (which fails loudly).
function isTcpReachable(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new tcpNet.Socket();
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
      await loadOfflinePage('foreign-content', DEV_URL);
      return;
    }
  } catch (error) {
    log.warn('[echoo-desktop] dev URL load threw:', error.message);
  }
  log.warn(`[echoo-desktop] dev server not reachable at ${DEV_URL} after ${DEV_WAIT_MS}ms — showing error screen`);
  try {
    await loadOfflinePage('dev-unreachable', DEV_URL);
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
// The built frontend needs no general unsafe-inline / unsafe-eval. Local MP3
// export does compile its bundled encoder WebAssembly, so Chromium's narrow
// wasm-unsafe-eval permission is required without enabling JavaScript eval().
// Dev is left alone so Vite HMR / React DevTools keep working.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  'img-src \'self\' data: blob: https: http://localhost:5017 http://127.0.0.1:5017',
  'media-src \'self\' blob: data: https: http://localhost:5017 http://127.0.0.1:5017',
  // localhost: API + socket.io (project-specific backend port 5017);
  // https:/wss: for LiveKit Cloud (deployment-specific hosts).
  // data: is limited to fetch/connect here so the bundled MP3 encoder can
  // instantiate its embedded data:application/wasm payload.
  'connect-src \'self\' data: http://localhost:5017 ws://localhost:5017 http://127.0.0.1:5017 ws://127.0.0.1:5017 https: wss:',
  "worker-src 'self' blob:",
  'child-src blob:',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function trustedRendererOrigin(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (app.isPackaged) {
      // Node's WHATWG URL reports "null" for non-special custom-scheme
      // origins, so compare the registered scheme + host explicitly.
      return parsed.protocol === `${PACKAGED_APP_SCHEME}:` && parsed.hostname === 'app';
    }
    return parsed.origin === new URL(DEV_URL).origin;
  } catch {
    return false;
  }
}

function isTrustedIpcEvent(event) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (event?.sender !== mainWindow.webContents) return false;
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
    return isAppUrl(event.senderFrame.url || event.sender.getURL());
  } catch {
    return false;
  }
}

function handleTrustedIpc(channel, listener) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedIpcEvent(event)) {
      log.warn(`[echoo-desktop] blocked untrusted IPC caller on ${channel}`);
      throw new Error('Echoo blocked an untrusted desktop request.');
    }
    return listener(event, ...args);
  });
}

function installPermissionPolicy() {
  const appSession = session.defaultSession;

  // Electron defaults to approving permission requests unless an app provides
  // a policy. Echoo grants microphone access only to its own renderer and
  // denies camera/other web permissions by default.
  appSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details = {}) => {
    if (permission !== 'media' || !trustedRendererOrigin(requestingOrigin)) return false;
    const mediaType = String(details.mediaType || '').toLowerCase();
    return !mediaType || mediaType === 'audio';
  });

  appSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    if (permission !== 'media') {
      callback(false);
      return;
    }

    const origin =
      details.securityOrigin ||
      details.requestingUrl ||
      webContents?.getURL?.() ||
      '';
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    const audioOnly = mediaTypes.length === 0 || mediaTypes.every((type) => type === 'audio');
    callback(trustedRendererOrigin(origin) && audioOnly);
  });

  // Existing Creator Studio "Share audio" uses getDisplayMedia. On Windows,
  // Electron needs an explicit source grant. Use a compact native source menu
  // instead of silently capturing a screen or adding a new setup wizard.
  appSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (
      !trustedRendererOrigin(request.securityOrigin) ||
      request.userGesture !== true ||
      !request.videoRequested
    ) {
      callback({});
      return;
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      });

      const visibleSources = sources.slice(0, 24);
      if (!visibleSources.length || !mainWindow || mainWindow.isDestroyed()) {
        callback({});
        return;
      }

      let settled = false;
      const finish = (streams = {}) => {
        if (settled) return;
        settled = true;
        try {
          callback(streams);
        } catch (error) {
          log.warn('[echoo-desktop] display-media callback failed:', error.message);
        }
      };

      const menu = Menu.buildFromTemplate([
        {
          label: 'Choose a screen or window for Echoo audio',
          enabled: false,
        },
        { type: 'separator' },
        ...visibleSources.map((source) => ({
          label: String(source.name || 'Screen').slice(0, 100),
          click: () => {
            finish({
              video: source,
              ...(request.audioRequested ? { audio: 'loopback' } : {}),
            });
          },
        })),
        { type: 'separator' },
        {
          label: 'Cancel',
          click: () => finish({}),
        },
      ]);

      menu.popup({
        window: mainWindow,
        callback: () => finish({}),
      });
    } catch (error) {
      log.warn('[echoo-desktop] display-media selection failed:', error.message);
      callback({});
    }
  });

  log.info('[echoo-desktop] renderer permission policy installed');
}

function installProdCsp() {
  try {
    const { session } = require('electron');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // Stamp only local Echoo application surfaces; never touch remote content.
      if (
        details.url.startsWith('file://') ||
        details.url.startsWith(`${PACKAGED_APP_ORIGIN}/`)
      ) {
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

let packagedRendererProtocolRegistered = false;

function registerPackagedRendererProtocol() {
  if (!app.isPackaged || packagedRendererProtocolRegistered) return;

  protocol.handle(PACKAGED_APP_SCHEME, async (request) => {
    try {
      const parsed = new URL(request.url);
      if (parsed.hostname !== 'app') {
        return new Response('Not found', { status: 404 });
      }

      const relativePath = decodeURIComponent(parsed.pathname)
        .replace(/^\/+/, '') || 'index.html';
      const candidate = path.resolve(PROD_ROOT, relativePath);

      if (
        !isPathInside(PROD_ROOT, candidate) ||
        !fs.existsSync(candidate) ||
        !fs.statSync(candidate).isFile()
      ) {
        return new Response('Not found', { status: 404 });
      }

      return electronNet.fetch(pathToFileURL(candidate).toString());
    } catch (error) {
      log.warn('[echoo-desktop] packaged protocol request failed:', error.message);
      return new Response('Not found', { status: 404 });
    }
  });

  packagedRendererProtocolRegistered = true;
  log.info('[echoo-desktop] local renderer protocol registered');
}

// ---------------------------------------------------------------------------
// Native menu: macOS convention (app menu with product name first) vs
// Windows/Linux convention (File > Quit, Help > About).
// ---------------------------------------------------------------------------
async function openLogsFolder() {
  try {
    const logFilePath = log.transports.file.getFile().path;
    const logsFolder = path.dirname(logFilePath);
    await fs.promises.mkdir(logsFolder, { recursive: true });
    const result = await shell.openPath(logsFolder);
    if (result) throw new Error(result);
    return { opened: true, path: logsFolder };
  } catch (error) {
    log.warn('[echoo-desktop] could not open logs folder:', error.message);
    return { opened: false, error: 'Echoo could not open its logs folder.' };
  }
}

function reloadMainWindow({ ignoreCache = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (updateRestartBlocked()) {
    try {
      const notice = new Notification({
        title: 'Echoo is keeping your audio safe',
        body: recordingSaveSessions.size > 0
          ? 'Reload is unavailable until your recording finishes saving.'
          : roomState.mode === 'creator'
            ? 'End the live broadcast before reloading Echoo.'
            : 'Leave or stop the active audio session before reloading Echoo.',
        silent: true,
      });
      notice.on('click', () => showAndFocusWindow());
      notice.show();
    } catch {
      // Reload remains blocked even if Windows notifications are unavailable.
    }
    return false;
  }

  if (ignoreCache) mainWindow.webContents.reloadIgnoringCache();
  else mainWindow.webContents.reload();
  return true;
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
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
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => reloadMainWindow(),
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => reloadMainWindow({ ignoreCache: true }),
        },
        ...(DEBUG_TOOLS ? [{ role: 'toggleDevTools' }] : []),
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
        { role: 'close' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Open Echoo Logs',
          click: () => { void openLogsFolder(); },
        },
        { type: 'separator' },
        {
          label: 'Echoo Support & Docs',
          click: () => {
            openExternalUrl('https://github.com/emmy16-glitch/Echoo-main');
          },
        },
        { type: 'separator' },
        { role: 'about' },
      ],
    },
  ];

  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } catch (error) {
    log.warn('[echoo-desktop] could not set application menu:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Windows tray
// ---------------------------------------------------------------------------
function resolveTrayIcon() {
  const assetDir = path.join(__dirname, '../assets');
  for (const name of ['generated/tray-icon.png', 'generated/icon.png']) {
    const candidate = path.join(assetDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function buildTrayMenu() {
  const items = [{ label: 'Open Echoo', click: () => showAndFocusWindow() }];

  if (recordingSaveSessions.size > 0) {
    items.push(
      { type: 'separator' },
      {
        label: recordingSaveSessions.size === 1
          ? 'Saving recording…'
          : `Saving ${recordingSaveSessions.size} recordings…`,
        enabled: false,
      }
    );
  }

  if (roomState.active) {
    items.push({ type: 'separator' });

    if (roomState.mode === 'creator') {
      items.push({
        label: `LIVE · ${roomState.title || 'Creator Studio'}`,
        enabled: false,
      });
      if (roomState.canToggleMute) {
        items.push({
          label: roomState.muted ? 'Unmute audience output' : 'Mute audience output',
          click: () => {
            showAndFocusWindow();
            sendRoomCommand('toggle-mute');
          },
        });
      }
      items.push({
        label: 'End broadcast…',
        click: () => {
          showAndFocusWindow();
          sendRoomCommand('request-end-broadcast');
        },
      });
    } else if (roomState.kind === 'replay') {
      items.push({
        label: `${roomState.playing ? 'Playing' : 'Audio'} · ${roomState.title || 'Echoo audio'}`,
        enabled: false,
      });
      if (roomState.canTogglePlay) {
        items.push({
          label: roomState.playing ? 'Pause audio' : 'Play audio',
          click: () => sendRoomCommand('toggle-playback'),
        });
      }
      items.push({
        label: 'Stop playback',
        click: () => sendRoomCommand('stop-playback'),
      });
    } else {
      items.push({
        label: `Listening · ${roomState.title || 'Live on Echoo'}`,
        enabled: false,
      });
      if (roomState.canToggleMute) {
        items.push({
          label: roomState.muted ? 'Unmute live audio' : 'Mute live audio',
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
  }

  items.push({ type: 'separator' }, { label: 'Quit Echoo', click: () => app.quit() });
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
    image = nativeImage.createFromPath(resolved);
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
  ipcMain.on('echoo:splash-intro-complete', (event, detail = {}) => {
    if (
      !splashWindow ||
      splashWindow.isDestroyed() ||
      event.sender !== splashWindow.webContents
    ) return;

    markSplashIntroComplete(
      splashWindow,
      detail?.reducedMotion === true ? 'reduced-motion' : 'animation'
    );
  });

  ipcMain.on('echoo:app-ready', (event) => {
    if (!isTrustedIpcEvent(event)) {
      log.warn('[echoo-desktop] blocked untrusted IPC caller on echoo:app-ready');
      return;
    }
    if (mainWindowRendererReady || rendererLifecyclePhase !== 'renderer-loading') return;

    const generation = rendererLoadGeneration;
    logStartupEvent('renderer-app-ready-received', `generation=${generation}`);
    if (STARTUP_TEST_APP_READY_NEVER) {
      log.info('[echoo-desktop] startup test is withholding renderer app-ready');
      return;
    }

    const acceptRendererReady = () => {
      delayedAppReadyTimer = null;
      if (
        generation !== rendererLoadGeneration ||
        rendererLifecyclePhase !== 'renderer-loading' ||
        mainWindowRendererReady
      ) return;
      mainWindowRendererReady = true;
      rendererLifecyclePhase = 'renderer-ready';
      logStartupEvent('renderer-app-ready', `generation=${generation}`);
      log.info('[echoo-desktop] renderer reported app-ready');
      void revealMainWindowWhenReady();
    };

    if (STARTUP_TEST_APP_READY_DELAY_MS > 0) {
      if (delayedAppReadyTimer) return;
      delayedAppReadyTimer = setTimeout(acceptRendererReady, STARTUP_TEST_APP_READY_DELAY_MS);
      return;
    }
    acceptRendererReady();
  });

  handleTrustedIpc('echoo:open-external-url', async (_event, url) =>
    openRendererExternalUrl(url)
  );
  handleTrustedIpc('echoo:open-external-web-url', async (_event, url) =>
    openExternalWebUrl(url)
  );
  handleTrustedIpc('echoo:open-logs-folder', async () => openLogsFolder());
  handleTrustedIpc('echoo:restart', async () => {
    if (updateRestartBlocked()) {
      return { restarted: false, busy: true };
    }
    app.relaunch();
    isQuitting = true;
    app.exit(0);
    return { restarted: true };
  });

  handleTrustedIpc('echoo:copy-text', async (_event, value) => {
    try {
      const text = String(value || '');
      if (!text || text.length > 32768) {
        return { copied: false, reason: text ? 'too-long' : 'empty' };
      }
      clipboard.writeText(text);
      return { copied: true };
    } catch (error) {
      log.warn('[echoo-desktop] copy-text failed:', error.message);
      return { copied: false, reason: 'error' };
    }
  });

  handleTrustedIpc('echoo:get-initial-deep-link', async () => {
    const route = pendingDeepLink;
    pendingDeepLink = null;
    return route;
  });

  handleTrustedIpc('echoo:get-microphone-access-status', async () => {
    if (process.platform !== 'win32' && process.platform !== 'darwin') return 'unknown';
    try {
      return systemPreferences.getMediaAccessStatus('microphone') || 'unknown';
    } catch (error) {
      log.warn('[echoo-desktop] microphone status check failed:', error.message);
      return 'unknown';
    }
  });

  handleTrustedIpc('echoo:get-app-info', async () => {
    try {
      return {
        ok: true,
        appName: app.getName(),
        appVersion: app.getVersion(),
        platform: process.platform,
        startUrl: app.isPackaged && !DEV_URL_IS_EXPLICIT ? PACKAGED_RENDERER_URL : DEV_URL,
        publicAppOrigin: PUBLIC_APP_ORIGIN,
      };
    } catch (error) {
      log.warn('[echoo-desktop] get-app-info failed:', error.message);
      return { ok: false };
    }
  });

  handleTrustedIpc('echoo:get-room-state', async () => {
    try {
      return { ...roomState };
    } catch (error) {
      log.warn('[echoo-desktop] get-room-state failed:', error.message);
      return { ...roomState };
    }
  });

  handleTrustedIpc('echoo:notify', async (_event, options = {}) => {
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
        title = typeof options.title === 'string' && options.title
          ? options.title.trim().slice(0, 80)
          : 'Echoo';
        body = typeof options.body === 'string' ? options.body.trim().slice(0, 240) : '';
      }

      showNotification({ title, body, silent: options.silent === true });
      return { shown: true };
    } catch (error) {
      log.warn('[echoo-desktop] echoo:notify failed:', error.message);
      return { shown: false, reason: 'error' };
    }
  });

  handleTrustedIpc('echoo:get-notification-preferences', async () => {
    try {
      return readPrefs();
    } catch (error) {
      log.warn('[echoo-desktop] get-notification-preferences failed:', error.message);
      return { notificationsEnabled: true, notificationEvents: { ...DEFAULT_NOTIFICATION_EVENTS } };
    }
  });

  handleTrustedIpc('echoo:set-notification-preferences', async (_event, update = {}) => {
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
  handleTrustedIpc('echoo:get-notification-preference', async () => {
    const prefs = readPrefs();
    return { notificationsEnabled: prefs.notificationsEnabled };
  });
  handleTrustedIpc('echoo:set-notification-preference', async (_event, enabled) => {
    const prefs = readPrefs();
    prefs.notificationsEnabled = enabled === true;
    return { notificationsEnabled: writePrefs(prefs).notificationsEnabled };
  });

  handleTrustedIpc('echoo:set-room-state', async (_event, state = {}) => {
    try {
      const wasActive = roomState.active === true;
      const requestedMode = String(state.mode || '').toLowerCase();
      const requestedKind = String(state.kind || '').toLowerCase();
      const active = state.active === true;
      const mode = active && ['creator', 'listener'].includes(requestedMode)
        ? requestedMode
        : 'idle';
      const kind = active && ['broadcast', 'live', 'replay'].includes(requestedKind)
        ? requestedKind
        : mode === 'creator'
          ? 'broadcast'
          : mode === 'listener'
            ? 'live'
            : 'idle';
      roomState = {
        active,
        mode,
        kind,
        title: active ? String(state.title || '').trim().slice(0, 120) : '',
        muted: state.muted === true,
        playing: state.playing === true,
        canToggleMute: state.canToggleMute === true,
        canTogglePlay: state.canTogglePlay === true,
        keepAwake: state.keepAwake === true,
      };
      syncPowerSaveBlocker();
      refreshTrayMenu();

      if (wasActive && !roomState.active && pendingUpdateReady) {
        void promptForDownloadedUpdate();
      }
      return { ...roomState };
    } catch (error) {
      log.warn('[echoo-desktop] set-room-state failed:', error.message);
      return { ...roomState };
    }
  });

  // --- Windows auto-launch on system startup (optional toggle) -------------
  handleTrustedIpc('echoo:set-auto-launch', async (_event, enabled) => {
    try {
      const openAtLogin = enabled === true;
      app.setLoginItemSettings({ openAtLogin });
      return { openAtLogin };
    } catch (error) {
      log.warn('[echoo-desktop] set-auto-launch failed:', error.message);
      return { openAtLogin: false };
    }
  });

  handleTrustedIpc('echoo:get-auto-launch', async () => {
    try {
      const { openAtLogin } = app.getLoginItemSettings();
      return { openAtLogin: !!openAtLogin };
    } catch (error) {
      log.warn('[echoo-desktop] get-auto-launch failed:', error.message);
      return { openAtLogin: false };
    }
  });

  handleTrustedIpc('echoo:reload', async () => {
    try {
      if (updateRestartBlocked()) {
        return { ok: false, busy: true, error: 'Echoo cannot reload during active audio or a recording save.' };
      }
      if (DEV_URL_IS_EXPLICIT || !app.isPackaged) {
        // Test/debug override (also honored in packaged builds so the packaged
        // boot test can point at a fixture server).
        await loadDevUrl();
      } else {
        await loadPackagedRenderer();
      }
      return { ok: true };
    } catch (error) {
      log.warn('[echoo-desktop] reload failed:', error.message);
      return { ok: false, error: error?.message || String(error) };
    }
  });

  // Graceful-shutdown handshake: renderer answers will-quit with quitReady().
  // Creator recording library: ~/Desktop/Echoo Recordings. Long recordings
  // use a chunked IPC protocol so multi-GB RF64/WAV files never cross the
  // context bridge as one giant ArrayBuffer.
  handleTrustedIpc('echoo:recording-save-begin', async (_event, options = {}) => {
    try {
      const format = String(options?.format || 'mp3').toLowerCase() === 'wav' ? 'wav' : 'mp3';
      const rawName = String(options?.filename || `Echoo - recording.${format}`)
        .replace(/[\\/:*?"<>|]/g, '-')
        .slice(0, 180) || `Echoo - recording.${format}`;
      const filename = rawName.toLowerCase().endsWith(`.${format}`)
        ? rawName
        : `${rawName}.${format}`;
      const baseLibraryDir = recordingsLibraryRoot();

      const recordedAt = new Date(options?.startedAt || Date.now());
      const safeDate = Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt;
      const yearDir = String(safeDate.getFullYear());
      const month = String(safeDate.getMonth() + 1).padStart(2, '0');
      const monthName = safeDate.toLocaleString('en', { month: 'long' });
      const automatic = options?.automatic === true;
      const libraryDir = automatic
        ? path.join(baseLibraryDir, yearDir, `${month} - ${monthName}`)
        : baseLibraryDir;
      await fs.promises.mkdir(libraryDir, { recursive: true });

      let destination = '';

      if (automatic) {
        const parsed = path.parse(filename);
        let copyNumber = 1;
        while (!destination) {
          const candidate = copyNumber === 1
            ? path.join(libraryDir, filename)
            : path.join(libraryDir, `${parsed.name} (${copyNumber})${parsed.ext}`);
          if (!fs.existsSync(candidate) && !recordingDestinationInUse(candidate)) {
            destination = candidate;
            break;
          }
          copyNumber += 1;
        }
      } else {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: `Save recording as ${format.toUpperCase()} — Echoo Recordings`,
          defaultPath: path.join(libraryDir, filename),
          filters: format === 'wav'
            ? [{ name: 'WAV audio', extensions: ['wav'] }, { name: 'All files', extensions: ['*'] }]
            : [{ name: 'MP3 audio', extensions: ['mp3'] }, { name: 'All files', extensions: ['*'] }],
        });
        if (result.canceled || !result.filePath) {
          return { started: false, cancelled: true };
        }
        destination = result.filePath;
        if (recordingDestinationInUse(destination)) {
          return { started: false, error: 'That recording destination is already being written by Echoo.' };
        }
      }

      const sessionId = crypto.randomUUID();
      const partialPath = recordingPartialPath(destination, sessionId);
      const handle = await fs.promises.open(partialPath, 'wx');
      const requestedTotalBytes = Number(options?.totalBytes);
      recordingSaveSessions.set(sessionId, {
        handle,
        destination,
        partialPath,
        folder: path.dirname(destination),
        automatic,
        format,
        totalBytes:
          Number.isFinite(requestedTotalBytes) && requestedTotalBytes > 0
            ? Math.min(requestedTotalBytes, Number.MAX_SAFE_INTEGER)
            : 0,
        state: 'writing',
        bytesWritten: 0,
        writeChain: Promise.resolve(),
      });
      refreshRecordingTaskbarProgress();
      refreshTrayMenu();
      return {
        started: true,
        sessionId,
        path: destination,
        folder: path.dirname(destination),
        automatic,
      };
    } catch (error) {
      log.warn('[echoo-desktop] recording-save-begin failed:', error.message);
      return { started: false, error: error?.message || String(error) };
    }
  });

  handleTrustedIpc('echoo:recording-save-chunk', async (_event, payload = {}) => {
    const sessionId = String(payload?.sessionId || '');
    const session = recordingSaveSessions.get(sessionId);
    if (!session || session.state !== 'writing') {
      return { written: false, error: 'Recording save session is not accepting more data.' };
    }

    try {
      const buffer = Buffer.isBuffer(payload?.data)
        ? payload.data
        : Buffer.from(payload?.data || []);
      if (!buffer.length) return { written: true, bytesWritten: session.bytesWritten };
      if (buffer.length > MAX_RECORDING_IPC_CHUNK_BYTES) {
        return {
          written: false,
          error: `Recording chunk exceeds ${MAX_RECORDING_IPC_CHUNK_BYTES} bytes.`,
        };
      }

      session.writeChain = session.writeChain.then(async () => {
        await session.handle.write(buffer, 0, buffer.length, null);
        session.bytesWritten += buffer.length;
      });
      await session.writeChain;
      refreshRecordingTaskbarProgress();
      return { written: true, bytesWritten: session.bytesWritten };
    } catch (error) {
      log.warn('[echoo-desktop] recording-save-chunk failed:', error.message);
      return { written: false, error: error?.message || String(error) };
    }
  });

  handleTrustedIpc('echoo:recording-save-finish', async (_event, sessionIdValue) => {
    const sessionId = String(sessionIdValue || '');
    const session = recordingSaveSessions.get(sessionId);
    if (!session || session.state !== 'writing') {
      return { saved: false, error: 'Recording save session is not active.' };
    }

    // Keep the session registered while sync/close/atomic rename is still in
    // progress. That keeps Quit and auto-update blocked until bytes are
    // genuinely durable, while the state flag prevents any late chunk append.
    session.state = 'finalizing';
    refreshRecordingTaskbarProgress();
    try {
      await session.writeChain;
      if (!session.bytesWritten) {
        await session.handle.close().catch(() => null);
        await fs.promises.rm(session.partialPath, { force: true }).catch(() => null);
        return { saved: false, error: 'Recording bytes are empty.' };
      }
      await session.handle.sync();
      await session.handle.close();
      await commitRecordingPartial(session.partialPath, session.destination, sessionId);
      rememberRecordingPath(session.destination);
      return {
        saved: true,
        path: session.destination,
        folder: session.folder,
        automatic: session.automatic,
        bytesWritten: session.bytesWritten,
      };
    } catch (error) {
      await session.handle.close().catch(() => null);
      log.warn('[echoo-desktop] recording-save-finish failed:', error.message);
      return {
        saved: false,
        error: error?.message || String(error),
        recoveryPath: fs.existsSync(session.partialPath) ? session.partialPath : '',
        folder: session.folder,
      };
    } finally {
      recordingSaveSessions.delete(sessionId);
      refreshRecordingTaskbarProgress();
      refreshTrayMenu();
      if (!recordingSaveSessions.size && pendingUpdateReady && !roomState.active) {
        void promptForDownloadedUpdate();
      }
    }
  });

  handleTrustedIpc('echoo:recording-save-abort', async (_event, sessionIdValue) => {
    const sessionId = String(sessionIdValue || '');
    const session = recordingSaveSessions.get(sessionId);
    if (!session) return { aborted: true };
    if (session.state !== 'writing') return { aborted: false, finalizing: true };

    session.state = 'aborting';
    try {
      try { await session.writeChain; } catch { /* close what is durable */ }
      await session.handle.close().catch(() => null);
      await fs.promises.rm(session.partialPath, { force: true }).catch(() => null);
      return { aborted: true };
    } finally {
      recordingSaveSessions.delete(sessionId);
      refreshRecordingTaskbarProgress();
      refreshTrayMenu();
      if (!recordingSaveSessions.size && pendingUpdateReady && !roomState.active) {
        void promptForDownloadedUpdate();
      }
    }
  });

  // Legacy bounded save remains for older renderer bundles. Current builds use
  // the chunked protocol above for long recordings.
  handleTrustedIpc('echoo:save-recording', async (_event, options = {}) => {
    try {
      const format = String(options?.format || 'mp3').toLowerCase() === 'wav' ? 'wav' : 'mp3';
      const rawName = String(options?.filename || `Echoo - recording.${format}`)
        .replace(/[\\/:*?"<>|]/g, '-')
        .slice(0, 180) || `Echoo - recording.${format}`;
      const filename = rawName.toLowerCase().endsWith(`.${format}`) ? rawName : `${rawName}.${format}`;
      const baseLibraryDir = recordingsLibraryRoot();

      const recordedAt = new Date(options?.startedAt || Date.now());
      const safeDate = Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt;
      const yearDir = String(safeDate.getFullYear());
      const month = String(safeDate.getMonth() + 1).padStart(2, '0');
      const monthName = safeDate.toLocaleString('en', { month: 'long' });
      const libraryDir = options?.automatic === true
        ? path.join(baseLibraryDir, yearDir, `${month} - ${monthName}`)
        : baseLibraryDir;
      await fs.promises.mkdir(libraryDir, { recursive: true });

      const buffer = Buffer.isBuffer(options?.data) ? options.data : Buffer.from(options?.data || []);
      if (!buffer.length) return { saved: false, error: 'Recording bytes are empty.' };
      if (buffer.length > MAX_LEGACY_RECORDING_IPC_BYTES) {
        return {
          saved: false,
          error: 'This recording must use Echoo’s chunked desktop save protocol.',
        };
      }

      if (options?.automatic === true) {
        const parsed = path.parse(filename);
        let destination = path.join(libraryDir, filename);
        let copyNumber = 2;
        while (fs.existsSync(destination)) {
          destination = path.join(libraryDir, `${parsed.name} (${copyNumber})${parsed.ext}`);
          copyNumber += 1;
        }
        await writeRecordingAtomically(destination, buffer);
        rememberRecordingPath(destination);
        return {
          saved: true,
          path: destination,
          folder: libraryDir,
          automatic: true,
        };
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        title: `Save recording as ${format.toUpperCase()} — Echoo Recordings`,
        defaultPath: path.join(libraryDir, filename),
        filters: format === 'wav'
          ? [{ name: 'WAV audio', extensions: ['wav'] }, { name: 'All files', extensions: ['*'] }]
          : [{ name: 'MP3 audio', extensions: ['mp3'] }, { name: 'All files', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePath) return { saved: false, cancelled: true };
      await writeRecordingAtomically(result.filePath, buffer);
      rememberRecordingPath(result.filePath);
      return { saved: true, path: result.filePath, folder: path.dirname(result.filePath) };
    } catch (error) {
      log.warn('[echoo-desktop] save-recording failed:', error.message);
      return { saved: false, error: error?.message || String(error) };
    }
  });

  handleTrustedIpc('echoo:open-recordings-folder', async (_event, targetPath) => {
    try {
      const baseLibraryDir = recordingsLibraryRoot();
      await fs.promises.mkdir(baseLibraryDir, { recursive: true });
      const requested = String(targetPath || '').trim();
      let folder = baseLibraryDir;
      if (requested) {
        const candidate = path.resolve(requested);
        const requestedFile = safeRecordingPath(candidate);
        const requestedFolder = requestedFile
          ? path.dirname(requestedFile)
          : safeRecordingFolder(candidate);
        if (requestedFolder) folder = requestedFolder;
      }
      const result = await shell.openPath(folder);
      return result ? { opened: false, error: result } : { opened: true, path: folder };
    } catch (error) {
      log.warn('[echoo-desktop] open recordings folder failed:', error.message);
      return { opened: false, error: error?.message || String(error) };
    }
  });

  handleTrustedIpc('echoo:open-recording', async (_event, targetPath) => {
    try {
      const recordingPath = safeRecordingPath(targetPath);
      if (!recordingPath) return { opened: false, error: 'Recording path is not allowed.' };
      const result = await shell.openPath(recordingPath);
      return result ? { opened: false, error: result } : { opened: true, path: recordingPath };
    } catch (error) {
      log.warn('[echoo-desktop] open recording failed:', error.message);
      return { opened: false, error: 'Echoo could not open that recording.' };
    }
  });

  handleTrustedIpc('echoo:show-recording', async (_event, targetPath) => {
    try {
      const recordingPath = safeRecordingPath(targetPath);
      if (!recordingPath) return { shown: false, error: 'Recording path is not allowed.' };
      shell.showItemInFolder(recordingPath);
      return { shown: true, path: recordingPath };
    } catch (error) {
      log.warn('[echoo-desktop] show recording failed:', error.message);
      return { shown: false, error: 'Echoo could not show that recording.' };
    }
  });

  handleTrustedIpc('echoo:rename-recording', async (_event, payload = {}) => {
    try {
      const recordingPath = safeRecordingPath(payload?.path);
      if (!recordingPath) return { renamed: false, error: 'Recording path is not allowed.' };
      const requestedName = String(payload?.name || '').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);
      if (!requestedName) return { renamed: false, error: 'Enter a recording name.' };
      const extension = path.extname(recordingPath).toLowerCase();
      const nameWithoutExtension = requestedName.toLowerCase().endsWith(extension)
        ? requestedName.slice(0, -extension.length)
        : requestedName;
      const destination = path.join(path.dirname(recordingPath), `${nameWithoutExtension}${extension}`);
      // Renaming never changes the directory. Managed-library files stay
      // inside the library; explicit exports stay inside the exact folder the
      // user selected through the native Save dialog.
      if (
        !isPathInside(recordingsLibraryRoot(), destination) &&
        !trustedRecordingPaths.has(recordingPath)
      ) {
        return { renamed: false, error: 'Recording destination is not allowed.' };
      }
      if (fs.existsSync(destination)) return { renamed: false, error: 'A recording with that name already exists.' };
      await fs.promises.rename(recordingPath, destination);
      forgetRecordingPath(recordingPath);
      rememberRecordingPath(destination);
      return { renamed: true, path: destination };
    } catch (error) {
      log.warn('[echoo-desktop] rename recording failed:', error.message);
      return { renamed: false, error: 'Echoo could not rename that recording.' };
    }
  });

  handleTrustedIpc('echoo:trash-recording', async (_event, targetPath) => {
    try {
      const recordingPath = safeRecordingPath(targetPath);
      if (!recordingPath) return { trashed: false, error: 'Recording path is not allowed.' };
      await shell.trashItem(recordingPath);
      forgetRecordingPath(recordingPath);
      return { trashed: true, path: recordingPath };
    } catch (error) {
      log.warn('[echoo-desktop] trash recording failed:', error.message);
      return { trashed: false, error: 'Echoo could not move that recording to the Recycle Bin.' };
    }
  });

  ipcMain.on('echoo:quit-ready', (event) => {
    if (!isTrustedIpcEvent(event)) {
      log.warn('[echoo-desktop] blocked untrusted IPC caller on echoo:quit-ready');
      return;
    }
    log.info('[echoo-desktop] renderer reported clean shutdown');
    void finalizeDesktopQuit('renderer clean shutdown');
  });
}

async function finalizeDesktopQuit(reason = 'application quit') {
  if (quitFinalizing) return;
  quitFinalizing = true;

  if (quitTimer) {
    clearTimeout(quitTimer);
    quitTimer = null;
  }

  // Main-process recording streams are independent of the renderer cleanup
  // handshake. Flush/sync/close them before app.exit so a quit never races the
  // filesystem and silently truncates a long local recording.
  try {
    await Promise.race([
      preserveInterruptedRecordingSessions(reason),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch (error) {
    log.warn('[echoo-desktop] quit recording preservation failed:', error.message);
  }

  isQuitting = true;
  app.exit(0);
}

// ---------------------------------------------------------------------------
// Auto-updates (GitHub Releases). Non-blocking: failures (offline, no releases
// yet, no network) are logged and never block startup. A 404 for the update
// manifest just means nothing is published for this channel yet — that is
// routine on a fresh repo, so it logs at info instead of warning.
// ---------------------------------------------------------------------------
function isMissingReleaseError(error) {
  const message = String(error?.message || error || '');
  return message.includes('404') || message.includes('latest.yml');
}

function updateRestartBlocked() {
  return roomState.active || recordingSaveSessions.size > 0;
}

// Some Windows NSIS one-click installations replace Echoo successfully but do not
// relaunch it after quitAndInstall. Keep an independent, bounded Windows-only
// watchdog alive through the installer process. It will only reopen the exact
// installed executable after its on-disk version matches the downloaded update,
// and only if the updater has not already restarted the application.
function scheduleWindowsUpdateRelaunch(expectedVersion) {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(String(expectedVersion || ''))) return;

  const exePath = process.execPath;
  if (path.basename(exePath).toLowerCase() !== 'echoo.exe') return;

  const encodedExe = Buffer.from(exePath, 'utf8').toString('base64');
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$sourceProcessId = ' + String(process.pid),
    '$exe = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("' + encodedExe + '"))',
    '$expected = "' + expectedVersion + '"',
    '$deadline = (Get-Date).AddMinutes(3)',
    'while ((Get-Date) -lt $deadline) {',
    '  Start-Sleep -Seconds 2',
    '  if (Get-Process -Id $sourceProcessId -ErrorAction SilentlyContinue) { continue }',
    '  if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { continue }',
    '  $found = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion',
    '  if (-not $found) { continue }',
    '  $installed = $found -replace "(\\.0)+$", ""',
    '  if ($installed -ne $expected) { continue }',
    '  Start-Sleep -Seconds 8',
    "  $alreadyRunning = @(Get-CimInstance Win32_Process -Filter \"Name='Echoo.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $exe, [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0",
    '  if (-not $alreadyRunning) {',
    '    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue',
    '    Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe)',
    '  }',
    '  break',
    '}',
  ].join('\n');

  try {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-EncodedCommand', encoded,
    ], { detached: true, windowsHide: true, stdio: 'ignore' });
    child.on('error', (error) => {
      log.warn('[echoo-desktop] Windows updater relaunch watchdog unavailable:', error.message);
    });
    child.unref();
  } catch (error) {
    log.warn('[echoo-desktop] Windows updater relaunch watchdog failed to start:', error.message);
  }
}

async function promptForDownloadedUpdate() {
  if (!pendingUpdateReady || updatePromptOpen || updateRestartBlocked()) return;

  updatePromptOpen = true;
  try {
    const { response } = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Echoo update ready',
      message: 'An Echoo update is ready to install.',
      detail: 'Restart Echoo now, or continue working and install it later.',
    });

    if (response === 0) {
      if (updateRestartBlocked()) {
        log.info('[echoo-desktop] update restart deferred because protected audio/file work became active');
        return;
      }
      // Skip Electron's ordinary graceful-quit handshake: the audio/recording
      // idle check above has already proved it is safe to install.
      // A genuine update exit must not become a normal renderer shutdown.
      pendingUpdateReady = false;
      isQuitting = true;
      try {
        scheduleWindowsUpdateRelaunch(pendingUpdateVersion);
        getAutoUpdater().quitAndInstall(true, true);
      } catch (error) {
        isQuitting = false;
        pendingUpdateReady = true;
        log.error('[echoo-desktop] Windows update could not begin:', error.message);
        throw error;
      }
    }
  } catch (error) {
    log.warn('[echoo-desktop] update prompt failed:', error.message);
  } finally {
    updatePromptOpen = false;
  }
}

function checkForUpdates() {
  if (!app.isPackaged || process.env.ECHOO_DISABLE_UPDATES === '1') return; // deterministic tests may opt out
  try {
    const updater = getAutoUpdater();
    updater.autoDownload = true;
    // Installation is an explicit idle-state action. The updater must never
    // piggyback on a quit that is still preserving live audio or recording
    // data; promptForDownloadedUpdate is the only install entry point.
    updater.autoInstallOnAppQuit = false;
    updater.on('update-downloaded', (info) => {
      pendingUpdateVersion = String(info?.version || '');
      pendingUpdateReady = true;
      if (updateRestartBlocked()) {
        log.info('[echoo-desktop] update downloaded — deferring restart prompt until protected work ends');
        try {
          const notice = new Notification({
            title: 'Echoo update ready',
            body: recordingSaveSessions.size > 0
              ? 'The update will wait until your recording finishes saving.'
              : roomState.mode === 'creator'
                ? 'The update will wait until your live broadcast has ended.'
                : 'The update will wait until you leave the live room.',
            silent: true,
          });
          notice.on('click', () => showAndFocusWindow());
          notice.show();
        } catch {
          // Update remains queued even when native notifications are unavailable.
        }
        return;
      }
      void promptForDownloadedUpdate();
    });
    updater.on('error', (error) => {
      if (isMissingReleaseError(error)) {
        log.info('[echoo-desktop] no published desktop release found — skipping update check');
        return;
      }
      log.warn('[echoo-desktop] update check failed (non-fatal):', error?.message || error);
    });
    updater.checkForUpdates().catch((error) => {
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

function installOfflineSmokeNetworkBlocker() {
  if (!OFFLINE_SMOKE_TEST) return;

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true })
  );
  log.info('[echoo-desktop] offline smoke mode: remote HTTP(S) requests are blocked');
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
function startApp() {
  try {
    logStartupEvent('app-ready');
    if (process.platform === 'win32') {
      // Keep Windows notifications, taskbar grouping, Start-menu identity and
      // protocol activation attached to the same application identity that
      // electron-builder registers for the installer.
      app.setAppUserModelId('com.echoo.desktop');
    }
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient('echoo');
    } else if (process.platform === 'win32') {
      app.setAsDefaultProtocolClient('echoo', process.execPath, [path.resolve(process.argv[1] || '.')]);
    }
    registerIpc();
    buildMenu();
    installPermissionPolicy();
    installOfflineSmokeNetworkBlocker();
    if (app.isPackaged) {
      registerPackagedRendererProtocol();
      installProdCsp();
    }
    createWindow();
  } catch (error) {
    log.error('[echoo-desktop] startup failed:', error);
    app.quit();
  }
}

// Graceful shutdown: give the renderer a chance to leave LiveKit rooms and
// close sockets before the process exits (2s grace, then force).
app.on('before-quit', (event) => {
  if (isQuitting || !mainWindow) return;

  if (recordingSaveSessions.size > 0) {
    event.preventDefault();
    showAndFocusWindow();
    try {
      const notice = new Notification({
        title: 'Recording is still saving',
        body: 'Echoo will stay open until the recording finishes safely.',
        silent: true,
      });
      notice.on('click', () => showAndFocusWindow());
      notice.show();
    } catch {
      // The save still remains protected if Windows notifications are unavailable.
    }
    return;
  }

  // Ending a creator broadcast is a product operation, not the same thing as
  // closing a desktop process. Never let File > Quit, Alt+F4, or the tray
  // silently bypass Echoo's End Broadcast + recording-finalization flow.
  if (roomState.active && roomState.mode === 'creator') {
    event.preventDefault();
    showAndFocusWindow();

    if (!creatorQuitWarningOpen) {
      creatorQuitWarningOpen = true;
      void dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Open Creator Studio', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        title: 'End your broadcast before quitting',
        message: 'Echoo is still live.',
        detail: 'End the broadcast from Creator Studio first so listeners disconnect cleanly and your recording can finish safely.',
      }).then(({ response }) => {
        if (response === 0) {
          showAndFocusWindow();
          sendRoomCommand('request-end-broadcast');
        }
      }).catch((error) => {
        log.warn('[echoo-desktop] creator quit warning failed:', error.message);
      }).finally(() => {
        creatorQuitWarningOpen = false;
      });
    }
    return;
  }

  event.preventDefault();
  log.info('[echoo-desktop] quit requested — waiting for renderer cleanup');
  try {
    mainWindow.webContents.send('echoo:will-quit');
  } catch (error) {
    log.warn('[echoo-desktop] will-quit send failed:', error.message);
  }
  quitTimer = setTimeout(() => {
    quitTimer = null;
    log.warn('[echoo-desktop] renderer cleanup timed out — preserving native recording streams before exit');
    void finalizeDesktopQuit('renderer cleanup timeout');
  }, 2000);
  if (quitTimer.unref) quitTimer.unref();
});

app.on('will-quit', () => {
  clearStartupReadyTimeout();
  clearDelayedAppReady();
  destroySplashWindow('app-quit');
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = null;
  }
  roomState = {
    active: false,
    mode: 'idle',
    kind: 'idle',
    title: '',
    muted: false,
    playing: false,
    canToggleMute: false,
    canTogglePlay: false,
    keepAwake: false,
  };
  syncPowerSaveBlocker();

  // Normal before-quit paths flush native recording streams in
  // finalizeDesktopQuit() before app.exit. will-quit remains synchronous and
  // only releases lightweight process state.
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
  app.quit();
});
