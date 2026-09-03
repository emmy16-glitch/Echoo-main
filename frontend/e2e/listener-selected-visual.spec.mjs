import { expect, test } from 'playwright/test';

const BASE = process.env.ECHOO_QA_BASE_URL || 'http://127.0.0.1:5173';

const listener = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'emmanuel',
  displayName: 'Emmanuel',
  email: 'listener@example.test',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const art = (label, a, b) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900"><rect width="900" height="900" rx="50" fill="${a}"/><circle cx="680" cy="180" r="190" fill="${b}" opacity=".55"/><circle cx="185" cy="710" r="250" fill="white" opacity=".055"/><text x="70" y="690" fill="white" font-family="Arial,sans-serif" font-size="82" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

const creators = [
  { id: 'creator-1', _id: 'creator-1', username: 'emmanuel', displayName: 'Emmanuel Okunlola', followerCount: 428, verified: true },
  { id: 'creator-2', _id: 'creator-2', username: 'adanna', displayName: 'Adanna', followerCount: 316, verified: true },
  { id: 'creator-3', _id: 'creator-3', username: 'samuel', displayName: 'Samuel', followerCount: 209, verified: false },
];

const stations = [
  { id: 'station-1', _id: 'station-1', name: 'Layers of Truth', description: 'Faith, teaching and community.', category: 'Faith', isLive: true, listenerCount: 284, followerCount: 518, isPublic: true, brandCover: art('LAYERS OF TRUTH', '#0c2346', '#245faf'), owner: creators[0] },
  { id: 'station-2', _id: 'station-2', name: 'RCCG Radio', description: 'Worship and teaching.', category: 'Faith', isLive: true, listenerCount: 193, followerCount: 441, isPublic: true, brandCover: art('RCCG', '#3b111a', '#8a2432'), owner: creators[1] },
  { id: 'station-3', _id: 'station-3', name: 'Living Faith', description: 'Live faith conversations.', category: 'Faith', isLive: true, listenerCount: 156, followerCount: 388, isPublic: true, brandCover: art('LIVING FAITH', '#3b2708', '#936e19'), owner: creators[2] },
  { id: 'station-4', _id: 'station-4', name: 'MFM', description: 'Prayer and worship.', category: 'Faith', isLive: true, listenerCount: 121, followerCount: 302, isPublic: true, brandCover: art('MFM', '#15123e', '#40359a'), owner: creators[1] },
  { id: 'station-5', _id: 'station-5', name: 'The Tech Circle', description: 'Builders and technology.', category: 'Technology', isLive: true, listenerCount: 88, followerCount: 255, isPublic: true, brandCover: art('TECH CIRCLE', '#062c2b', '#16817c'), owner: creators[0] },
  { id: 'station-6', _id: 'station-6', name: 'Northern Business', description: 'Business stories from Africa.', category: 'Business', isLive: false, listenerCount: 0, followerCount: 184, isPublic: true, brandCover: art('BUSINESS', '#3d1f08', '#b36a1b'), owner: creators[2] },
  { id: 'station-7', _id: 'station-7', name: 'Campus Talk', description: 'Ideas, education and youth.', category: 'Education', isLive: false, listenerCount: 0, followerCount: 162, isPublic: true, brandCover: art('CAMPUS TALK', '#08283d', '#237ea6'), owner: creators[1] },
  { id: 'station-8', _id: 'station-8', name: 'Weekend Sports', description: 'Sports conversation and analysis.', category: 'Sports', isLive: false, listenerCount: 0, followerCount: 144, isPublic: true, brandCover: art('SPORTS', '#102f1e', '#278453'), owner: creators[2] },
];

const live = stations.slice(0, 5).map((station, index) => ({
  id: `live-${index + 1}`,
  _id: `live-${index + 1}`,
  title: ['Sunday Morning Broadcast', 'Morning Worship', 'Covenant Hour', 'Prayer Session', 'The Tech Circle'][index],
  status: 'live',
  category: station.category,
  listenerCount: station.listenerCount,
  description: ['A live teaching and community conversation.', 'Live worship and prayer.', 'Live teaching.', 'Live prayer room.', 'Technology conversations live.'][index],
  coverArt: station.brandCover,
  stationId: station.id,
  stationName: station.name,
  station,
  creatorName: station.owner?.displayName,
  creator: station.owner,
}));

const tracks = [
  { id: 'track-1', _id: 'track-1', title: 'Faith and Work', artistName: 'Emmanuel Okunlola', duration: 1440, coverArt: art('FAITH + WORK', '#0f2850', '#2f6fcc'), fileUrl: 'https://example.test/audio-1.mp3' },
  { id: 'track-2', _id: 'track-2', title: 'Building in Africa', artistName: 'Samuel', duration: 1860, coverArt: art('BUILDING', '#2b1609', '#8e551d'), fileUrl: 'https://example.test/audio-2.mp3' },
  { id: 'track-3', _id: 'track-3', title: 'Morning Reflection', artistName: 'Adanna', duration: 1320, coverArt: art('REFLECTION', '#241140', '#60319a'), fileUrl: 'https://example.test/audio-3.mp3' },
];

const messages = [
  { id: 'm1', _id: 'm1', broadcastId: 'live-1', displayName: 'Ada', username: 'ada', content: 'Good morning everyone 👋', createdAt: new Date(Date.now() - 160000).toISOString(), reactions: [] },
  { id: 'm2', _id: 'm2', broadcastId: 'live-1', displayName: 'David', username: 'david', content: 'This point is powerful.', createdAt: new Date(Date.now() - 90000).toISOString(), reactions: [{ emoji: '❤️', userId: 'x' }] },
  { id: 'm3', _id: 'm3', broadcastId: 'live-1', displayName: 'Chidinma', username: 'chidinma', content: 'Listening from Kaduna.', createdAt: new Date(Date.now() - 35000).toISOString(), reactions: [] },
  { id: 'm4', _id: 'm4', broadcastId: 'live-1', displayName: 'Blessing', username: 'blessing', content: 'This is speaking to me.', createdAt: new Date(Date.now() - 12000).toISOString(), reactions: [] },
];

const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const mockApi = async (page) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/api/listener/dashboard')) return json(route, { data: { liveNow: live, discoverStations: stations, continueListening: [] } });
    if (path.endsWith('/api/player/state')) return json(route, { data: { volume: 0.85, isMuted: false, hapticsEnabled: true, isShuffled: false, repeatMode: 'none' } });
    if (path.includes('/api/chat/broadcast/live-1/messages')) return json(route, { data: messages });
    if (path.endsWith('/api/broadcasts/live-1')) return json(route, { data: live[0] });
    if (path.includes('/api/broadcasts/live-1/presence')) return json(route, { status: 'live', listenerCount: 284, mediaState: 'audio_live' });

    if (path.endsWith('/api/follows/me/stations')) return json(route, { data: { stations: stations.slice(0, 4) } });
    if (path.endsWith('/api/follows/me/creators')) return json(route, { data: { following: creators } });
    if (path.includes('/api/follows/stations/') && path.endsWith('/status')) return json(route, { data: { isFollowing: true, followerCount: 518 } });
    if (path.includes('/api/follows/users/') && path.endsWith('/status')) return json(route, { data: { isFollowing: true, isFollowedBy: false } });
    if (path.includes('/api/follows/')) return json(route, { data: { ok: true } });

    if (path.endsWith('/api/history')) return json(route, { data: { history: tracks.map((track, index) => ({ id: `history-${index + 1}`, track, playedAt: new Date(Date.now() - (index + 1) * 600000).toISOString(), progress: 20 + index * 10 })) } });
    if (path.endsWith('/api/search')) return json(route, { data: { results: { tracks, creators, stations, playlists: [{ id: 'playlist-1', name: 'Weekend Listening', description: 'Saved for later' }] } } });

    if (path.endsWith('/api/stations')) return json(route, { data: stations });
    const stationMatch = path.match(/\/api\/stations\/(station-\d+)$/);
    if (stationMatch) return json(route, { data: stations.find((station) => station.id === stationMatch[1]) || stations[0] });

    if (path.includes('/api/notification')) return json(route, { data: { items: [], unreadCount: 0 } });
    if (path.includes('/api/settings')) return json(route, { data: {} });
    if (path.includes('/api/health/livekit')) return json(route, { reachable: true });
    return json(route, { data: [] });
  });
};

const authenticate = async (page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((user) => {
    localStorage.setItem('accessToken', 'listener-visual-token');
    localStorage.setItem('token', 'listener-visual-token');
    localStorage.setItem('refreshToken', 'listener-visual-refresh');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooRole', 'listener');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
  }, listener);
};

const geometry = async (page) => page.evaluate(() => {
  const box = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    const s = getComputedStyle(node);
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), display: s.display, position: s.position, background: s.backgroundColor, color: s.color, overflowY: s.overflowY };
  };
  return {
    viewport: { width: innerWidth, height: innerHeight },
    bodyOverflow: document.documentElement.scrollWidth - innerWidth,
    sidebar: box('.listener-v2-sidebar'),
    brand: box('.listener-v2-brand'),
    main: box('.listener-v2-main'),
    page: box('.listener-v2-page'),
    liveGrid: box('.listener-v2-live-grid'),
    firstLiveCard: box('.listener-v2-live-card'),
    followingGrid: box('.listener-v2-creator-grid'),
    stationGrid: box('.listener-v2-station-grid'),
    search: box('.listener-v2-search-page'),
    room: box('.listener-v2-live-room'),
    roomToolbar: box('.listener-v2-room-toolbar'),
    roomStage: box('.listener-v2-room-stage'),
    roomChat: box('.listener-v2-room-chat'),
  };
});

const validateStrictShell = async (page, activeLabel) => {
  await expect(page.locator('.listener-v2-root')).toBeVisible();
  await expect(page.locator('.listener-v2-sidebar')).toBeVisible();
  await expect(page.locator('.listener-v2-brand')).toBeVisible();
  await expect(page.locator('.listener-v2-nav > button.is-active')).toHaveCount(1);
  await expect(page.locator('.listener-v2-nav > button.is-active')).toContainText(activeLabel);
  await expect(page.locator('.echoo-app-header')).toHaveCount(0);
  await expect(page.locator('.echoo-copilot')).toHaveCount(0);
  const canvas = await page.locator('.listener-v2-main').evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(canvas).not.toBe('rgb(255, 255, 255)');
};

const capture = async (page, testInfo, route, label, activeLabel, afterLoad) => {
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  if (afterLoad) await afterLoad();
  await page.waitForTimeout(700);
  await validateStrictShell(page, activeLabel);
  console.log(`${label}_URL=${page.url()}`);
  console.log(`${label}_GEOMETRY=${JSON.stringify(await geometry(page))}`);
  await page.screenshot({ path: `${testInfo.outputDir}/${label.toLowerCase()}-listener-v2.jpg`, type: 'jpeg', quality: 78, fullPage: false });
};

test.use({ viewport: { width: 1536, height: 1024 }, baseURL: BASE, colorScheme: 'dark' });

test('capture strict Listener 2.0 core surfaces', async ({ page }, testInfo) => {
  await mockApi(page);
  page.on('pageerror', (error) => console.log('PAGE_ERROR=' + error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) console.log(`BROWSER_${message.type().toUpperCase()}=${message.text()}`);
  });
  await authenticate(page);

  await capture(page, testInfo, '/listen', 'HOME', 'Live now');
  await expect(page.locator('.listener-v2-live-card')).toHaveCount(5);

  await capture(page, testInfo, '/listen/library/following', 'FOLLOWING', 'Following');
  await expect(page.locator('.listener-v2-creator-card')).toHaveCount(3);
  await expect(page.locator('.listener-v2-station-card')).toHaveCount(4);

  await capture(page, testInfo, '/listen/stations', 'CATEGORIES', 'Categories');
  await expect(page.locator('.listener-v2-station-card')).toHaveCount(8);

  await capture(page, testInfo, '/listen/search', 'SEARCH', 'Search', async () => {
    await page.locator('.listener-v2-search-field input').fill('Layers');
    await page.waitForTimeout(700);
  });
  await expect(page.locator('.listener-v2-search-page .listener-v2-station-card').first()).toBeVisible();

  await page.goto('/listen/live/live-1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1400);
  await validateStrictShell(page, 'Live now');
  await expect(page.locator('.listener-v2-room-stage')).toBeVisible();
  await expect(page.locator('.listener-v2-room-chat')).toBeVisible();
  const stageBox = await page.locator('.listener-v2-room-stage').boundingBox();
  const chatBox = await page.locator('.listener-v2-room-chat').boundingBox();
  expect(stageBox?.y).toBeLessThanOrEqual((chatBox?.y || 0) + 2);
  expect(chatBox?.x).toBeGreaterThan((stageBox?.x || 0) + (stageBox?.width || 0) - 2);
  console.log(`ROOM_GEOMETRY=${JSON.stringify(await geometry(page))}`);
  await page.screenshot({ path: `${testInfo.outputDir}/room-listener-v2.jpg`, type: 'jpeg', quality: 78, fullPage: false });
});
