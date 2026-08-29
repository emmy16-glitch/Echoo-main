import { test } from 'playwright/test';

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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="900" height="900" rx="50" fill="url(#g)"/><circle cx="680" cy="180" r="190" fill="rgba(255,255,255,.08)"/><circle cx="185" cy="710" r="250" fill="rgba(255,255,255,.055)"/><text x="70" y="690" fill="white" font-family="Arial,sans-serif" font-size="82" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

const live = [
  { id: 'live-1', _id: 'live-1', title: 'Sunday Morning Broadcast', status: 'live', category: 'Faith', listenerCount: 284, description: 'A live teaching and community conversation.', coverArt: art('LAYERS OF TRUTH', '#0c2346', '#245faf'), stationId: 'station-1', stationName: 'Layers of Truth', station: { id: 'station-1', _id: 'station-1', name: 'Layers of Truth', category: 'Faith', brandCover: art('LAYERS OF TRUTH', '#0c2346', '#245faf'), owner: { displayName: 'Emmanuel', username: 'emmanuel' } }, creatorName: 'Emmanuel', creator: { displayName: 'Emmanuel', username: 'emmanuel' } },
  { id: 'live-2', _id: 'live-2', title: 'Morning Worship', status: 'live', category: 'Faith', listenerCount: 193, description: 'Live worship and prayer.', coverArt: art('RCCG', '#3b111a', '#8a2432'), stationId: 'station-2', stationName: 'RCCG Radio', station: { id: 'station-2', _id: 'station-2', name: 'RCCG Radio', category: 'Faith', brandCover: art('RCCG', '#3b111a', '#8a2432') } },
  { id: 'live-3', _id: 'live-3', title: 'Covenant Hour', status: 'live', category: 'Faith', listenerCount: 156, description: 'Live teaching.', coverArt: art('LIVING FAITH', '#3b2708', '#936e19'), stationId: 'station-3', stationName: 'Living Faith', station: { id: 'station-3', _id: 'station-3', name: 'Living Faith', category: 'Faith', brandCover: art('LIVING FAITH', '#3b2708', '#936e19') } },
  { id: 'live-4', _id: 'live-4', title: 'Prayer Session', status: 'live', category: 'Faith', listenerCount: 121, description: 'Live prayer room.', coverArt: art('MFM', '#15123e', '#40359a'), stationId: 'station-4', stationName: 'MFM', station: { id: 'station-4', _id: 'station-4', name: 'MFM', category: 'Faith', brandCover: art('MFM', '#15123e', '#40359a') } },
  { id: 'live-5', _id: 'live-5', title: 'The Tech Circle', status: 'live', category: 'Technology', listenerCount: 88, description: 'Technology conversations live.', coverArt: art('TECH CIRCLE', '#062c2b', '#16817c'), stationId: 'station-5', stationName: 'The Tech Circle', station: { id: 'station-5', _id: 'station-5', name: 'The Tech Circle', category: 'Technology', brandCover: art('TECH CIRCLE', '#062c2b', '#16817c') } },
];

const messages = [
  { id: 'm1', _id: 'm1', broadcastId: 'live-1', displayName: 'Ada', username: 'ada', content: 'Good morning everyone 👋', createdAt: new Date(Date.now() - 160000).toISOString(), reactions: [] },
  { id: 'm2', _id: 'm2', broadcastId: 'live-1', displayName: 'David', username: 'david', content: 'This point is powerful.', createdAt: new Date(Date.now() - 90000).toISOString(), reactions: [{ emoji: '❤️', userId: 'x' }] },
  { id: 'm3', _id: 'm3', broadcastId: 'live-1', displayName: 'Chidinma', username: 'chidinma', content: 'Listening from Kaduna.', createdAt: new Date(Date.now() - 35000).toISOString(), reactions: [] },
];

const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const mockApi = async (page) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/api/listener/dashboard')) return json(route, { data: { liveNow: live, discoverStations: [], continueListening: [] } });
    if (path.endsWith('/api/player/state')) return json(route, { data: { volume: 0.85, isMuted: false, hapticsEnabled: true, isShuffled: false, repeatMode: 'none' } });
    if (path.includes('/api/chat/broadcast/live-1/messages')) return json(route, { data: messages });
    if (path.endsWith('/api/broadcasts/live-1')) return json(route, { data: live[0] });
    if (path.includes('/api/broadcasts/live-1/presence')) return json(route, { status: 'live', listenerCount: 284, mediaState: 'audio_live' });
    if (path.endsWith('/api/stations/station-1')) return json(route, { data: live[0].station });
    if (path.includes('/api/follow') || path.includes('/api/follows')) return json(route, { data: { isFollowing: false } });
    if (path.includes('/api/notification')) return json(route, { data: { items: [], unreadCount: 0 } });
    if (path.includes('/api/settings')) return json(route, { data: {} });
    if (path.includes('/api/health/livekit')) return json(route, { reachable: true });
    return json(route, { data: [] });
  });
};

const authenticate = async (page) => {
  // Establish the Vite origin first. Some browsers reject/ignore storage writes
  // from an init script before a stable application origin exists.
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
  const stored = await page.evaluate(() => ({
    accessToken: localStorage.getItem('accessToken'),
    role: localStorage.getItem('echooRole'),
    onboarding: localStorage.getItem('echooOnboardingCompleted'),
    user: localStorage.getItem('user'),
  }));
  console.log('AUTH_STORAGE=' + JSON.stringify(stored));
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
    sidebar: box('.echoo-app-sidebar--listener'),
    main: box('.echoo-app-main'),
    header: box('.echoo-app-header'),
    watermark: box('.echoo-listener-sidebar-watermark'),
    home: box('.echoo-listener-target-home'),
    liveGrid: box('.echoo-listener-target-live-grid'),
    firstCard: box('.echoo-listener-target-live-card'),
    roomPage: box('.listener-room-page'),
    roomHeader: box('.lex-room-header'),
    roomMain: box('.llr-main'),
    player: box('.llr-player-card'),
    playerVisual: box('.llr-player-visual'),
    chat: box('.listener-room-columns--chat-only > *'),
  };
});

const reportPage = async (page, label) => {
  console.log(`${label}_URL=${page.url()}`);
  console.log(`${label}_TITLE=${await page.title()}`);
  console.log(`${label}_TEXT=${(await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 2200)}`);
  console.log(`${label}_GEOMETRY=${JSON.stringify(await geometry(page))}`);
};

test.use({ viewport: { width: 1536, height: 1024 }, baseURL: BASE, colorScheme: 'dark' });

test('capture the selected Listener 2.0 home and live room', async ({ page }, testInfo) => {
  await mockApi(page);
  page.on('pageerror', (error) => console.log('PAGE_ERROR=' + error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) console.log(`BROWSER_${message.type().toUpperCase()}=${message.text()}`);
  });

  await authenticate(page);

  await page.goto('/listen', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1800);
  await reportPage(page, 'HOME');
  await page.screenshot({ path: `${testInfo.outputDir}/listener-home-selected.jpg`, type: 'jpeg', quality: 72, fullPage: false });

  await page.goto('/listen/live/live-1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1800);
  await page.addStyleTag({ content: '.echoo-livekit-listener{display:none!important}' }).catch(() => {});
  await reportPage(page, 'ROOM');
  await page.screenshot({ path: `${testInfo.outputDir}/listener-room-selected.jpg`, type: 'jpeg', quality: 72, fullPage: false });
});
