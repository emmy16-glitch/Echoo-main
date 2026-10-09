import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { deleteCachedJson, getCachedJson } from '@/src/services/localCache';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:5001/api';
const REQUEST_TIMEOUT_MS = 12000;
const isProductionRuntime = process.env.NODE_ENV === 'production';
const localApiUrlPattern = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|10\.0\.2\.2)(?::\d+)?(?:\/|$)/i;

if (isProductionRuntime && localApiUrlPattern.test(API_URL)) {
  throw new Error('Production Echoo mobile build is using a local API URL.');
}
const TOKEN_KEYS = {
  access: 'echoo.accessToken',
  refresh: 'echoo.refreshToken',
};

let webAccessToken = '';
let webRefreshToken = '';
let refreshPromise: Promise<string> | null = null;

export type EchooUser = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatar?: string | null;
  bio?: string;
  userType?: 'listener' | 'creator';
  onboardingCompleted?: boolean;
};

export type EchooCreator = {
  id: string;
  username: string;
  displayName: string;
  avatar?: string | null;
  bio?: string;
};

export type EchooStation = {
  id: string;
  name: string;
  category?: string;
  description?: string;
  coverArt?: string | null;
  brandCover?: string | null;
  followerCount?: number;
  listenerCount?: number;
  isLive?: boolean;
  owner?: EchooCreator | null;
};

export type EchooBroadcast = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  stationId?: string;
  stationName?: string;
  startTime?: string;
  endTime?: string;
  assetStatus?: {
    audio?: string;
    transcript?: string;
    highlights?: string;
    chapters?: string;
  };
  assetVisibility?: {
    audio?: string;
    transcript?: string;
  };
  replayAudio?: EchooAudio | string | null;
  listenerCount?: number;
  peakListeners?: number;
  coverArt?: string | null;
};

export type EchooAudio = {
  id: string;
  title: string;
  subtitle?: string;
  artistName?: string;
  artistId?: string;
  stationId?: string;
  stationName?: string;
  genre?: string;
  coverArt?: string | null;
  duration?: number;
  playCount?: number;
  likeCount?: number;
  fileUrl?: string | null;
};

export type EchooPlaylistTrack = {
  id: string;
  title: string;
  genre?: string;
  duration?: number;
  coverArt?: string | null;
  fileUrl?: string | null;
};

export type EchooPlaylist = {
  id: string;
  name: string;
  description?: string;
  mode?: 'playlist' | 'series';
  coverArt?: string | null;
  stationId?: string;
  trackCount?: number;
  followerCount?: number;
  updatedAt?: string;
  createdAt?: string;
  owner?: EchooCreator | null;
  tracks: EchooPlaylistTrack[];
};

export type EchooDownload = {
  id: string;
  trackId: string;
  track: EchooAudio | null;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'paused';
  progress: number;
  fileSize: number;
  downloadedSize: number;
  quality?: string;
  createdAt?: string;
  expiresAt?: string;
};

export type EchooHistoryItem = {
  id: string;
  track: EchooAudio | null;
  playedAt?: string;
  progress?: number;
  completed?: boolean;
};

export type EchooLibraryStats = {
  savedTracks: number;
  playlists: number;
  totalSaved: number;
  listeningHistory: number;
};

export type EchooCreatorStats = {
  listeners: number;
  peakListeners: number;
  plays: number;
  followers: number;
  engagement: number;
};

export type EchooCreatorDashboard = {
  stats: EchooCreatorStats;
  recentContent: EchooAudio[];
  upcomingSchedule: EchooBroadcast[];
  activeBroadcasts: EchooBroadcast[];
  totalTracks: number;
  totalPlays: number;
};

export type EchooCreatorLiveCredentials = {
  token: string;
  roomName: string;
  livekitUrl: string;
  broadcastId: string;
  mediaMode?: string;
};

export type EchooBroadcastProcessing = {
  broadcast: EchooBroadcast | null;
  jobs: {
    id: string;
    jobType?: string;
    status?: string;
    progress?: number;
    error?: string;
  }[];
};

type AuthMode = 'none' | 'optional' | 'required';
type RequestOptions = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  auth?: AuthMode;
  retry?: boolean;
};
type CacheControlOptions = { force?: boolean };

const CACHE = {
  discovery: 5 * 60 * 1000,
  publicList: 10 * 60 * 1000,
  search: 90 * 1000,
  live: 20 * 1000,
  presence: 8 * 1000,
  liveStale: 2 * 60 * 1000,
  account: 45 * 1000,
  accountStale: 60 * 60 * 1000,
  stale: 24 * 60 * 60 * 1000,
};

const unwrapList = (payload: any) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.tracks)) return payload.data.tracks;
  if (Array.isArray(payload?.data?.stations)) return payload.data.stations;
  if (Array.isArray(payload?.data?.broadcasts)) return payload.data.broadcasts;
  return [];
};

const normalizeUrl = (value?: string | null) => {
  if (!value) return null;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  const origin = API_URL.replace(/\/api\/?$/, '');
  return `${origin}${value.startsWith('/') ? value : `/${value}`}`;
};

const normalizeCoverArt = (value: unknown, resourcePath: string) => {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('data:image/svg+xml')) return `${API_URL}${resourcePath}`;
  return normalizeUrl(value);
};

const makeApiError = (payload: any, status: number) => {
  const error = new Error(
    payload?.error?.message || payload?.message || `Request failed: ${status}`
  ) as Error & { code?: string; status?: number; data?: any };
  error.code = payload?.error?.code || 'REQUEST_FAILED';
  error.status = status;
  error.data = payload;
  return error;
};

const readSecureToken = async (key: string) => {
  if (Platform.OS === 'web') {
    return key === TOKEN_KEYS.access ? webAccessToken : webRefreshToken;
  }
  return SecureStore.getItemAsync(key);
};

const writeSecureToken = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    if (key === TOKEN_KEYS.access) webAccessToken = value;
    if (key === TOKEN_KEYS.refresh) webRefreshToken = value;
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
};

const deleteSecureToken = async (key: string) => {
  if (Platform.OS === 'web') {
    if (key === TOKEN_KEYS.access) webAccessToken = '';
    if (key === TOKEN_KEYS.refresh) webRefreshToken = '';
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

export async function saveSession(accessToken?: string, refreshToken?: string) {
  const writes: Promise<void>[] = [];
  if (accessToken) writes.push(writeSecureToken(TOKEN_KEYS.access, accessToken));
  if (refreshToken) writes.push(writeSecureToken(TOKEN_KEYS.refresh, refreshToken));
  await Promise.all(writes);
}

export async function clearSession() {
  await Promise.all([
    deleteSecureToken(TOKEN_KEYS.access),
    deleteSecureToken(TOKEN_KEYS.refresh),
  ]);
}

export async function hasEchooSession() {
  return Boolean(await readSecureToken(TOKEN_KEYS.access));
}

export async function getAccessToken() {
  return readSecureToken(TOKEN_KEYS.access);
}

async function parseResponse(response: Response) {
  return response.json().catch(() => null);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Echoo is taking too long to respond. Check your connection and try again.') as Error & {
        code?: string;
        status?: number;
      };
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await readSecureToken(TOKEN_KEYS.refresh);
    if (!refreshToken) {
      const error = new Error('Sign in required') as Error & { code?: string };
      error.code = 'AUTH_REQUIRED';
      throw error;
    }

    const response = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      await clearSession();
      throw makeApiError(payload, response.status);
    }

    const accessToken = payload?.data?.accessToken;
    const nextRefreshToken = payload?.data?.refreshToken;
    if (!accessToken) throw new Error('Echoo did not return a refreshed access token');

    await saveSession(accessToken, nextRefreshToken);
    return accessToken as string;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function apiRequest(path: string, options: RequestOptions = {}) {
  const auth = options.auth || 'optional';
  const accessToken = auth === 'none' ? '' : (await readSecureToken(TOKEN_KEYS.access)) || '';

  if (auth === 'required' && !accessToken) {
    const error = new Error('Sign in to use this Echoo feature') as Error & { code?: string; status?: number };
    error.code = 'AUTH_REQUIRED';
    error.status = 401;
    throw error;
  }

  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers || {}),
  };

  let response = await fetchWithTimeout(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });
  let payload = await parseResponse(response);

  if (response.status === 401 && auth !== 'none' && options.retry !== false) {
    const refreshToken = await readSecureToken(TOKEN_KEYS.refresh);
    if (refreshToken) {
      try {
        const nextAccessToken = await refreshAccessToken();
        response = await fetchWithTimeout(`${API_URL}${path}`, {
          method: options.method || 'GET',
          headers: {
            ...headers,
            Authorization: `Bearer ${nextAccessToken}`,
          },
          body: options.body,
        });
        payload = await parseResponse(response);
      } catch {
        if (auth === 'required') {
          const error = new Error('Your session has expired. Please sign in again.') as Error & {
            code?: string;
            status?: number;
          };
          error.code = 'SESSION_EXPIRED';
          error.status = 401;
          throw error;
        }
      }
    }
  }

  if (!response.ok) throw makeApiError(payload, response.status);
  return payload;
}

async function cachedPublicRequest(
  path: string,
  maxAgeMs = CACHE.publicList,
  staleAgeMs = CACHE.stale,
  options: CacheControlOptions = {}
) {
  return getCachedJson(
    `public:${API_URL}:${path}`,
    { maxAgeMs, staleAgeMs, forceRefresh: options.force },
    () => apiRequest(path, { auth: 'none' })
  );
}

async function cachedAccountRequest(
  path: string,
  maxAgeMs = CACHE.account,
  options: CacheControlOptions = {}
) {
  const accessToken = await readSecureToken(TOKEN_KEYS.access);
  if (!accessToken) {
    const error = new Error('Sign in to use this Echoo feature') as Error & { code?: string; status?: number };
    error.code = 'AUTH_REQUIRED';
    error.status = 401;
    throw error;
  }

  return getCachedJson(
    `account:${API_URL}:${accessToken}:${path}`,
    { maxAgeMs, staleAgeMs: CACHE.accountStale, forceRefresh: options.force },
    () => apiRequest(path, { auth: 'required' })
  );
}

async function accountCacheKey(path: string) {
  const accessToken = await readSecureToken(TOKEN_KEYS.access);
  return accessToken ? `account:${API_URL}:${accessToken}:${path}` : '';
}

async function invalidateAccountCache(paths: string[]) {
  await Promise.all(
    paths.map(async (path) => {
      const key = await accountCacheKey(path);
      if (key) await deleteCachedJson(key);
    })
  );
}

export const normalizeStation = (station: any): EchooStation => {
  const id = station?.id || station?._id || '';
  const rawCover = station?.brandCover || station?.coverArt || station?.logo || station?.image;
  const coverArt = normalizeCoverArt(rawCover, `/stations/${id}/cover-art`);

  return {
    ...station,
    id,
    name: station?.name || 'Untitled Station',
    coverArt,
    brandCover: coverArt,
    followerCount: Number(station?.followerCount) || 0,
    listenerCount: Number(station?.listenerCount) || 0,
    isLive: Boolean(station?.isLive),
    owner: station?.owner
      ? {
          id: station.owner?.id || station.owner?._id || '',
          username: station.owner?.username || '',
          displayName: station.owner?.displayName || station.owner?.username || 'Echoo Creator',
          avatar: normalizeUrl(station.owner?.avatar),
          bio: station.owner?.bio || '',
        }
      : null,
  };
};

export const normalizeBroadcast = (broadcast: any): EchooBroadcast => {
  const stationId =
    typeof broadcast?.station === 'object'
      ? broadcast.station?.id || broadcast.station?._id || ''
      : broadcast?.station || broadcast?.stationId || '';
  const rawCover = broadcast?.eventArtwork || broadcast?.coverArt || broadcast?.station?.brandCover || broadcast?.station?.coverArt || broadcast?.station?.logo;

  return {
    ...broadcast,
    id: broadcast?.id || broadcast?._id || '',
    title: broadcast?.title || 'Untitled Broadcast',
    stationId,
    stationName:
      typeof broadcast?.station === 'object'
        ? broadcast.station?.name || 'Echoo Station'
        : broadcast?.stationName || 'Echoo Station',
    listenerCount: Number(broadcast?.listenerCount) || 0,
    peakListeners: Number(broadcast?.peakListeners) || 0,
    coverArt: normalizeCoverArt(rawCover, `/stations/${stationId}/cover-art`),
    replayAudio: typeof broadcast?.replayAudio === 'object'
      ? normalizeAudio(broadcast.replayAudio)
      : broadcast?.replayAudio || broadcast?.replayAudioId || null,
  };
};

export const normalizeAudio = (track: any): EchooAudio => {
  const id = track?.id || track?._id || '';
  const station = typeof track?.station === 'object' ? track.station : null;

  return {
    ...track,
    id,
    title: track?.title || 'Untitled Audio',
    subtitle:
      track?.subtitle ||
      track?.artistName ||
      track?.artist?.displayName ||
      track?.artist?.username ||
      'Echoo Audio',
    artistName: track?.artistName || track?.artist?.displayName || track?.artist?.username || 'Echoo Creator',
    artistId: track?.artistId || track?.artist?.id || track?.artist?._id || '',
    stationId: track?.stationId || station?.id || station?._id || '',
    stationName: track?.stationName || station?.name || '',
    coverArt: normalizeCoverArt(track?.coverArt || track?.artwork, `/audio/${id}/cover-art`),
    fileUrl: normalizeUrl(track?.fileUrl),
    duration: Number(track?.duration) || 0,
    playCount: Number(track?.playCount) || 0,
    likeCount: Number(track?.likeCount) || 0,
  };
};

const normalizePlaylistTrack = (entry: any): EchooPlaylistTrack => {
  const track = entry?.trackId || entry?.track || entry;
  const normalized = normalizeAudio(track);
  return {
    id: normalized.id,
    title: normalized.title,
    genre: normalized.genre,
    duration: normalized.duration,
    coverArt: normalized.coverArt,
    fileUrl: normalized.fileUrl,
  };
};

export const normalizePlaylist = (playlist: any): EchooPlaylist => {
  const id = playlist?.id || playlist?._id || '';
  const rawTracks = Array.isArray(playlist?.tracks)
    ? playlist.tracks
    : Array.isArray(playlist?.recordings)
      ? playlist.recordings
      : [];
  const tracks = rawTracks.length
    ? rawTracks.map(normalizePlaylistTrack).filter((track: EchooPlaylistTrack) => track.id)
    : [];
  const trackCount = Number(playlist?.trackCount ?? playlist?.broadcastCount);
  const rawOwner = playlist?.owner || playlist?.creator;

  return {
    ...playlist,
    id,
    name: playlist?.name || playlist?.title || 'Untitled Collection',
    description: playlist?.description || '',
    mode: playlist?.mode === 'series' ? 'series' : 'playlist',
    coverArt: normalizeCoverArt(playlist?.coverArt, `/playlists/${id}/cover-art`),
    stationId: playlist?.stationId || playlist?.station?.id || playlist?.station?._id || '',
    trackCount: Number.isFinite(trackCount) ? trackCount : tracks.length,
    followerCount: Number(playlist?.followerCount) || 0,
    updatedAt: playlist?.updatedAt,
    createdAt: playlist?.createdAt,
    owner: rawOwner
      ? {
          id: rawOwner?.id || rawOwner?._id || playlist?.creatorId || '',
          username: rawOwner?.username || '',
          displayName: rawOwner?.displayName || rawOwner?.username || 'Echoo Creator',
          avatar: normalizeUrl(rawOwner?.avatar),
          bio: rawOwner?.bio || '',
        }
      : null,
    tracks,
  };
};

const normalizeDownload = (download: any): EchooDownload => ({
  id: download?.id || download?._id || '',
  trackId: download?.trackId || download?.track?._id || download?.track?.id || '',
  track: download?.track ? normalizeAudio(download.track) : null,
  status: download?.status || 'pending',
  progress: Number(download?.progress) || 0,
  fileSize: Number(download?.fileSize) || 0,
  downloadedSize: Number(download?.downloadedSize) || 0,
  quality: download?.quality || 'medium',
  createdAt: download?.createdAt,
  expiresAt: download?.expiresAt,
});

const normalizeUser = (user: any): EchooUser => ({
  id: user?.id || user?._id || '',
  username: user?.username || '',
  displayName: user?.displayName || user?.username || 'Echoo Listener',
  email: user?.email || '',
  avatar: normalizeUrl(user?.avatar),
  bio: user?.bio || '',
  userType: user?.userType || 'listener',
  onboardingCompleted: Boolean(user?.onboardingCompleted),
});

export async function getMobileDiscovery(options: CacheControlOptions = {}) {
  const [stationsPayload, livePayload, scheduledPayload, audioPayload] = await Promise.all([
    cachedPublicRequest('/stations?page=1&limit=20', CACHE.discovery, CACHE.stale, options),
    cachedPublicRequest('/broadcasts?status=live&page=1&limit=20', CACHE.live, CACHE.liveStale, options),
    cachedPublicRequest('/broadcasts?status=scheduled&page=1&limit=20', CACHE.discovery, CACHE.stale, options),
    cachedPublicRequest('/audio?page=1&limit=20&public=true', CACHE.discovery, CACHE.stale, options).catch(() => ({ data: [] })),
  ]);

  return {
    stations: unwrapList(stationsPayload).map(normalizeStation).filter((item: EchooStation) => item.id),
    live: unwrapList(livePayload).map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id),
    scheduled: unwrapList(scheduledPayload).map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id),
    audio: unwrapList(audioPayload).map(normalizeAudio).filter((item: EchooAudio) => item.id),
  };
}

export async function searchEchoo(query: string, options: CacheControlOptions = {}) {
  const value = encodeURIComponent(query.trim());
  if (!value) return { audio: [], stations: [], live: [] };

  const [audioPayload, stationsPayload, livePayload] = await Promise.all([
    cachedPublicRequest(`/audio?search=${value}&public=true&page=1&limit=20`, CACHE.search, CACHE.stale, options).catch(() => ({ data: [] })),
    cachedPublicRequest(`/stations?search=${value}&page=1&limit=20`, CACHE.search, CACHE.stale, options).catch(() => ({ data: [] })),
    cachedPublicRequest(`/broadcasts?search=${value}&page=1&limit=20`, CACHE.search, CACHE.liveStale, options).catch(() => ({ data: [] })),
  ]);

  return {
    audio: unwrapList(audioPayload).map(normalizeAudio).filter((item: EchooAudio) => item.id),
    stations: unwrapList(stationsPayload).map(normalizeStation).filter((item: EchooStation) => item.id),
    live: unwrapList(livePayload).map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id),
  };
}

export async function getPublicAudioByCreator(creatorId: string, options: CacheControlOptions = {}) {
  if (!creatorId) return [];
  const payload = await cachedPublicRequest(
    `/audio?public=true&userId=${encodeURIComponent(creatorId)}&page=1&limit=100`,
    CACHE.publicList,
    CACHE.stale,
    options
  );
  return unwrapList(payload).map(normalizeAudio).filter((item: EchooAudio) => item.id);
}

const normalizeStudioAudio = (track: any): EchooAudio => normalizeAudio({
  ...track,
  playCount: track?.playCount ?? track?.plays,
  likeCount: track?.likeCount ?? track?.likes,
});

export async function getCreatorDashboard(options: CacheControlOptions = {}): Promise<EchooCreatorDashboard> {
  const payload = await cachedAccountRequest('/studio/dashboard', CACHE.account, options);
  const data = payload?.data || {};
  const stats = data.stats || {};

  return {
    stats: {
      listeners: Number(stats.listeners) || 0,
      peakListeners: Number(stats.peakListeners) || 0,
      plays: Number(stats.plays) || Number(data.totalPlays) || 0,
      followers: Number(stats.followers) || 0,
      engagement: Number(stats.engagement) || 0,
    },
    recentContent: Array.isArray(data.recentContent)
      ? data.recentContent.map(normalizeStudioAudio).filter((item: EchooAudio) => item.id)
      : [],
    upcomingSchedule: Array.isArray(data.upcomingSchedule)
      ? data.upcomingSchedule.map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id)
      : [],
    activeBroadcasts: Array.isArray(data.activeBroadcasts)
      ? data.activeBroadcasts.map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id)
      : [],
    totalTracks: Number(data.totalTracks) || 0,
    totalPlays: Number(data.totalPlays) || 0,
  };
}

export async function getCreatorContent(options: CacheControlOptions = {}) {
  const payload = await cachedAccountRequest('/studio/content?page=1&limit=20', CACHE.account, options);
  const rows = Array.isArray(payload?.data?.tracks) ? payload.data.tracks : [];
  return rows.map(normalizeStudioAudio).filter((item: EchooAudio) => item.id);
}

export async function getMyStations(options: CacheControlOptions = {}) {
  const payload = await cachedAccountRequest('/stations/mine/all', CACHE.account, options);
  return unwrapList(payload).map(normalizeStation).filter((item: EchooStation) => item.id);
}

export async function getMyBroadcasts(options: CacheControlOptions = {}) {
  const payload = await cachedAccountRequest('/broadcasts/mine/all', CACHE.account, options);
  return unwrapList(payload).map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id);
}

export async function createCreatorBroadcast(input: {
  title: string;
  stationId: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  isPublic?: boolean;
}) {
  const payload = await apiRequest('/broadcasts', {
    method: 'POST',
    auth: 'required',
    body: JSON.stringify({
      title: input.title,
      description: input.description || '',
      stationId: input.stationId,
      startTime: input.startTime || new Date().toISOString(),
      ...(input.endTime ? { endTime: input.endTime } : {}),
      type: 'live',
      isPublic: input.isPublic !== false,
      audioSources: [{ id: 'mobile-mic', type: 'microphone', label: 'Phone microphone' }],
      realtimeAudio: { source: 'mobile', device: 'phone-mic' },
    }),
  });
  await invalidateAccountCache(['/broadcasts/mine/all', '/studio/dashboard']);
  return normalizeBroadcast(payload?.data);
}

export async function startCreatorBroadcast(broadcastId: string): Promise<EchooCreatorLiveCredentials> {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/start`, {
    method: 'POST',
    auth: 'required',
  });
  await invalidateAccountCache(['/broadcasts/mine/all', '/studio/dashboard']);
  return {
    token: payload?.data?.token,
    roomName: payload?.data?.roomName,
    livekitUrl: payload?.data?.livekitUrl,
    broadcastId: payload?.data?.broadcast?.id || payload?.data?.broadcast?._id || broadcastId,
    mediaMode: payload?.data?.mediaMode,
  };
}

export async function confirmCreatorBroadcastLive(broadcastId: string) {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/confirm-live`, {
    method: 'POST',
    auth: 'required',
  });
  await invalidateAccountCache(['/broadcasts/mine/all', '/studio/dashboard']);
  return normalizeBroadcast(payload?.data);
}

export async function getCreatorLiveKitCredentials(broadcastId: string): Promise<EchooCreatorLiveCredentials> {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/livekit-token`, {
    method: 'POST',
    auth: 'required',
  });
  return payload?.data || null;
}

export async function endCreatorBroadcast(broadcastId: string) {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/end`, {
    method: 'POST',
    auth: 'required',
  });
  await invalidateAccountCache(['/broadcasts/mine/all', '/studio/dashboard']);
  return normalizeBroadcast(payload?.data?.broadcast || payload?.data);
}

export async function discardCreatorReplay(broadcastId: string) {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/discard-replay`, {
    method: 'POST',
    auth: 'required',
  });
  await invalidateAccountCache(['/broadcasts/mine/all', '/studio/dashboard', '/studio/content?page=1&limit=20']);
  return normalizeBroadcast(payload?.data);
}

export async function getCreatorBroadcastProcessing(broadcastId: string): Promise<EchooBroadcastProcessing> {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/processing`, { auth: 'required' });
  const rows = Array.isArray(payload?.data?.jobs) ? payload.data.jobs : [];
  return {
    broadcast: payload?.data?.broadcast ? normalizeBroadcast(payload.data.broadcast) : null,
    jobs: rows.map((job: any) => ({
      id: job?.id || job?._id || `${job?.jobType || 'job'}-${job?.createdAt || ''}`,
      jobType: job?.jobType,
      status: job?.status,
      progress: Number(job?.progress) || 0,
      error: job?.error,
    })),
  };
}

export async function publishCreatorReplay(
  broadcastId: string,
  visibility: 'public' | 'followers' | 'private' = 'public'
) {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/publish-replay`, {
    method: 'POST',
    auth: 'required',
    body: JSON.stringify({ visibility }),
  });
  await invalidateAccountCache(['/broadcasts/mine/all', '/studio/dashboard', '/studio/content?page=1&limit=20']);
  return {
    broadcast: normalizeBroadcast(payload?.data?.broadcast),
    audio: payload?.data?.audio ? normalizeAudio(payload.data.audio) : null,
  };
}

export async function updateCreatorStation(stationId: string, input: {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
}) {
  const payload = await apiRequest(`/stations/${stationId}`, {
    method: 'PATCH',
    auth: 'required',
    body: JSON.stringify(input),
  });
  await invalidateAccountCache(['/stations/mine/all', '/studio/dashboard']);
  await deleteCachedJson(`station:${API_URL}:${stationId}`);
  return normalizeStation(payload?.data);
}

const invalidateCreatorContentCache = async () => {
  await invalidateAccountCache([
    '/studio/dashboard',
    '/studio/content?page=1&limit=20',
  ]);
};

export async function uploadCreatorAudio(input: {
  audio: { uri: string; name: string; mimeType?: string };
  cover?: { uri: string; name: string; mimeType?: string } | null;
  title: string;
  description?: string;
  genre?: string;
  tags?: string[];
  isPublic?: boolean;
}) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    const error = new Error('Sign in to upload audio') as Error & { code?: string; status?: number };
    error.code = 'AUTH_REQUIRED';
    error.status = 401;
    throw error;
  }

  const body = new FormData();
  body.append('title', input.title.trim());
  body.append('description', input.description || '');
  body.append('genre', input.genre || 'Other');
  body.append('tags', JSON.stringify(input.tags || []));
  body.append('isPublic', input.isPublic ? 'true' : 'false');
  body.append('audio', {
    uri: input.audio.uri,
    name: input.audio.name || 'echoo-audio.mp3',
    type: input.audio.mimeType || 'audio/mpeg',
  } as any);

  if (input.cover?.uri) {
    body.append('cover', {
      uri: input.cover.uri,
      name: input.cover.name || 'echoo-cover.jpg',
      type: input.cover.mimeType || 'image/jpeg',
    } as any);
  }

  const response = await fetch(`${API_URL}/audio/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw makeApiError(payload, response.status);

  await invalidateCreatorContentCache();
  return normalizeAudio(payload?.data);
}

export async function updateCreatorAudio(trackId: string, input: {
  title?: string;
  description?: string;
  genre?: string;
  tags?: string[];
  isPublic?: boolean;
}) {
  const payload = await apiRequest(`/audio/${trackId}`, {
    method: 'PATCH',
    auth: 'required',
    body: JSON.stringify(input),
  });
  await invalidateCreatorContentCache();
  return normalizeAudio(payload?.data);
}

export async function deleteCreatorAudio(trackId: string) {
  const payload = await apiRequest(`/audio/${trackId}`, {
    method: 'DELETE',
    auth: 'required',
  });
  await invalidateCreatorContentCache();
  return payload;
}

export async function loginEchoo(identifier: string, password: string) {
  const payload = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: identifier.trim(), password }),
    auth: 'none',
  });
  await saveSession(payload?.data?.accessToken, payload?.data?.refreshToken);
  return normalizeUser(payload?.data?.user);
}

export async function registerEchoo(input: {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}) {
  const payload = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
    auth: 'none',
  });
  await saveSession(payload?.data?.accessToken, payload?.data?.refreshToken);
  return normalizeUser(payload?.data?.user);
}

export async function getCurrentUser() {
  const payload = await apiRequest('/auth/me', { auth: 'required' });
  return normalizeUser(payload?.data?.user);
}

export async function logoutEchoo() {
  try {
    await apiRequest('/auth/logout', { method: 'POST', auth: 'required', retry: false });
  } finally {
    await clearSession();
  }
}

export async function deleteEchooAccount(password: string) {
  const payload = await apiRequest('/settings/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
    auth: 'required',
  });
  await clearSession();
  return payload;
}

export async function getSavedAudio(options: CacheControlOptions = {}) {
  const payload = await cachedAccountRequest('/library/tracks?page=1&limit=100', CACHE.account, options);
  return (payload?.data?.tracks || []).map(normalizeAudio).filter((item: EchooAudio) => item.id);
}

export async function saveAudio(trackId: string) {
  const payload = await apiRequest(`/library/tracks/${trackId}/save`, { method: 'POST', auth: 'required' });
  await invalidateAccountCache(['/library/tracks?page=1&limit=100', '/library/stats']);
  return payload;
}

export async function unsaveAudio(trackId: string) {
  const payload = await apiRequest(`/library/tracks/${trackId}/save`, { method: 'DELETE', auth: 'required' });
  await invalidateAccountCache(['/library/tracks?page=1&limit=100', '/library/stats']);
  return payload;
}

export async function getDownloads() {
  const payload = await apiRequest('/downloads?page=1&limit=100', { auth: 'required' });
  const rows = Array.isArray(payload?.data?.downloads) ? payload.data.downloads : [];
  return rows.map(normalizeDownload).filter((item: EchooDownload) => item.id);
}

export async function requestDownload(trackId: string, quality: 'low' | 'medium' | 'high' = 'medium') {
  const payload = await apiRequest('/downloads', {
    method: 'POST',
    auth: 'required',
    body: JSON.stringify({ trackId, quality }),
  });
  return normalizeDownload(payload?.data?.download);
}

export async function updateDownloadProgress(
  downloadId: string,
  input: Partial<Pick<EchooDownload, 'progress' | 'downloadedSize' | 'status'>>
) {
  const payload = await apiRequest(`/downloads/${downloadId}/progress`, {
    method: 'PATCH',
    auth: 'required',
    body: JSON.stringify(input),
  });
  return payload?.data?.download || null;
}

export async function removeDownload(downloadId: string) {
  return apiRequest(`/downloads/${downloadId}`, { method: 'DELETE', auth: 'required' });
}

export async function getFollowedStations(options: CacheControlOptions = {}) {
  const payload = await cachedAccountRequest('/follows/me/stations', CACHE.account, options);
  return (payload?.data?.stations || []).map(normalizeStation).filter((item: EchooStation) => item.id);
}

export async function followStation(stationId: string) {
  const payload = await apiRequest(`/follows/stations/${stationId}`, { method: 'POST', auth: 'required' });
  await invalidateAccountCache(['/follows/me/stations']);
  return payload;
}

export async function unfollowStation(stationId: string) {
  const payload = await apiRequest(`/follows/stations/${stationId}`, { method: 'DELETE', auth: 'required' });
  await invalidateAccountCache(['/follows/me/stations']);
  return payload;
}

export async function getLibraryStats(options: CacheControlOptions = {}): Promise<EchooLibraryStats> {
  const payload = await cachedAccountRequest('/library/stats', CACHE.account, options);
  return {
    savedTracks: Number(payload?.data?.savedTracks) || 0,
    playlists: Number(payload?.data?.playlists) || 0,
    totalSaved: Number(payload?.data?.totalSaved) || 0,
    listeningHistory: Number(payload?.data?.listeningHistory) || 0,
  };
}

export async function getListeningHistory(options: CacheControlOptions = {}) {
  const payload = await cachedAccountRequest('/history?page=1&limit=50', CACHE.account, options);
  return (payload?.data?.history || []).map((item: any): EchooHistoryItem => ({
    id: item?.id || item?._id || '',
    track: item?.track ? normalizeAudio(item.track) : null,
    playedAt: item?.playedAt,
    progress: Number(item?.progress) || 0,
    completed: Boolean(item?.completed),
  }));
}

export async function getStationById(stationId: string, options: CacheControlOptions = {}) {
  const payload = await getCachedJson(
    `station:${API_URL}:${stationId}`,
    { maxAgeMs: CACHE.publicList, staleAgeMs: CACHE.stale, forceRefresh: options.force },
    () => apiRequest(`/stations/${stationId}`, { auth: 'optional' })
  );
  return normalizeStation(payload?.data);
}

export async function getPublicCollectionsByOwner(ownerId: string, options: CacheControlOptions = {}) {
  if (!ownerId) return [];
  const payload = await cachedPublicRequest(
    `/playlists?ownerId=${encodeURIComponent(ownerId)}&page=1&limit=50`,
    CACHE.publicList,
    CACHE.stale,
    options
  );
  return unwrapList(payload).map(normalizePlaylist).filter((item: EchooPlaylist) => item.id);
}

export async function getPublicCollectionsForStation(stationId: string, options: CacheControlOptions = {}) {
  if (!stationId) return [];
  const payload = await cachedPublicRequest(
    `/collections/station/${encodeURIComponent(stationId)}`,
    CACHE.publicList,
    CACHE.stale,
    options
  );
  return unwrapList(payload).map(normalizePlaylist).filter((item: EchooPlaylist) => item.id);
}

export async function getPlaylistById(playlistId: string, options: CacheControlOptions = {}) {
  const payload = await getCachedJson(
    `playlist:${API_URL}:${playlistId}`,
    { maxAgeMs: CACHE.publicList, staleAgeMs: CACHE.stale, forceRefresh: options.force },
    () => apiRequest(`/playlists/${playlistId}`, { auth: 'optional' })
  );
  return normalizePlaylist(payload?.data);
}

export async function getMyPlaylists(options: CacheControlOptions = {}) {
  const payload = await cachedAccountRequest('/playlists/mine/all', CACHE.account, options);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map(normalizePlaylist).filter((item: EchooPlaylist) => item.id);
}

export async function createPlaylist(input: {
  name: string;
  description?: string;
  isPublic?: boolean;
  mode?: 'playlist' | 'series';
}) {
  const payload = await apiRequest('/playlists', {
    method: 'POST',
    auth: 'required',
    body: JSON.stringify({
      name: input.name,
      description: input.description || '',
      isPublic: Boolean(input.isPublic),
      mode: input.mode || 'playlist',
    }),
  });
  await invalidateAccountCache(['/playlists/mine/all', '/library/stats']);
  return normalizePlaylist(payload?.data);
}

export async function addTrackToPlaylist(playlistId: string, trackId: string) {
  const payload = await apiRequest(`/playlists/${playlistId}/tracks`, {
    method: 'POST',
    auth: 'required',
    body: JSON.stringify({ trackId }),
  });
  await invalidateAccountCache(['/playlists/mine/all', '/library/stats']);
  await deleteCachedJson(`playlist:${API_URL}:${playlistId}`);
  return normalizePlaylist(payload?.data);
}

export async function getLiveBroadcastForStation(stationId: string, options: CacheControlOptions = {}) {
  const payload = await cachedPublicRequest(`/broadcasts/station/${stationId}/live`, CACHE.live, CACHE.liveStale, options);
  return payload?.data ? normalizeBroadcast(payload.data) : null;
}

export async function getBroadcastPresence(broadcastId: string, options: CacheControlOptions = {}) {
  const payload = await cachedPublicRequest(`/broadcasts/${broadcastId}/presence`, CACHE.presence, CACHE.liveStale, options);
  return payload?.data || null;
}

export async function getAudioStreamUrl(audioId: string) {
  const id = String(audioId || '').trim();
  if (!id) throw new Error('Audio ID is missing.');

  const signedIn = await hasEchooSession();
  const payload = await apiRequest(
    signedIn
      ? `/audio/${encodeURIComponent(id)}/stream-token`
      : `/audio/${encodeURIComponent(id)}/public-stream-token`,
    {
      method: 'POST',
      auth: signedIn ? 'required' : 'none',
    }
  );

  const streamUrl = normalizeUrl(payload?.data?.streamUrl);
  if (!streamUrl) throw new Error('Echoo could not prepare this audio for playback.');

  return {
    streamUrl,
    downloadUrl: normalizeUrl(payload?.data?.downloadUrl),
    expiresIn: Math.max(0, Number(payload?.data?.expiresIn) || 0),
  };
}

export async function getListenerLiveKitCredentials(broadcastId: string) {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/listener-token`, {
    method: 'POST',
    auth: 'required',
  });
  return payload?.data || null;
}

export { API_URL, normalizeUrl };
