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
  '/transcripts',
];

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

test('strict UI contract is loaded last and keeps mobile navigation/player controls usable', async () => {
  const [main, integrity, product] = await Promise.all([
    source('../../frontend/src/main.jsx'),
    source('../../frontend/src/styles/echoo-ui-integrity-audit-2026.css'),
    source('../../frontend/src/styles/echoo-product-ui-2026.css'),
  ]);

  const designSystemIndex = main.lastIndexOf('design-system/design-system.css');
  const integrityIndex = main.lastIndexOf('echoo-ui-integrity-audit-2026.css');
  assert.ok(integrityIndex > designSystemIndex, 'integrity contract must be the final stylesheet import');

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

test('dead replay overflow affordance is not exposed and meaningful copy remains visible on phones', async () => {
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
