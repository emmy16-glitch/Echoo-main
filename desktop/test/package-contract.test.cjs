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
const listenerV2Source = fs.readFileSync(
  path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'ListenerV2', 'ListenerV2.jsx'),
  'utf8'
);
const creatorMixerSource = fs.readFileSync(
  path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorStudio', 'CreatorAudioMixer.jsx'),
  'utf8'
);
const mixerServiceSource = fs.readFileSync(
  path.resolve(desktopRoot, '..', 'frontend', 'src', 'services', 'echooMixerService.js'),
  'utf8'
);
const windowsWorkflow = fs.readFileSync(
  path.resolve(desktopRoot, '..', '.github', 'workflows', 'desktop-windows.yml'),
  'utf8'
);
const backendAppSource = fs.readFileSync(
  path.resolve(desktopRoot, '..', 'backend', 'src', 'app.js'),
  'utf8'
);

test('Windows package identity and artifact are canonical', () => {
  assert.equal(packageJson.version, '2.0.0');
  assert.equal(packageJson.build.productName, 'Echoo');
  assert.equal(packageJson.build.win.artifactName, 'Echoo-Setup-${version}-${arch}.${ext}');
  assert.deepEqual(packageJson.build.win.target[0].arch, ['x64']);
  assert.deepEqual(packageJson.build.protocols[0].schemes, ['echoo']);
});

test('packaged runtime loads the local renderer from one private desktop origin', () => {
  assert.match(mainSource, /loadPackagedRenderer\(\)/);
  assert.match(mainSource, /protocol\.registerSchemesAsPrivileged/);
  assert.match(mainSource, /protocol\.handle\(PACKAGED_APP_SCHEME/);
  assert.match(mainSource, /mainWindow\.loadURL\(PACKAGED_RENDERER_URL\)/);
  assert.doesNotMatch(mainSource, /mainWindow\.loadURL\(PUBLIC_APP_ORIGIN\)/);
  assert.match(backendAppSource, /DESKTOP_RENDERER_ORIGIN = 'echoo-app:\/\/app'/);
  assert.doesNotMatch(backendAppSource, /ECHOO_DESKTOP/);
  assert.ok(packageJson.build.files.includes('frontend-dist/**/*'));
});

test('Windows desktop CI follows the shared backend origin contract', () => {
  assert.match(windowsWorkflow, /backend\/src\/app\.js/);
  assert.match(windowsWorkflow, /backend\/src\/config\/env\.js/);
  assert.match(backendAppSource, /if \(normalized === DESKTOP_RENDERER_ORIGIN\) return true;/);
  assert.match(
    backendAppSource,
    /app\.use\(\s*cors\(\{\s*origin:\s*echooCorsOrigin/
  );
  assert.match(
    backendAppSource,
    /new Server\(server,\s*\{\s*cors:\s*\{\s*origin:\s*echooCorsOrigin/
  );
  assert.doesNotMatch(backendAppSource, /DESKTOP_RENDERER_ORIGIN\s*=\s*['"]null['"]/);
  assert.equal(
    fs.existsSync(path.resolve(desktopRoot, '..', 'backend', 'src', 'config', 'cors.js')),
    false,
    'unused legacy CORS policy must not drift away from the canonical HTTP/Socket.IO policy'
  );
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
  assert.match(mainSource, /ECHOO_DESKTOP_SMOKE_TEST/);
  assert.match(mainSource, /SMOKE_TEST_MODE/);
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
  assert.equal(
    fs.existsSync(path.join(desktopRoot, 'scripts', 'prepare-bundled-backend.js')),
    false,
    'legacy secret-bundling script must not return'
  );
  assert.equal(
    fs.existsSync(path.join(desktopRoot, 'entitlements.mac.plist')),
    false,
    'Windows-only desktop must not keep stale macOS packaging files'
  );
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


test('Windows package ships real Echoo icon assets', () => {
  for (const relativePath of ['assets/icon.png', 'assets/tray-icon.png']) {
    const absolutePath = path.join(desktopRoot, relativePath);
    assert.equal(fs.existsSync(absolutePath), true, `${relativePath} must exist`);
    assert.ok(fs.statSync(absolutePath).size > 0, `${relativePath} must not be empty`);
  }
});


test('Creator Studio surfaces microphone loss, recovery, and final failure without a setup wizard', () => {
  assert.match(mixerServiceSource, /echoo:mixer-source-disconnected/);
  assert.match(mixerServiceSource, /echoo:mixer-source-recovered/);
  assert.match(mixerServiceSource, /echoo:mixer-source-recovery-failed/);
  assert.match(creatorMixerSource, /disconnected\. Echoo is reconnecting it/);
  assert.match(creatorMixerSource, /reconnected\./);
  assert.match(creatorMixerSource, /is unavailable\. Choose another input/);
  assert.doesNotMatch(creatorMixerSource, /Let's get your studio ready/i);
});


test('recorded Listener playback owns a desktop tray session without colliding with live rooms', () => {
  assert.match(mainSource, /roomState\.kind === 'replay'/);
  assert.match(mainSource, /toggle-playback/);
  assert.match(mainSource, /stop-playback/);
  assert.match(listenerV2Source, /kind: active \? 'replay' : 'idle'/);
  assert.match(listenerV2Source, /\['loading', 'buffering', 'playing'\]\.includes\(playbackState\)/);
  assert.match(listenerV2Source, /if \(isLiveRoom \|\| liveSession\?\.isLive\) return/);
});


test('recording saves stay crash-safe until the complete file is synced', () => {
  assert.match(mainSource, /\.echoo-partial-/);
  assert.match(mainSource, /commitRecordingPartial/);
  assert.match(mainSource, /await session\.handle\.sync\(\)/);
  assert.match(mainSource, /await commitRecordingPartial\(session\.partialPath, session\.destination, sessionId\)/);
  assert.match(mainSource, /recoveryPath:/);
  assert.match(mainSource, /rm\(session\.partialPath/);
});


test('renderer build preserves canonical checked-in Windows branding assets', () => {
  assert.doesNotMatch(buildSource, /copyFileSync/);
  assert.match(buildSource, /assets\/icon\.png/);
  assert.match(buildSource, /assets\/tray-icon\.png/);
});


test('desktop external links use a narrow default-browser bridge and reload waits for the real result', () => {
  assert.match(mainSource, /echoo:open-external-web-url/);
  assert.match(mainSource, /normalizeExternalWebUrl\(url\)/);
  assert.match(mainSource, /await shell\.openExternal\(normalized\)/);
  assert.match(mainSource, /await loadDevUrl\(\)/);
  assert.match(listenerRoomSource, /Open in browser/);
  assert.match(listenerRoomSource, /openDesktopExternalUrl\(url\)/);
});


test('native recording actions also trust exports selected through the Windows Save dialog', () => {
  assert.match(mainSource, /const trustedRecordingPaths = new Set\(\)/);
  assert.match(mainSource, /rememberRecordingPath\(session\.destination\)/);
  assert.match(mainSource, /rememberRecordingPath\(result\.filePath\)/);
  assert.match(mainSource, /safeRecordingFolder/);
  assert.match(mainSource, /forgetRecordingPath\(recordingPath\)/);
});


test('splash uses the real Echoo mark with restrained non-looping motion', () => {
  const splashHtml = fs.readFileSync(path.join(desktopRoot, 'splash.html'), 'utf8');
  const splashCss = fs.readFileSync(path.join(desktopRoot, 'src', 'splash.css'), 'utf8');
  assert.match(splashHtml, /echoo-mark-primary/);
  assert.match(splashHtml, /echoo-mark-echo/);
  assert.match(splashHtml, /Starting Echoo/);
  assert.doesNotMatch(splashHtml, /progress/i);
  assert.match(splashCss, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(splashCss, /infinite/);
});


test('Creator audio recovery preserves default-device intent and safely falls back monitoring output', () => {
  assert.match(mixerServiceSource, /requestedDeviceId: deviceId/);
  assert.match(mixerServiceSource, /channelId === 'host'[\s\S]{0,180}current\.requestedDeviceId/);
  assert.match(creatorMixerSource, /Monitoring output disconnected\. Echoo switched monitoring to the Windows system default\./);
  assert.match(creatorMixerSource, /setMonitorOutputDevice\('', 'System default'\)/);
});


test('renderer crashes offer recovery and never delete non-empty recording partials on exit', () => {
  assert.match(mainSource, /render-process-gone/);
  assert.match(mainSource, /Restart Echoo/);
  assert.match(mainSource, /preserveInterruptedRecordingSessions\('renderer crash'\)/);
  assert.match(mainSource, /session\.bytesWritten > 0/);
  assert.match(mainSource, /preserved interrupted recording partial/);
  assert.match(mainSource, /async function finalizeDesktopQuit/);
  assert.match(mainSource, /preserveInterruptedRecordingSessions\(reason\)/);
});


test('offline recovery stays retryable when a reload returns a failure result', () => {
  const offlineHtml = fs.readFileSync(path.join(desktopRoot, 'offline.html'), 'utf8');
  const offlineJs = fs.readFileSync(path.join(desktopRoot, 'src', 'offline.js'), 'utf8');
  assert.match(offlineHtml, /role="status"/);
  assert.doesNotMatch(offlineHtml, /Startup detail:/);
  assert.match(offlineJs, /if \(!result\?\.ok\)/);
  assert.match(offlineJs, /setRetryReady/);
});


test('Windows identity and installer verify native protocol registration', () => {
  const installerVerifier = fs.readFileSync(path.join(desktopRoot, 'scripts', 'verify-installer.ps1'), 'utf8');
  assert.match(mainSource, /app\.setAppUserModelId\('com\.echoo\.desktop'\)/);
  assert.match(installerVerifier, /Software\\Classes\\echoo\\shell\\open\\command/);
  assert.match(installerVerifier, /Get-EchooProtocolCommand/);
  assert.match(installerVerifier, /before first launch/);
  assert.match(installerVerifier, /Verified echoo:\/\/ protocol registration/);
});


test('Go Live keeps one truthful control across idle, connecting and live states', () => {
  assert.match(creatorMixerSource, /isLive \? 'LIVE' : goLiveBusy \? 'Connecting…' : 'Go Live'/);
  assert.match(creatorMixerSource, /disabled=\{goLiveBusy \|\| isLive\}/);
  assert.match(creatorWorkspaceSource, /isLive=\{isLive\}/);
  const mixerCss = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorStudio', 'CreatorAudioMixer.css'), 'utf8');
  assert.match(mixerCss, /\.eam-approved-go-live\.is-pending/);
  assert.match(mixerCss, /prefers-reduced-motion:\s*reduce/);
});


test('Creator Recording settings expose the real Windows recordings folder without a fake file manager', () => {
  const settingsSource = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorStudio', 'CreatorSettingsWorkspace.jsx'),
    'utf8'
  );
  assert.match(settingsSource, /openDesktopRecordingsFolder/);
  assert.match(settingsSource, />\s*Open Echoo Recordings\s*</);
});


test('Creator Studio accepts Windows Explorer audio drag and drop without a duplicate setup flow', () => {
  assert.match(creatorMixerSource, /onDragOver=\{handleMediaDragOver\}/);
  assert.match(creatorMixerSource, /onDrop=\{handleMediaDrop\}/);
  assert.match(creatorMixerSource, /window\.echooDesktop\?\.isDesktop === true/);
  assert.match(mixerServiceSource, /AUDIO_FILE_EXTENSION/);
  assert.doesNotMatch(creatorMixerSource, /Let's get your studio ready/i);
});


test('chunked recording saves expose native Windows taskbar progress without buffering whole files', () => {
  assert.match(mainSource, /function refreshRecordingTaskbarProgress\(\)/);
  assert.match(mainSource, /setProgressBar\(-1\)/);
  assert.match(mainSource, /mode: 'indeterminate'/);
  assert.match(mainSource, /mode: 'normal'/);
  assert.match(mainSource, /requestedTotalBytes/);
});


test('installed Windows smoke covers cold-start and second-instance deep links', () => {
  assert.match(mainSource, /SECOND_INSTANCE_SMOKE_TEST/);
  assert.match(mainSource, /smokeSecondInstanceRoute/);
  assert.match(windowsWorkflow, /verify-installer\.ps1 -InstallSmokeTest/);
});


test('desktop restores the last useful workspace without persisting auth screens', () => {
  const lifecycleSource = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'frontend', 'src', 'services', 'desktopLifecycle.js'),
    'utf8'
  );
  assert.match(lifecycleSource, /echooDesktopLastRouteV1/);
  assert.match(lifecycleSource, /restoreLastDesktopWorkspace/);
  assert.match(lifecycleSource, /normalizeDesktopWorkspaceRoute/);
  assert.match(lifecycleSource, /listen\|creator-studio/);
});


test('Windows-only package has no macOS notarization hook or cross-platform tray branches', () => {
  assert.equal(packageJson.build.afterSign, undefined);
  assert.equal(fs.existsSync(path.join(desktopRoot, 'scripts', 'afterSign.js')), false);
  assert.doesNotMatch(mainSource, /process\.platform === 'darwin'/);
  assert.doesNotMatch(mainSource, /AppImage|Snap\/Flatpak|icon\.icns/);
});


test('auto-update waits for recording saves as well as active audio sessions', () => {
  assert.match(mainSource, /function updateRestartBlocked\(\)/);
  assert.match(mainSource, /recordingSaveSessions\.size > 0/);
  assert.match(mainSource, /update will wait until your recording finishes saving/i);
  assert.match(mainSource, /pendingUpdateReady && !roomState\.active/);
});


test('explicit quit waits for native recording streams to be preserved before app.exit', () => {
  assert.match(mainSource, /async function finalizeDesktopQuit/);
  assert.match(mainSource, /await Promise\.race\(\[[\s\S]*preserveInterruptedRecordingSessions/);
  assert.match(mainSource, /renderer cleanup timed out — preserving native recording streams before exit/);
  assert.match(mainSource, /finalizeDesktopQuit\('renderer clean shutdown'\)/);
});


test('desktop uses native Windows context menus only for real text operations', () => {
  assert.match(mainSource, /webContents\.on\('context-menu'/);
  assert.match(mainSource, /params\.isEditable/);
  assert.match(mainSource, /params\.selectionText/);
  assert.match(mainSource, /role: 'cut'/);
  assert.match(mainSource, /role: 'copy'/);
  assert.match(mainSource, /role: 'paste'/);
});


test('main window uses the canonical Windows app icon and reports the real packaged origin', () => {
  assert.match(mainSource, /const WINDOWS_APP_ICON = path\.join\(__dirname, '\.\.\/assets\/icon\.png'\)/);
  assert.match(mainSource, /icon: WINDOWS_APP_ICON/);
  assert.match(mainSource, /startUrl: app\.isPackaged && !DEV_URL_IS_EXPLICIT \? PACKAGED_RENDERER_URL : DEV_URL/);
  assert.doesNotMatch(mainSource, /local:\/\/echoo/);
});


test('renderer permissions are allowlisted and Windows display audio requires a user choice', () => {
  assert.match(mainSource, /function installPermissionPolicy\(\)/);
  assert.match(mainSource, /parsed\.protocol === `\$\{PACKAGED_APP_SCHEME\}:` && parsed\.hostname === 'app'/);
  assert.match(mainSource, /setPermissionCheckHandler/);
  assert.match(mainSource, /setPermissionRequestHandler/);
  assert.match(mainSource, /permission !== 'media'/);
  assert.match(mainSource, /mediaType === 'audio'/);
  assert.match(mainSource, /setDisplayMediaRequestHandler/);
  assert.match(mainSource, /request\.userGesture !== true/);
  assert.match(mainSource, /desktopCapturer\.getSources/);
  assert.match(mainSource, /audio: 'loopback'/);
  assert.match(mainSource, /Choose a screen or window for Echoo audio/);
});


test('recording session remains protected through final sync and atomic commit', () => {
  assert.match(mainSource, /state: 'writing'/);
  assert.match(mainSource, /session\.state = 'finalizing'/);
  assert.match(mainSource, /recordingSaveSessions\.delete\(sessionId\)[\s\S]{0,160}refreshRecordingTaskbarProgress\(\)/);
  assert.match(mainSource, /session\.state !== 'writing'/);
  assert.match(mainSource, /updateRestartBlocked\(\)/);
});


test('shared motion layer avoids banned decorative effects and fully respects reduced motion', () => {
  const motionSource = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'frontend', 'src', 'styles', 'echoo-motion.css'),
    'utf8'
  );
  assert.doesNotMatch(motionSource, /eb-burst|particle burst/i);
  assert.doesNotMatch(motionSource, /eb-shimmer-text|shimmer text sweep/i);
  assert.doesNotMatch(motionSource, /filter:\s*blur/);
  assert.doesNotMatch(motionSource, /scale\(1\.08\)|translateY\(-4px\)/);
  assert.match(motionSource, /prefers-reduced-motion: reduce/);
  assert.match(motionSource, /\.eb-skeleton, \.eb-dots > i \{\s*animation: none;/);
});


test('desktop shell layout overrides never leak into Echoo Web', () => {
  const rendererEntrySource = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'frontend', 'src', 'main.jsx'),
    'utf8'
  );
  const desktopRuntimeCss = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'frontend', 'src', 'styles', 'echoo-desktop-runtime.css'),
    'utf8'
  );
  assert.match(rendererEntrySource, /echoo-desktop-runtime\.css/);
  assert.match(rendererEntrySource, /classList\.add\('echoo-desktop-runtime'\)/);
  assert.match(desktopRuntimeCss, /html\.echoo-desktop-runtime \.studio-final-shell/);
  assert.match(desktopRuntimeCss, /html\.echoo-desktop-runtime \.listener-v2-root/);
  assert.doesNotMatch(desktopRuntimeCss, /^\s*\.studio-final-shell/m);
  assert.doesNotMatch(desktopRuntimeCss, /^\s*\.listener-v2-root/m);
});


test('installed app proves its local shell works with remote HTTP(S) blocked', () => {
  const installerVerifier = fs.readFileSync(path.join(desktopRoot, 'scripts', 'verify-installer.ps1'), 'utf8');
  assert.match(mainSource, /OFFLINE_SMOKE_TEST/);
  assert.match(mainSource, /installOfflineSmokeNetworkBlocker/);
  assert.match(mainSource, /http:\/\/\*\/\*/);
  assert.match(mainSource, /https:\/\/\*\/\*/);
  assert.match(installerVerifier, /ECHOO_DESKTOP_SMOKE_TEST = 'offline'/);
  assert.match(installerVerifier, /offlineNetworkBlocked/);
});


test('installed smoke exercises 100%, 125%, and 150% Windows display scaling', () => {
  const installerVerifier = fs.readFileSync(path.join(desktopRoot, 'scripts', 'verify-installer.ps1'), 'utf8');
  assert.match(mainSource, /DISPLAY_SCALE_SMOKE_TEST/);
  assert.match(mainSource, /devicePixelRatio/);
  assert.match(mainSource, /documentWidth/);
  assert.match(installerVerifier, /@\('1', '1\.25', '1\.5'\)/);
  assert.match(installerVerifier, /force-device-scale-factor/);
});


test('production backend cannot fall back to a private desktop database', () => {
  const databaseSource = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'backend', 'src', 'config', 'database.js'),
    'utf8'
  );
  const productionEnvExample = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'deploy', 'echoo.production.env.example'),
    'utf8'
  );
  const deploymentScript = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'deploy', 'deploy-echoo.sh'),
    'utf8'
  );
  assert.doesNotMatch(databaseSource, /ECHOO_DESKTOP|connectDesktopMemoryDatabase|desktopMemoryServer/);
  assert.doesNotMatch(productionEnvExample, /^ECHOO_DESKTOP=/m);
  assert.doesNotMatch(deploymentScript, /ECHOO_DESKTOP=1/);
});


test('Windows workflow runs packaged Playwright E2E before installer smoke verification', () => {
  assert.equal(packageJson.scripts['test:e2e:packaged'], 'playwright test --config=playwright.config.mjs');
  assert.match(windowsWorkflow, /Run packaged Electron Playwright E2E/);
  assert.match(windowsWorkflow, /npm run test:e2e:packaged --prefix desktop/);
  assert.match(mainSource, /ECHOO_DISABLE_UPDATES/);
});


test('share links use a narrow native Windows clipboard bridge when packaged', () => {
  const stationUrlSource = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'frontend', 'src', 'services', 'stationPublicUrl.js'),
    'utf8'
  );
  assert.match(mainSource, /clipboard\.writeText\(text\)/);
  assert.match(mainSource, /echoo:copy-text/);
  assert.match(desktopBridgeSource, /copyDesktopText/);
  assert.match(creatorWorkspaceSource, /copyTextToClipboard\(url\)/);
  assert.match(stationUrlSource, /window\.echooDesktop\?\.copyText/);
  assert.match(stationUrlSource, /navigatorRef\?\.clipboard\?\.writeText/);
});


test('desktop diagnostics are reachable from both Creator and Listener settings', () => {
  const creatorSettingsSource = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorStudio', 'CreatorSettingsWorkspace.jsx'),
    'utf8'
  );
  const listenerSettingsSource = fs.readFileSync(
    path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'ListenerSettings', 'ListenerSettingsConnected.jsx'),
    'utf8'
  );
  assert.match(mainSource, /echoo:open-logs-folder/);
  assert.match(desktopBridgeSource, /openDesktopLogsFolder/);
  assert.match(creatorSettingsSource, /Open Echoo logs/);
  assert.match(listenerSettingsSource, /Open Echoo logs/);
});


test('runtime product identity stays Echoo while the npm package remains echoo-desktop', () => {
  assert.equal(packageJson.name, 'echoo-desktop');
  assert.equal(packageJson.build.productName, 'Echoo');
  assert.match(mainSource, /app\.setName\('Echoo'\)/);
});


test('window.open never creates browser-like child Electron windows', () => {
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(mainSource, /normalizeRoute\(hashRoute \|\| pathRoute\)/);
  assert.doesNotMatch(mainSource, /setWindowOpenHandler[\s\S]{0,1200}action: 'allow'/);
});


test('public Creator view actions use the Windows default browser instead of child Electron windows', () => {
  const scheduleSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorStudio', 'CreatorScheduleEventsWorkspace.jsx'), 'utf8');
  const stationsSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorStudio', 'CreatorStationsWorkspace.jsx'), 'utf8');
  const analyticsSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorStudio', 'CreatorAnalyticsConnectedWorkspace.jsx'), 'utf8');
  assert.match(scheduleSource, /openPublicWebUrl\(url\)/);
  assert.match(stationsSource, /openPublicWebUrl\(publicUrl\)/);
  assert.match(analyticsSource, /openPublicWebUrl\(broadcast\.replayUrl\)/);
  assert.match(stationsSource, /copyTextToClipboard\(publicUrl\)/);
  assert.doesNotMatch(scheduleSource, /window\.open\(/);
  assert.doesNotMatch(stationsSource, /window\.open\(/);
  assert.doesNotMatch(analyticsSource, /window\.open\(/);
});


test('desktop anti-slop layer removes glass, shimmer gradients, floating cards, and error shaking', () => {
  const desktopRuntimeCss = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'styles', 'echoo-desktop-runtime.css'), 'utf8');
  assert.match(desktopRuntimeCss, /Desktop anti-slop contract/);
  assert.match(desktopRuntimeCss, /background-image:\s*none !important/);
  assert.match(desktopRuntimeCss, /backdrop-filter:\s*none !important/);
  assert.match(desktopRuntimeCss, /\.listener-v2-live-art:hover[\s\S]{0,120}transform:\s*none !important/);
  assert.match(desktopRuntimeCss, /\.eb-shake[\s\S]{0,80}animation:\s*none !important/);
});


test('desktop media URL fallback never references the removed localRuntime symbol', () => {
  const apiSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'services', 'api.js'), 'utf8');
  assert.doesNotMatch(apiSource, /\blocalRuntime\b/);
  assert.match(apiSource, /localDevelopmentRuntime/);
  assert.match(apiSource, /echoo-app:\/\/app/);
});


test('desktop internal navigation never escapes the packaged HashRouter', () => {
  const navigationSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'services', 'appNavigation.js'), 'utf8');
  const errorBoundarySource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'System', 'AppErrorBoundary.jsx'), 'utf8');
  const creatorSetupSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorSetup', 'CreatorSetup.jsx'), 'utf8');
  const scheduleSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorStudio', 'CreatorScheduleEventsWorkspace.jsx'), 'utf8');
  assert.match(navigationSource, /window\.location\.hash/);
  assert.match(navigationSource, /echoo-app:/);
  assert.match(errorBoundarySource, /assignAppRoute\("\/"\)/);
  assert.match(creatorSetupSource, /assignAppRoute\('\/listen'\)/);
  assert.match(scheduleSource, /assignAppRoute\(`/);
  assert.doesNotMatch(errorBoundarySource, /window\.location\.assign/);
  assert.doesNotMatch(creatorSetupSource, /window\.location\.assign/);
});


test('packaged auth uses React Router state instead of the custom-scheme window pathname', () => {
  const registerSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'Register', 'register.jsx'), 'utf8');
  assert.match(registerSource, /useLocation/);
  assert.match(registerSource, /initialAuthAction\(location\.pathname, location\.search\)/);
  assert.doesNotMatch(registerSource, /window\.location\.pathname/);
});


test('HashRouter-sensitive screens use router state and public web URLs', () => {
  const creatorSetupSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'CreatorSetup', 'CreatorSetup.jsx'), 'utf8');
  const listenerSettingsSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'ListenerSettings', 'ListenerSettingsConnected.jsx'), 'utf8');
  const audioDetailSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'ListenerAudioDetail', 'ListenerAudioDetail.jsx'), 'utf8');
  assert.match(creatorSetupSource, /assignAppRoute\('\/creator-studio'\)/);
  assert.doesNotMatch(creatorSetupSource, /window\.location\.assign/);
  assert.match(listenerSettingsSource, /new URLSearchParams\(routerLocation\.search\)/);
  assert.doesNotMatch(listenerSettingsSource, /window\.location\.search/);
  assert.match(audioDetailSource, /getPublicAppUrl/);
  assert.match(audioDetailSource, /copyTextToClipboard\(publicUrl\)/);
  assert.doesNotMatch(audioDetailSource, /url:\s*window\.location\.href/);
});


test('internal and public path helpers reject protocol-relative and traversal routes', () => {
  const navigationSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'services', 'appNavigation.js'), 'utf8');
  const publicUrlSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'services', 'stationPublicUrl.js'), 'utf8');
  assert.match(navigationSource, /raw\.startsWith\('\/\/'\)/);
  assert.match(navigationSource, /\\\.\\\./);
  assert.match(publicUrlSource, /rawPath\.startsWith\('\/\/'\)/);
  assert.match(publicUrlSource, /target\.origin === origin/);
});


test('desktop settings remove marketing decoration and mobile-only haptics', () => {
  const listenerSettingsSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'ListenerSettings', 'ListenerSettingsConnected.jsx'), 'utf8');
  const desktopRuntimeCss = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'styles', 'echoo-desktop-runtime.css'), 'utf8');
  assert.doesNotMatch(listenerSettingsSource, /border-\[#164F9D\]|text-\[0\.68rem\]/);
  assert.match(listenerSettingsSource, /set-mobile-only-preference/);
  assert.match(desktopRuntimeCss, /Settings are a workstation surface/);
  assert.match(desktopRuntimeCss, /\.set-header::after[\s\S]{0,80}display:\s*none !important/);
  assert.match(desktopRuntimeCss, /\.set-mobile-only-preference[\s\S]{0,80}display:\s*none !important/);
});


test('desktop settings are scoped, restrained, and hide mobile-only haptics', () => {
  const listenerSettingsSource = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'Components', 'ListenerSettings', 'ListenerSettingsConnected.jsx'), 'utf8');
  const desktopRuntimeCss = fs.readFileSync(path.resolve(desktopRoot, '..', 'frontend', 'src', 'styles', 'echoo-desktop-runtime.css'), 'utf8');
  assert.match(listenerSettingsSource, /set-desktop-settings-group/);
  assert.match(listenerSettingsSource, /set-mobile-only-preference/);
  assert.match(desktopRuntimeCss, /Settings are a workstation surface/);
  assert.match(desktopRuntimeCss, /set-header::after/);
  assert.match(desktopRuntimeCss, /set-mobile-only-preference/);
});


test('recording saves keep the desktop alive while their window is closed or Quit is requested', () => {
  assert.match(mainSource, /const recordingSaveActive = recordingSaveSessions\.size > 0/);
  assert.match(mainSource, /Recording save continues/);
  assert.match(mainSource, /Recording is still saving/);
  assert.match(mainSource, /Saving recording…/);
  assert.match(mainSource, /refreshTrayMenu\(\)/);
});
