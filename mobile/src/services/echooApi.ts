import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:5001/api';
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
  listenerCount?: number;
  peakListeners?: number;
  coverArt?: string | null;
};

export type EchooAudio = {
  id: string;
  title: string;
  subtitle?: string;
  artistName?: string;
  genre?: string;
  coverArt?: string | null;
  duration?: number;
  playCount?: number;
  likeCount?: number;
  fileUrl?: string | null;
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

type AuthMode = 'none' | 'optional' | 'required';
type RequestOptions = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  auth?: AuthMode;
  retry?: boolean;
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

async function parseResponse(response: Response) {
  return response.json().catch(() => null);
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

    const response = await fetch(`${API_URL}/auth/refresh`, {
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

  let response = await fetch(`${API_URL}${path}`, {
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
        response = await fetch(`${API_URL}${path}`, {
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
  const rawCover = broadcast?.coverArt || broadcast?.station?.coverArt || broadcast?.station?.logo;

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
  };
};

export const normalizeAudio = (track: any): EchooAudio => {
  const id = track?.id || track?._id || '';

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
    coverArt: normalizeCoverArt(track?.coverArt || track?.artwork, `/audio/${id}/cover-art`),
    fileUrl: normalizeUrl(track?.fileUrl),
    duration: Number(track?.duration) || 0,
    playCount: Number(track?.playCount) || 0,
    likeCount: Number(track?.likeCount) || 0,
  };
};

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

export async function getMobileDiscovery() {
  const [stationsPayload, livePayload, scheduledPayload, audioPayload] = await Promise.all([
    apiRequest('/stations?page=1&limit=20', { auth: 'none' }),
    apiRequest('/broadcasts?status=live&page=1&limit=20', { auth: 'none' }),
    apiRequest('/broadcasts?status=scheduled&page=1&limit=20', { auth: 'none' }),
    apiRequest('/audio?page=1&limit=20&public=true', { auth: 'none' }).catch(() => ({ data: [] })),
  ]);

  return {
    stations: unwrapList(stationsPayload).map(normalizeStation).filter((item: EchooStation) => item.id),
    live: unwrapList(livePayload).map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id),
    scheduled: unwrapList(scheduledPayload).map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id),
    audio: unwrapList(audioPayload).map(normalizeAudio).filter((item: EchooAudio) => item.id),
  };
}

export async function searchEchoo(query: string) {
  const value = encodeURIComponent(query.trim());
  if (!value) return { audio: [], stations: [], live: [] };

  const [audioPayload, stationsPayload, livePayload] = await Promise.all([
    apiRequest(`/audio?search=${value}&public=true&page=1&limit=20`, { auth: 'none' }).catch(() => ({ data: [] })),
    apiRequest(`/stations?search=${value}&page=1&limit=20`, { auth: 'none' }).catch(() => ({ data: [] })),
    apiRequest(`/broadcasts?search=${value}&page=1&limit=20`, { auth: 'none' }).catch(() => ({ data: [] })),
  ]);

  return {
    audio: unwrapList(audioPayload).map(normalizeAudio).filter((item: EchooAudio) => item.id),
    stations: unwrapList(stationsPayload).map(normalizeStation).filter((item: EchooStation) => item.id),
    live: unwrapList(livePayload).map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id),
  };
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

export async function getSavedAudio() {
  const payload = await apiRequest('/library/tracks?page=1&limit=100', { auth: 'required' });
  return (payload?.data?.tracks || []).map(normalizeAudio).filter((item: EchooAudio) => item.id);
}

export async function saveAudio(trackId: string) {
  return apiRequest(`/library/tracks/${trackId}/save`, { method: 'POST', auth: 'required' });
}

export async function unsaveAudio(trackId: string) {
  return apiRequest(`/library/tracks/${trackId}/save`, { method: 'DELETE', auth: 'required' });
}

export async function getFollowedStations() {
  const payload = await apiRequest('/follows/me/stations', { auth: 'required' });
  return (payload?.data?.stations || []).map(normalizeStation).filter((item: EchooStation) => item.id);
}

export async function followStation(stationId: string) {
  return apiRequest(`/follows/stations/${stationId}`, { method: 'POST', auth: 'required' });
}

export async function unfollowStation(stationId: string) {
  return apiRequest(`/follows/stations/${stationId}`, { method: 'DELETE', auth: 'required' });
}

export async function getLibraryStats(): Promise<EchooLibraryStats> {
  const payload = await apiRequest('/library/stats', { auth: 'required' });
  return {
    savedTracks: Number(payload?.data?.savedTracks) || 0,
    playlists: Number(payload?.data?.playlists) || 0,
    totalSaved: Number(payload?.data?.totalSaved) || 0,
    listeningHistory: Number(payload?.data?.listeningHistory) || 0,
  };
}

export async function getListeningHistory() {
  const payload = await apiRequest('/history?page=1&limit=50', { auth: 'required' });
  return (payload?.data?.history || []).map((item: any): EchooHistoryItem => ({
    id: item?.id || item?._id || '',
    track: item?.track ? normalizeAudio(item.track) : null,
    playedAt: item?.playedAt,
    progress: Number(item?.progress) || 0,
    completed: Boolean(item?.completed),
  }));
}

export async function getStationById(stationId: string) {
  const payload = await apiRequest(`/stations/${stationId}`, { auth: 'optional' });
  return normalizeStation(payload?.data);
}

export async function getLiveBroadcastForStation(stationId: string) {
  const payload = await apiRequest(`/broadcasts/station/${stationId}/live`, { auth: 'none' });
  return payload?.data ? normalizeBroadcast(payload.data) : null;
}

export async function getBroadcastPresence(broadcastId: string) {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/presence`, { auth: 'none' });
  return payload?.data || null;
}

export async function getListenerLiveKitCredentials(broadcastId: string) {
  const payload = await apiRequest(`/broadcasts/${broadcastId}/listener-token`, {
    method: 'POST',
    auth: 'required',
  });
  return payload?.data || null;
}

export { API_URL, normalizeUrl };
