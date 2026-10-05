import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

const listenerRouteNames = [
  'following',
  'search',
  'live',
  'live/:broadcastId',
  'channels',
  'channels/:stationId',
  'stations',
  'audio/:audioId',
  'collections/:collectionId',
  'library',
  'library/following',
  'playlist',
  'saved-moments',
  'history',
  'downloads',
  'creator/:creatorId',
  'notifications',
  'profile',
  'settings',
];

const backendRoots = [
  '/audio',
  '/broadcasts',
  '/downloads',
  '/follows',
  '/history',
  '/library',
  '/listener',
  '/notifications',
  '/player',
  '/playlists',
  '/saved-moments',
  '/search',
  '/settings',
  '/stations',
  '/studio',
  '/transcripts',
];

const requireOrderedImports = (sourceText, imports) => {
  let previous = -1;
  for (const item of imports) {
    const index = sourceText.lastIndexOf(item);
    assert.ok(index >= 0, `${item} must be imported`);
    assert.ok(index > previous, `${item} must load after the preceding integrity layer`);
    previous = index;
  }
};

test('Listener routing mounts the canonical V2 shell and canonical design roles', async () => {
  const [preloaders, listener, css] = await Promise.all([
    source('../../frontend/src/routing/routePreloaders.js'),
    source('../../frontend/src/Components/ListenerV2/ListenerV2.jsx'),
    source('../../frontend/src/Components/ListenerV2/ListenerV2.css'),
  ]);

  assert.match(preloaders, /loadListenerV2Module/);
  assert.match(preloaders, /loadListenerLayout = listenerV2Page\('ListenerV2Layout'\)/);
  assert.doesNotMatch(preloaders, /Components\/ListenerLayout\/ListenerLayout/);
  assert.match(listener, /listener-v2-root/);
  assert.match(css, /--listener-v2-font-heading:\s*var\(--heading/);
  assert.match(css, /--listener-v2-font-body:\s*var\(--sans/);
  assert.match(css, /--listener-v2-font-control:\s*var\(--control/);
  assert.match(css, /--listener-v2-blue:\s*var\(--echoo-blue/);
  assert.doesNotMatch(css, /font-family:\s*Inter,/);
});

test('shared sidebar follows nested router state instead of exact-string-only highlighting', async () => {
  const sidebar = await source('../../frontend/src/Components/Shared/Sidebar.jsx');
  assert.match(sidebar, /className=\{\(\{ isActive \}\) =>/);
  assert.match(sidebar, /isActive \|\| explicitActive/);
});

test('Listener V2 owns one five-destination mobile navigation', async () => {
  const listener = await source('../../frontend/src/Components/ListenerV2/ListenerV2.jsx');
  const app = await source('../../frontend/src/App.jsx');

  assert.doesNotMatch(app, /EchooMobileNavigation/);
  assert.match(listener, /className="listener-v2-mobile-nav"/);
  assert.match(listener, /label: 'Discover'/);
  assert.match(listener, /label: 'Following'/);
  assert.match(listener, /label: 'Library'/);
  assert.match(listener, /label: 'Search'/);
  assert.match(listener, /label: 'Profile'/);
  assert.equal((listener.match(/className="listener-v2-mobile-nav"/g) || []).length, 1);
});

test('all final UI integrity layers load in deterministic order after the shared design system', async () => {
  const main = await source('../../frontend/src/main.jsx');

  requireOrderedImports(main, [
    'design-system/design-system.css',
    'echoo-ui-integrity-audit-2026.css',
    'echoo-ui-page-integrity-2026.css',
    'creator-ui-page-integrity-2026.css',
  ]);
});

test('strict shell contract keeps mobile navigation and core player controls usable', async () => {
  const [integrity, product] = await Promise.all([
    source('../../frontend/src/styles/echoo-ui-integrity-audit-2026.css'),
    source('../../frontend/src/styles/echoo-product-ui-2026.css'),
  ]);

  assert.match(product, /grid-template-columns:\s*repeat\(5,/);
  assert.match(integrity, /\.echoo-mobile-nav\s*\{[\s\S]*repeat\(5,/);
  assert.match(integrity, /echoo-app-shell--listener > \.studio-sidebar\s*\{[\s\S]*display:\s*none !important/);
  assert.match(integrity, /layout-player-controls > button:nth-child\(2\)/);
  assert.match(integrity, /layout-player-controls > button:nth-child\(4\)/);
  assert.match(integrity, /layout-player-volume[\s\S]*display:\s*flex !important/);
  assert.match(integrity, /studio-page\.studio-final-shell \.studio-nav-item[\s\S]*font-size:\s*11px !important/);
  assert.match(integrity, /llr-refresh[\s\S]*font-size:\s*12px !important/);
});

test('active Listener pages remain routed, preloaded and backed by mounted API roots', async () => {
  const [app, preloaders, backendIndex] = await Promise.all([
    source('../../frontend/src/App.jsx'),
    source('../../frontend/src/routing/routePreloaders.js'),
    source('../src/routes/index.js'),
  ]);

  for (const route of listenerRouteNames) {
    assert.match(app, new RegExp(`path=["']${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
  }

  for (const loader of [
    'loadListenerHome',
    'loadListenerSearch',
    'loadListenerLive',
    'loadListenerStations',
    'loadListenerLibrary',
    'loadListenerFollowing',
    'loadListenerPlaylist',
    'loadListenerSavedMoments',
    'loadListenerHistory',
    'loadListenerDownloads',
    'loadListenerCreatorProfile',
    'loadListenerNotifications',
    'loadListenerSettings',
    'loadListenerAudioDetail',
    'loadListenerLiveRoom',
    'loadListenerStationProfile',
    'loadListenerCollectionDetail',
  ]) {
    assert.match(preloaders, new RegExp(`export const ${loader}`));
  }

  for (const root of backendRoots) {
    assert.match(backendIndex, new RegExp(`router\\.use\\(['\"]${root.replace('/', '\\/')}['\"]`));
  }
});

test('replay UI has no dead overflow affordance and meaningful copy remains visible on phones', async () => {
  const [detail, detailCss, integrity] = await Promise.all([
    source('../../frontend/src/Components/ListenerAudioDetail/ListenerAudioDetail.jsx'),
    source('../../frontend/src/Components/ListenerAudioDetail/ListenerAudioDetail.css'),
    source('../../frontend/src/styles/echoo-ui-integrity-audit-2026.css'),
  ]);

  assert.doesNotMatch(detail, /More replay options/);
  assert.doesNotMatch(integrity, /More replay options/);
  assert.match(detailCss, /\.replay-copy > p \{ display: none; \}/);
  assert.match(integrity, /\.replay-copy > p[\s\S]*display:\s*block !important/);
});

test('active Listener CSS has one readable typography floor instead of legacy override layers', async () => {
  const files = await Promise.all([
    source('../../frontend/src/Components/ListenerV2/ListenerV2.css'),
    source('../../frontend/src/Components/ListenerPlaylist/ListenerPlaylist.css'),
    source('../../frontend/src/Components/ListenerSavedMoments/ListenerSavedMoments.css'),
    source('../../frontend/src/Components/ListenerHistory/ListenerHistory.css'),
    source('../../frontend/src/Components/ListenerDownloads/ListenerDownloads.css'),
    source('../../frontend/src/Components/ListenerCreatorProfile/ListenerCreatorProfile.css'),
    source('../../frontend/src/Components/ListenerNotifications/ListenerNotifications.css'),
    source('../../frontend/src/Components/ListenerSettings/ListenerSettings.css'),
    source('../../frontend/src/Components/ListenerAudioDetail/ListenerAudioDetail.css'),
    source('../../frontend/src/Components/ListenerLiveExperience/ListenerV2LiveRoom.css'),
    source('../../frontend/src/Components/ListenerCollectionDetail/ListenerCollectionDetail.css'),
  ]);

  for (const css of files) {
    assert.doesNotMatch(css, /font-size:\s*(?:8|9|10|11|11\.5|12|12\.5)px/);
  }
});



test('live chat uses one 280-character contract from composer through persistence', async () => {
  const [components, controller, model] = await Promise.all([
    source('../../frontend/src/Components/ListenerExperience/ListenerExperienceComponents.jsx'),
    source('../src/controllers/chatController.js'),
    source('../src/models/ChatMessage.js'),
  ]);

  assert.match(components, /maxLength=\{280\}/);
  assert.match(controller, /content\.length > 280/);
  assert.match(controller, /Message cannot exceed 280 characters/);
  assert.match(model, /maxlength:\s*\[280,\s*'Message cannot exceed 280 characters'\]/);
});


test('public guest chat history is read-only, sanitized and routed before auth', async () => {
  const [routes, controller, service, room] = await Promise.all([
    source('../src/routes/chatRoutes.js'),
    source('../src/controllers/chatController.js'),
    source('../../frontend/src/services/batch4Service.js'),
    source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx'),
  ]);

  const publicRoute = routes.indexOf("router.get('/broadcast/:broadcastId/public/messages', getPublicMessages)");
  const authGate = routes.indexOf('router.use(authenticate)');
  assert.ok(publicRoute >= 0 && authGate > publicRoute, 'public history must be mounted before the auth gate');
  assert.match(controller, /isPublic:\s*true/);
  assert.match(controller, /publicChatMessageView/);
  assert.match(controller, /reactions:[\s\S]*emoji:/);
  assert.match(service, /getPublicMessages:[\s\S]*skipAuth:\s*true[\s\S]*skipRefresh:\s*true/);
  assert.match(room, /isGuest[\s\S]*batch4Service\.getPublicMessages/);
  assert.doesNotMatch(routes.slice(0, authGate), /router\.(post|put|patch|delete)\(/);
});


test('Listener user-facing recording terminology stays consistent', async () => {
  const [savedMoments, collection] = await Promise.all([
    source('../../frontend/src/Components/ListenerSavedMoments/ListenerSavedMoments.jsx'),
    source('../../frontend/src/Components/ListenerCollectionDetail/ListenerCollectionDetail.jsx'),
  ]);

  assert.doesNotMatch(savedMoments, /replay timestamp/i);
  assert.match(savedMoments, /recording timestamp/i);
  assert.doesNotMatch(savedMoments, /'REPLAY'/);
  assert.match(savedMoments, /'RECORDING'/);
  assert.doesNotMatch(collection, /replayable set/i);
  assert.match(collection, /collection of recordings/i);
});

test('Creator Notifications owns its stylesheet and uses separate accessible open/delete controls', async () => {
  const [workspace, css] = await Promise.all([
    source('../../frontend/src/Components/CreatorStudio/CreatorNotificationsWorkspace.jsx'),
    source('../../frontend/src/Components/CreatorStudio/CreatorNotificationsWorkspace.css'),
  ]);

  assert.match(workspace, /import ['"]\.\/CreatorNotificationsWorkspace\.css['"]/);
  assert.doesNotMatch(workspace, /ListenerNotifications\.css/);
  assert.match(workspace, /className="ln-open"/);
  assert.match(workspace, /className="ln-delete"/);
  assert.match(workspace, /aria-label=\{`Open notification:/);
  assert.match(workspace, /aria-label=\{`Delete /);
  assert.match(css, /\.ln-open[\s\S]*min-height:\s*52px/);
  assert.match(css, /\.ln-delete[\s\S]*width:\s*44px/);
  assert.match(css, /\.ln-copy-message[\s\S]*font-size:\s*13px !important/);
});

test('Creator collection and live-console integrity prevents micro text and undersized operational controls', async () => {
  const creator = await source('../../frontend/src/styles/creator-ui-page-integrity-2026.css');

  assert.match(creator, /\.ecc-icon-button[\s\S]*width:\s*40px !important/);
  assert.match(creator, /\.ecc-card-copy p[\s\S]*font-size:\s*12px !important/);
  assert.match(creator, /@media \(max-width: 540px\)[\s\S]*\.ecc-card-copy p[\s\S]*display:\s*-webkit-box !important/);
  assert.match(creator, /\.ecc-track-copy strong[\s\S]*font-size:\s*13px !important/);
  assert.match(creator, /\.ebsx-live-summary-actions button[\s\S]*min-height:\s*44px !important/);
  assert.match(creator, /\.ebsx-live-quick-actions button small[\s\S]*font-size:\s*12px !important/);
});

test('Creator Studio active workspaces and service calls remain backed by mounted backend routes', async () => {
  const [studio, studioService, studioRoutes, notificationService, notificationRoutes, backendIndex] = await Promise.all([
    source('../../frontend/src/Components/CreatorStudio/CreatorStudio.jsx'),
    source('../../frontend/src/services/studioService.js'),
    source('../src/routes/studioRoutes.js'),
    source('../../frontend/src/services/notificationService.js'),
    source('../src/routes/notificationRoutes.js'),
    source('../src/routes/index.js'),
  ]);

  for (const workspace of ['Home', 'Stations', 'Broadcast', 'Audio', 'Collections', 'Audience', 'Analytics', 'Settings', 'Notifications']) {
    assert.match(studio, new RegExp(`(?:case ['\"]${workspace}['\"]|name: ['\"]${workspace}['\"])`));
  }

  for (const endpoint of ['/studio/dashboard', '/studio/content', '/studio/audience', '/studio/analytics']) {
    assert.match(studioService, new RegExp(endpoint.replace('/', '\\/')));
  }

  for (const endpoint of ['/dashboard', '/content', '/audience', '/analytics']) {
    assert.match(studioRoutes, new RegExp(`router\\.get\\(['\"]${endpoint.replace('/', '\\/')}['\"]`));
  }

  assert.match(notificationService, /apiRequest\(`?\/notifications\?/);
  assert.match(notificationService, /\/notifications\/\$\{encodeURIComponent\(notificationId\)\}\/read/);
  assert.match(notificationService, /\/notifications\/read-all/);
  assert.match(notificationService, /method:\s*'DELETE'/);
  assert.match(notificationRoutes, /router\.get\([\s\S]*['"]\/['"]/);
  assert.match(notificationRoutes, /router\.patch\([\s\S]*['"]\/read-all['"]/);
  assert.match(notificationRoutes, /router\.patch\([\s\S]*['"]\/:notificationId\/read['"]/);
  assert.match(notificationRoutes, /router\.delete\([\s\S]*['"]\/:notificationId['"]/);
  assert.match(backendIndex, /router\.use\(['"]\/studio['"]/);
  assert.match(backendIndex, /router\.use\(['"]\/notifications['"]/);
});

test('Creator Studio has one account menu in the top bar, not a duplicate sidebar profile control', async () => {
  const studio = await source('../../frontend/src/Components/CreatorStudio/CreatorStudio.jsx');

  assert.match(studio, /studio-top-profile-wrap/);
  assert.doesNotMatch(studio, /studio-sidebar-profile-wrap/);
  assert.doesNotMatch(studio, /profileMenuOpen === 'sidebar'/);
});

test('transcript-ready Creator notifications map the backend processing link into Broadcast Studio', async () => {
  const [processing, notifications] = await Promise.all([
    source('../src/services/broadcastProcessingService.js'),
    source('../../frontend/src/Components/CreatorStudio/CreatorNotificationsWorkspace.jsx'),
  ]);

  assert.match(processing, /type:\s*'transcript_ready'/);
  assert.match(processing, /link:\s*`\/creator\/broadcasts\/\$\{broadcast\._id\}\/processing`/);
  assert.match(notifications, /broadcastIdFromNotification/);
  assert.match(notifications, /\/creator\\\/broadcasts\\\/\(\[\^\/\]\+\)/);
  assert.match(notifications, /echooProcessingBroadcastId/);
  assert.match(notifications, /onNavigate\?\.\('Broadcast'\)/);
});

test('Creator transcript monitor reports live processing, progress, and actionable worker failures', async () => {
  const [processing, processingCss, liveWorkspace] = await Promise.all([
    source('../../frontend/src/Components/CreatorStudio/CreatorBroadcastProcessing.jsx'),
    source('../../frontend/src/Components/CreatorStudio/CreatorBroadcastProcessing.css'),
    source('../../frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx'),
  ]);

  assert.match(processing, /realtimeService\.joinBroadcast\(broadcastId\)/);
  assert.match(processing, /broadcast:processing/);
  assert.match(processing, /LIVE PROCESSING MONITOR/);
  assert.match(processing, /Transcript progress/);
  assert.match(processing, /Processing stopped/);
  assert.match(processingCss, /ecbs-transcript-monitor__progress/);
  assert.match(processingCss, /ecbs-transcript-monitor__steps/);
  assert.match(liveWorkspace, /\['processing', 'ready_for_review', 'editing', 'failed'\]/);
});


test('active ListenerV2 separates live, scheduled and released audio and owns a persistent seekable player', async () => {
  const [listener, css] = await Promise.all([
    source('../../frontend/src/Components/ListenerV2/ListenerV2.jsx'),
    source('../../frontend/src/Components/ListenerV2/ListenerV2.css'),
  ]);

  assert.match(listener, /title="Live now"/);
  assert.match(listener, /title="Upcoming broadcasts"/);
  assert.match(listener, /title="Latest recordings"/);
  assert.match(listener, /status: 'scheduled'/);
  assert.match(listener, /new Date\(releaseDateOf\(b\) \|\| 0\) - new Date\(releaseDateOf\(a\) \|\| 0\)/);
  assert.match(listener, /listener-v2-full-player/);
  assert.match(listener, /aria-label="Back 15 seconds"/);
  assert.match(listener, /aria-label="Forward 15 seconds"/);
  assert.match(listener, /aria-label="Playback position"/);
  assert.match(listener, /navigator\.mediaSession\.setActionHandler\('seekbackward'/);
  assert.match(listener, /navigator\.mediaSession\.setActionHandler\('seekforward'/);
  assert.match(listener, /Minimize this player and Echoo keeps the audio playing while you browse Listener/);
  assert.match(css, /\.listener-v2-upcoming-grid/);
  assert.match(css, /\.listener-v2-release-list/);
  assert.match(css, /\.listener-v2-full-player-sheet/);
  assert.match(css, /\.listener-v2-player-seek/);
  assert.match(listener, /setUpcoming\([\s\S]*sort\(\(a, b\) => new Date\(a\?\.startTime \|\| 0\) - new Date\(b\?\.startTime \|\| 0\)\)/);
});


test('Listener live room labels recovering audio as recovery, not creator wait', async () => {
  const room = await source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');

  assert.match(room, /audioState === 'recovering_audio'[\s\S]{0,80}\? 'Recovering audio…'/);
  assert.match(room, /audioState === 'waiting_for_program'[\s\S]{0,80}\? 'Waiting for creator'/);
});

test('scheduled rooms describe a future start instead of an ended broadcast', async () => {
  const [room, css] = await Promise.all([
    source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx'),
    source('../../frontend/src/Components/ListenerLiveExperience/ListenerV2LiveRoom.css'),
  ]);

  assert.match(room, /const isScheduled = show\?\.status === 'scheduled'/);
  assert.match(room, /const scheduledStartLabel/);
  assert.match(room, /const audioStatusLabel = isScheduled[\s\S]{0,80}\? scheduledStartLabel[\s\S]{0,80}: !isLive[\s\S]{0,80}\? 'Broadcast ended'/);
  assert.match(room, /isScheduled \? ' is-scheduled' : ' is-ended'/);
  assert.match(css, /\.listener-v2-room-live-badge\.is-scheduled/);
});


test('guest live chat uses one compact header and never exposes an unusable composer', async () => {
  const [room, roomCss, components] = await Promise.all([
    source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx'),
    source('../../frontend/src/Components/ListenerLiveExperience/ListenerV2LiveRoom.css'),
    source('../../frontend/src/Components/ListenerExperience/ListenerExperienceComponents.jsx'),
  ]);

  assert.doesNotMatch(room, /Listening as a guest\./);
  assert.doesNotMatch(room, /Sign in to chat and follow/);
  assert.match(room, /className="listener-v2-room-chat-title"/);
  assert.match(room, />Live chat</);
  assert.match(room, />Guest</);
  assert.match(room, />\s*Sign in\s*</);
  assert.match(room, /showHeader=\{false\}/);
  assert.match(room, /showComposer=\{!isGuest\}/);
  assert.match(room, /isGuest \? 'No messages yet\.'/);
  assert.match(components, /showHeader = true/);
  assert.match(components, /showComposer = true/);
  assert.match(components, /\{showComposer && \(/);
  assert.match(roomCss, /\.listener-v2-room-chat-top/);
  assert.match(roomCss, /\.listener-v2-room-chat\.is-guest[\s\S]*height:\s*min\(54dvh, 460px\)/);
});


test('Creator shell responsive contract is component-owned and cropper CSS cannot mutate app chrome', async () => {
  const [studio, main, crop] = await Promise.all([
    source('../../frontend/src/Components/CreatorStudio/CreatorStudio.jsx'),
    source('../../frontend/src/main.jsx'),
    source('../../frontend/src/Components/Common/ImageCropProvider.css'),
  ]);

  const architectureImport = studio.indexOf("import './CreatorStudioShellArchitecture.css';");
  const contractImport = studio.indexOf("import '../../styles/creator-shell-viewport-contract.css';");
  assert.ok(architectureImport >= 0 && contractImport > architectureImport, 'Creator responsive contract must load after Creator shell layers');
  assert.doesNotMatch(main, /creator-shell-viewport-contract\.css/);
  assert.doesNotMatch(crop, /CreatorStudioViewportLock\.css/);
  assert.doesNotMatch(crop, /\.studio-(?:page|sidebar|main|topbar)/);
});


test('shared Creator and Listener account menus stay anchored to the avatar contract', async () => {
  const menu = await source('../../frontend/src/Components/Shared/AccountExperienceMenu.jsx');
  const menuCss = await source('../../frontend/src/Components/Shared/AccountExperienceMenu.css');
  const listenerCss = await source('../../frontend/src/Components/ListenerV2/ListenerV2.css');
  const main = await source('../../frontend/src/main.jsx');

  assert.match(menu, /currentExperience === 'creator' \|\| hasCompletedCreatorProfile\(user\)/);
  assert.match(menuCss, /account-experience-menu--creator \.account-experience-dropdown,[\s\S]*account-experience-menu--listener \.account-experience-dropdown[\s\S]*right:\s*0;[\s\S]*left:\s*auto;/);
  assert.doesNotMatch(menuCss, /account-experience-menu--creator \.account-experience-dropdown \{[^}]*left:\s*0;/);
  assert.match(listenerCss, /listener-v2-header \.account-experience-menu \{ position: relative;/);
  assert.doesNotMatch(main, /listener-logout-visibility-fix\.css/);
  assert.doesNotMatch(main, /echoo-logout-always-visible\.css/);
});
