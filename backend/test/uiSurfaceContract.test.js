import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

const listenerRouteNames = [
  'search',
  'live',
  'stations',
  'audio/:audioId',
  'library',
  'library/following',
  'playlist',
  'saved-moments',
  'history',
  'downloads',
  'creator/:creatorId',
  'notifications',
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

test('Listener uses the shared Creator/Listener shell and matching Home class contract', async () => {
  const [layout, home, homeCss, integrationCss] = await Promise.all([
    source('../../frontend/src/Components/ListenerLayout/ListenerLayout.jsx'),
    source('../../frontend/src/Components/ListenerHome/ListenerHome.jsx'),
    source('../../frontend/src/Components/ListenerHome/ListenerHome.css'),
    source('../../frontend/src/styles/listener-creator-ui.css'),
  ]);

  assert.match(layout, /import EchooAppShell from ['"]\.\.\/Shared\/EchooAppShell['"]/);
  assert.match(layout, /<EchooAppShell[\s\S]*role="listener"/);
  assert.match(layout, /listener-creator-ui\.css/);
  assert.doesNotMatch(layout, /<aside className="layout-sidebar"/);

  assert.match(home, /className="echoo-home"/);
  assert.match(home, /echoo-home-greeting/);
  assert.match(homeCss, /\.echoo-home\s*\{/);
  assert.match(homeCss, /\.echoo-home-greeting/);
  assert.match(integrationCss, /\.echoo-app-shell--listener \.echoo-home/);
  assert.doesNotMatch(home, /FiMoreHorizontal|listener-home-history-more/);
});

test('shared sidebar follows nested router state instead of exact-string-only highlighting', async () => {
  const sidebar = await source('../../frontend/src/Components/Shared/Sidebar.jsx');
  assert.match(sidebar, /className=\{\(\{ isActive \}\) =>/);
  assert.match(sidebar, /isActive \|\| explicitActive/);
});

test('Listener mobile navigation has exactly four primary destinations plus More and no duplicate station tab', async () => {
  const navigation = await source('../../frontend/src/Components/EchooSystem/EchooMobileNavigation.jsx');
  const primary = navigation.match(/const primaryItems = \[([\s\S]*?)\n\];/)?.[1] || '';
  const itemCount = (primary.match(/\{ label:/g) || []).length;

  assert.equal(itemCount, 4, 'four primary items + More must fit the five-column mobile bar');
  assert.match(primary, /label: 'Home'/);
  assert.match(primary, /label: 'Live now'/);
  assert.match(primary, /label: 'Stations'/);
  assert.match(primary, /label: 'Library'/);
  assert.doesNotMatch(primary, /label: 'Discover'/);
  assert.equal((primary.match(/path: '\/listen\/stations'/g) || []).length, 1);
  assert.match(navigation, />More<\/span>/);
});

test('all final UI integrity layers load in deterministic order after the shared design system', async () => {
  const main = await source('../../frontend/src/main.jsx');

  requireOrderedImports(main, [
    'design-system/design-system.css',
    'echoo-ui-integrity-audit-2026.css',
    'echoo-ui-page-integrity-2026.css',
    'listener-ui-deep-integrity-2026.css',
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
  ]) {
    assert.match(preloaders, new RegExp(`export const ${loader}`));
  }

  for (const root of backendRoots) {
    assert.match(backendIndex, new RegExp(`router\\.use\\(['\"]${root.replace('/', '\\/')}['\"]`));
  }
});

test('dead replay overflow affordance is hidden and meaningful replay copy remains visible on phones', async () => {
  const [detail, detailCss, integrity] = await Promise.all([
    source('../../frontend/src/Components/ListenerAudioDetail/ListenerAudioDetail.jsx'),
    source('../../frontend/src/Components/ListenerAudioDetail/ListenerAudioDetail.css'),
    source('../../frontend/src/styles/echoo-ui-integrity-audit-2026.css'),
  ]);

  assert.match(detail, /aria-label="More replay options"/);
  assert.doesNotMatch(detail, /aria-label="More replay options"[^>]*onClick=/);
  assert.match(integrity, /\[aria-label="More replay options"\][\s\S]*display:\s*none !important/);
  assert.match(detailCss, /\.replay-copy > p \{ display: none; \}/);
  assert.match(integrity, /\.replay-copy > p[\s\S]*display:\s*block !important/);
});

test('Listener deep integrity keeps playlist, replay, settings and live-room content readable and touchable', async () => {
  const deep = await source('../../frontend/src/styles/listener-ui-deep-integrity-2026.css');

  assert.match(deep, /\.pl-playlist-art-play[\s\S]*width:\s*40px !important/);
  assert.match(deep, /\.pl-more-btn[\s\S]*min-height:\s*40px !important/);
  assert.match(deep, /\.replay-timeline > div:last-child[\s\S]*font-size:\s*11\.5px !important/);
  assert.match(deep, /\.set-toggle-desc[\s\S]*font-size:\s*12\.5px !important/);
  assert.match(deep, /\.set-toast-close[\s\S]*width:\s*40px !important/);
  assert.match(deep, /\.llr-status[\s\S]*font-size:\s*11px !important/);
  assert.match(deep, /@media \(hover: none\), \(pointer: coarse\)/);
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
