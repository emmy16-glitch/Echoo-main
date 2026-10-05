'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const desktopRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));
const mainSource = fs.readFileSync(path.join(desktopRoot, 'src', 'main.js'), 'utf8');
const buildSource = fs.readFileSync(path.join(desktopRoot, 'scripts', 'build-renderer.mjs'), 'utf8');
const securitySource = fs.readFileSync(path.join(desktopRoot, 'src', 'main', 'security.js'), 'utf8');
const recordingBannerSource = fs.readFileSync(
  path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'RecordingSaveBanner.jsx'),
  'utf8'
);
const desktopBridgeSource = fs.readFileSync(
  path.resolve(desktopRoot, '..', 'frontend', 'src', 'services', 'desktopBridge.js'),
  'utf8'
);
const creatorWorkspaceSource = fs.readFileSync(
  path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorStudio', 'CreatorLiveConnectedWorkspace.jsx'),
  'utf8'
);
const listenerRoomSource = fs.readFileSync(
  path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'ListenerLiveExperience', 'ListenerRealLiveRoom.jsx'),
  'utf8'
);
const windowsWorkflow = fs.readFileSync(
  path.resolve(desktopRoot, '..', '.github', 'workflows', 'desktop-windows.yml'),
  'utf8'
);

test('Windows package identity and artifact are canonical', () => {
  assert.equal(packageJson.version, '2.0.0');
  assert.equal(packageJson.build.productName, 'Echoo');
  assert.equal(packageJson.build.win.artifactName, 'Echoo-Setup-${version}-${arch}.${ext}');
  assert.deepEqual(packageJson.build.win.target[0].arch, ['x64']);
  assert.deepEqual(packageJson.build.protocols[0].schemes, ['echoo']);
});

test('packaged runtime loads the local renderer', () => {
  assert.match(mainSource, /loadPackagedRenderer\(\)/);
  assert.match(mainSource, /mainWindow\.loadFile\(PROD_INDEX\)/);
  assert.doesNotMatch(mainSource, /mainWindow\.loadURL\(PUBLIC_APP_ORIGIN\)/);
  assert.ok(packageJson.build.files.includes('frontend-dist/**/*'));
});

test('renderer build embeds only public client configuration', () => {
  assert.match(buildSource, /VITE_API_URL/);
  assert.match(buildSource, /VITE_PUBLIC_APP_ORIGIN/);
  assert.match(buildSource, /VITE_BUILD_BASE: '\.\/'/);
  for (const secretName of [
    'LIVEKIT_API_SECRET',
    'JWT_SECRET',
    'MONGODB_URI',
    'AWS_SECRET_ACCESS_KEY',
    'CSC_KEY_PASSWORD',
  ]) {
    assert.equal(buildSource.includes(secretName), false, `${secretName} must not be a renderer build input`);
  }
});

test('external handoff rejects non-web schemes', () => {
  assert.match(securitySource, /WEB_PROTOCOLS = new Set\(\['http:', 'https:'\]\)/);
  assert.match(mainSource, /normalizeExternalWebUrl/);
});

test('startup uses a bundled splash and hides the packaged main window until ready', () => {
  assert.ok(packageJson.build.files.includes('splash.html'));
  assert.match(mainSource, /createSplashWindow\(\)/);
  assert.match(mainSource, /show: !app\.isPackaged/);
});

test('Windows release workflow verifies the installed local renderer without server secrets', () => {
  assert.match(windowsWorkflow, /verify-installer\.ps1 -InstallSmokeTest/);
  assert.match(windowsWorkflow, /Echoo-Setup-2\.0\.0-x64\.exe/);
  for (const forbiddenSecret of ['LIVEKIT_API_SECRET', 'JWT_SECRET', 'MONGODB_URI']) {
    assert.equal(windowsWorkflow.includes(forbiddenSecret), false);
  }
  assert.match(mainSource, /ECHOO_DESKTOP_SMOKE_TEST === '1'/);
  assert.match(mainSource, /protocol: window\.location\.protocol/);
});

test('saved desktop recordings expose native Windows file actions', () => {
  assert.match(recordingBannerSource, /openDesktopRecording/);
  assert.match(recordingBannerSource, /showDesktopRecording/);
  assert.match(recordingBannerSource, />\s*Open file\s*</);
  assert.match(recordingBannerSource, />\s*Show in File Explorer\s*</);
});

test('Windows shell restores safe window state and exposes diagnostics', () => {
  assert.match(mainSource, /echoo-window-state\.json/);
  assert.match(mainSource, /intersectsVisibleDisplay/);
  assert.match(mainSource, /getNormalBounds\(\)/);
  assert.match(mainSource, /Open Echoo Logs/);
});

test('desktop never bundles or starts a private Echoo backend', () => {
  assert.doesNotMatch(mainSource, /startBundledBackend/);
  assert.doesNotMatch(mainSource, /ECHOO_LOCAL_BACKEND/);
  assert.doesNotMatch(JSON.stringify(packageJson.build), /backend\/src\/app\.js/);
});

test('legacy recording IPC is bounded and long recordings use chunk sessions', () => {
  assert.match(mainSource, /MAX_RECORDING_IPC_CHUNK_BYTES = 8 \* 1024 \* 1024/);
  assert.match(mainSource, /MAX_LEGACY_RECORDING_IPC_BYTES = 16 \* 1024 \* 1024/);
  assert.match(mainSource, /recording-save-begin/);
  assert.match(mainSource, /recording-save-chunk/);
  assert.match(mainSource, /recording-save-finish/);
  assert.match(mainSource, /recording-save-abort/);
});



test('creator and listener tray state stay distinct and updates never interrupt active audio', () => {
  assert.match(mainSource, /mode: 'idle'/);
  assert.match(mainSource, /roomState\.mode === 'creator'/);
  assert.match(mainSource, /request-end-broadcast/);
  assert.match(mainSource, /pendingUpdateReady/);
  assert.match(mainSource, /promptForDownloadedUpdate/);
  assert.match(mainSource, /End your broadcast before quitting/);
});


test('renderer reports creator and listener native session modes explicitly', () => {
  assert.match(desktopBridgeSource, /mode: state\?\.mode === 'creator'/);
  assert.match(creatorWorkspaceSource, /mode: currentLiveBroadcast\?\.id \? 'creator' : 'idle'/);
  assert.match(creatorWorkspaceSource, /request-end-broadcast/);
  assert.match(listenerRoomSource, /mode: active \? 'listener' : 'idle'/);
});
