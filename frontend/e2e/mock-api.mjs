import http from 'node:http';

const PORT = Number(process.env.ECHOO_E2E_API_PORT || 5001);
const LONG = 'A deliberately long Echoo title used to stress wrapping across compact mobile, tablet and desktop layouts without clipping important actions.';
const COVER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="#eef2ff"/><circle cx="300" cy="260" r="140" fill="#c7d2fe"/><text x="300" y="480" text-anchor="middle" font-size="40" fill="#312e81">Echoo E2E</text></svg>`);

const creator = {
  id: '507f1f77bcf86cd799439011',
  _id: '507f1f77bcf86cd799439011',
  username: 'echoocreator',
  displayName: 'Echoo Creator With A Long Display Name',
  email: 'creator@example.test',
  avatar: COVER,
  userType: 'creator',
  roles: ['creator'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: { creatorType: 'individual', artistName: 'Echoo Creator' },
};

const listener = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'echo/listener',
  displayName: 'Echoo Listener With A Long Display Name',
  email: 'listener@example.test',
  avatar: COVER,
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const station = {
  id: '507f1f77bcf86cd799439021',
  _id: '507f1f77bcf86cd799439021',
  slug: 'echoo-e2e-station',
  name: LONG,
  description: `${LONG} ${LONG}`,
  category: 'Technology',
  coverArt: COVER,
  logo: COVER,
  isPublic: true,
  isLive: true,
  listenerCount: 1284,
  followerCount: 5501,
  owner: creator,
  updatedAt: new Date().toISOString(),
};

const broadcastLive = {
  id: '507f1f77bcf86cd799439031',
  _id: '507f1f77bcf86cd799439031',
  title: LONG,
  description: `${LONG} ${LONG}`,
  status: 'live',
  isPublic: true,
  visibility: 'public',
  listenerCount: 1284,
  peakListeners: 1900,
  station,
  creator,
  startTime: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
  coverArt: COVER,
};

const broadcastScheduled = {
  ...broadcastLive,
  id: '507f1f77bcf86cd799439032',
  _id: '507f1f77bcf86cd799439032',
  status: 'scheduled',
  listenerCount: 0,
  startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

const replayAudio = {
  id: '507f1f77bcf86cd799439041',
  _id: '507f1f77bcf86cd799439041',
  title: LONG,
  description: `${LONG} ${LONG}`,
  artist: creator,
  artistName: creator.displayName,
  genre: 'Technology',
  coverArt: COVER,
  artwork: COVER,
  duration: 5427,
  playCount: 12450,
  likeCount: 844,
  isPublic: true,
  visibility: 'public',
  publicationStatus: 'published',
  sourceBroadcast: broadcastLive.id,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const playlist = {
  id: '507f1f77bcf86cd799439051',
  _id: '507f1f77bcf86cd799439051',
  name: LONG,
  description: `${LONG} ${LONG}`,
  owner: creator,
  isPublic: true,
  mode: 'playlist',
  tracks: [replayAudio],
  trackCount: 1,
  seasons: [],
  coverArt: COVER,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const notification = {
  id: '507f1f77bcf86cd799439061',
  _id: '507f1f77bcf86cd799439061',
  type: 'broadcast_live',
  title: 'A station you follow is live now',
  message: LONG,
  link: `/listen/live/${broadcastLive.id}`,
  isRead: false,
  createdAt: new Date().toISOString(),
  metadata: { broadcastId: broadcastLive.id, stationId: station.id },
};

const json = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
};

const data = (value, extra = {}) => ({ data: value, timestamp: new Date().toISOString(), ...extra });
const listPage = (items, key) => data(key ? { [key]: items, pagination: { page: 1, limit: 100, total: items.length, pages: 1, hasMore: false } } : items, { pagination: { page: 1, limit: 100, total: items.length, pages: 1, hasMore: false } });

const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
};

const tokenUser = (req) => String(req.headers.authorization || '').includes('creator-token') ? creator : listener;

const settingsFor = (user) => data({
  profile: {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatar: user.avatar,
    bio: LONG,
    location: 'Lagos, Nigeria',
    website: 'https://example.test',
  },
  preferences: {
    language: 'en',
    notifications: { email: true, push: true, newFollowers: true, newReleases: true },
    player: { volume: 0.8, isMuted: false, hapticsEnabled: true, playbackRate: 1, audioQuality: 'auto', isShuffled: false, repeatMode: 'none' },
  },
});

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
  const path = url.pathname.replace(/^\/api/, '');
  const user = tokenUser(req);

  if (path === '/health') return json(res, 200, { status: 'ok' });
  if (path === '/auth/register' && req.method === 'POST') {
    const payload = await readJson(req);
    const registeredUser = {
      ...listener,
      username: String(payload.username || listener.username),
      email: String(payload.email || listener.email),
      displayName: String(payload.displayName || listener.displayName),
      profileCompleted: false,
      onboardingCompleted: false,
    };
    return json(res, 201, data({ user: registeredUser, accessToken: 'listener-token', refreshToken: 'listener-refresh-token' }));
  }
  if (path === '/auth/login' && req.method === 'POST') {
    return json(res, 200, data({ user: listener, accessToken: 'listener-token', refreshToken: 'listener-refresh-token' }));
  }
  if (path === '/auth/me') return json(res, 200, data({ user }));
  if (path === '/settings' && req.method === 'GET') return json(res, 200, settingsFor(user));
  if (path.startsWith('/settings/') && ['PATCH', 'POST'].includes(req.method)) return json(res, 200, settingsFor(user));

  if (path === '/studio/dashboard') return json(res, 200, data({
    creator: user,
    stats: { totalTracks: 1, totalListeners: 5501, totalFollowers: 5501, totalPlays: 12450 },
    recentContent: [replayAudio],
    upcomingBroadcasts: [broadcastScheduled],
  }));
  if (path === '/studio/content') return json(res, 200, data({ tracks: [replayAudio], pagination: { page: 1, limit: 50, total: 1, pages: 1 } }));
  if (path === '/studio/audience') return json(res, 200, data({ stats: { totalFollowers: 5501, totalListeners: 12500, returningListeners: 4200 }, followers: [listener], recentFollowers: [listener], topLocations: [{ name: 'Lagos', count: 3400 }] }));
  if (path === '/studio/analytics') return json(res, 200, data({ summary: { plays: 12450, listeners: 5501, followers: 5501, avgListenTime: 1800 }, trend: [], topContent: [replayAudio], locations: [] }));

  if (path === '/listener/dashboard') return json(res, 200, data({
    greeting: 'Good morning, Lola',
    liveNow: [broadcastLive, { ...broadcastLive, id: '507f1f77bcf86cd799439033', _id: '507f1f77bcf86cd799439033', title: 'Deep Focus Beats' }],
    discoverStations: [station, { ...station, id: '507f1f77bcf86cd799439022', _id: '507f1f77bcf86cd799439022', name: 'Design Talks', category: 'Design' }],
    continueListening: [{ ...replayAudio, progress: 120 }],
    topCategories: ['Technology'],
  }));

  if (path === '/stations/mine/all') return json(res, 200, listPage([station], 'stations'));
  if (path === '/stations') return json(res, 200, listPage([station], 'stations'));
  if (/^\/stations\/[^/]+$/.test(path)) return json(res, 200, data(station));

  if (path === '/broadcasts/mine/all') return json(res, 200, listPage([{ ...broadcastLive, status: 'completed', assetStatus: { audio: 'ready', transcript: 'ready_for_review', highlights: 'ready', chapters: 'ready' }, replayAudio: replayAudio.id, assetVisibility: { audio: 'public', transcript: 'public' } }], 'broadcasts'));
  if (path === '/broadcasts') return json(res, 200, listPage([broadcastLive, broadcastScheduled], 'broadcasts'));
  if (/^\/broadcasts\/station\/[^/]+\/live$/.test(path)) return json(res, 200, data(broadcastLive));
  if (/^\/broadcasts\/station\/[^/]+\/upcoming$/.test(path)) return json(res, 200, listPage([broadcastScheduled], 'broadcasts'));
  if (/^\/broadcasts\/[^/]+\/presence$/.test(path)) return json(res, 200, data({ listenerCount: 1284, peakListeners: 1900, status: 'live' }));
  if (/^\/broadcasts\/[^/]+\/processing$/.test(path)) return json(res, 200, data({ broadcast: { ...broadcastLive, status: 'completed', replayAudio: replayAudio.id, assetStatus: { audio: 'ready', transcript: 'ready_for_review', highlights: 'ready', chapters: 'ready' }, assetVisibility: { audio: 'public', transcript: 'public' } }, jobs: [] }));
  if (/^\/broadcasts\/[^/]+\/listener-token$/.test(path)) return json(res, 409, { error: { code: 'E2E_LIVEKIT_DISABLED', message: 'LiveKit is intentionally disabled in deterministic browser tests.' } });
  if (/^\/broadcasts\/[^/]+$/.test(path)) return json(res, 200, data(broadcastLive));

  if (path === '/audio') return json(res, 200, listPage([replayAudio]));
  if (/^\/audio\/[^/]+\/stream-token$/.test(path)) return json(res, 200, data({ streamUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=', expiresIn: 300 }));
  if (/^\/audio\/[^/]+\/download$/.test(path)) {
    res.writeHead(200, { 'content-type': 'audio/wav', 'access-control-allow-origin': '*', 'content-length': '44' });
    return res.end(Buffer.alloc(44));
  }
  if (/^\/audio\/[^/]+$/.test(path)) return json(res, 200, data(replayAudio));

  if (path === '/search') return json(res, 200, data({
    query: url.searchParams.get('q') || '',
    results: { tracks: [replayAudio], creators: [creator], stations: [station], playlists: [playlist] },
    counts: { tracks: 1, creators: 1, stations: 1, playlists: 1 },
  }));
  if (path === '/search/tracks') return json(res, 200, data({ tracks: [replayAudio], pagination: { page: 1, total: 1, pages: 1 } }));

  if (path === '/library/tracks') return json(res, 200, data({ tracks: [replayAudio], pagination: { page: 1, total: 1, pages: 1 } }));
  if (path === '/library/stats') return json(res, 200, data({ savedTracks: 1, playlists: 1, totalSaved: 1, listeningHistory: 1 }));
  if (/^\/library\/tracks\/[^/]+\/check$/.test(path)) return json(res, 200, data({ saved: true }));
  if (/^\/library\/tracks\/[^/]+\/save$/.test(path)) return json(res, 200, data({ saved: req.method !== 'DELETE' }));

  if (path === '/playlists/mine') return json(res, 200, listPage([playlist]));
  if (path === '/playlists/public') return json(res, 200, listPage([playlist]));
  if (path === '/playlists') return json(res, 200, listPage([playlist]));
  if (/^\/playlists\/[^/]+$/.test(path)) return json(res, 200, data(playlist));
  if (/^\/playlists\/[^/]+\/.+/.test(path)) return json(res, 200, data(playlist));

  if (path === '/history') return json(res, 200, data({ history: [{ id: '507f1f77bcf86cd799439071', track: replayAudio, playedAt: new Date().toISOString(), progress: 120, completed: false }], pagination: { page: 1, total: 1, pages: 1 } }));
  if (/^\/history\//.test(path)) return json(res, 200, data({ ok: true }));
  if (path === '/downloads') return json(res, 200, data({ downloads: [], pagination: { page: 1, total: 0, pages: 1 } }));
  if (/^\/downloads\//.test(path)) return json(res, 200, data({ ok: true }));

  if (path === '/notifications') return json(res, 200, data({ notifications: [notification], unreadCount: 1, pagination: { page: 1, total: 1, pages: 1 } }));
  if (path === '/notifications/unread-count') return json(res, 200, data({ unreadCount: 1 }));
  if (/^\/notifications\//.test(path)) return json(res, 200, data({ ...notification, isRead: true }));

  if (path === '/follows/me/stations') return json(res, 200, data({ stations: [station] }));
  if (path === '/follows/me/creators') return json(res, 200, data({ creators: [creator] }));
  if (/^\/follows\/stations\//.test(path)) return json(res, 200, data({ following: req.method !== 'DELETE' }));
  if (/^\/follows\/[^/]+\/status$/.test(path)) return json(res, 200, data({ following: true }));
  if (/^\/follows\/[^/]+\/follow$/.test(path)) return json(res, 200, data({ following: req.method !== 'DELETE' }));

  if (path === '/profile/me') return json(res, 200, data({ ...user, stations: [station] }));
  if (/^\/profile\//.test(path)) return json(res, 200, data({ ...creator, stations: [station] }));

  if (path === '/transcripts/search') return json(res, 200, data([] , { pagination: { limit: 25, hasMore: false, nextCursor: null } }));
  if (/^\/transcripts\/audio\//.test(path)) return json(res, 200, data([{ id: '507f1f77bcf86cd799439081', startMs: 0, endMs: 5000, speaker: 'Creator', text: LONG, isFinal: true, publicationStatus: 'published' }], { pagination: { hasMore: false } }));
  if (/^\/transcripts\/broadcast\//.test(path)) return json(res, 200, data([{ id: '507f1f77bcf86cd799439081', startMs: 0, endMs: 5000, speaker: 'Creator', text: LONG, isFinal: true, publicationStatus: 'draft' }], { pagination: { hasMore: false } }));

  // Mutating endpoints not explicitly modelled still get a deterministic OK so
  // navigation and UI-state tests exercise the real frontend without a database.
  if (['POST', 'PATCH', 'DELETE'].includes(req.method || '')) return json(res, 200, data({ ok: true }));

  return json(res, 200, data([]));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[echoo-e2e] mock API listening on http://127.0.0.1:${PORT}/api`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
