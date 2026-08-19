const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:5001/api';

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

async function apiGet(path: string, token = '') {
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `Request failed: ${response.status}`);
  }
  return payload;
}

export const normalizeStation = (station: any): EchooStation => ({
  ...station,
  id: station?.id || station?._id || '',
  name: station?.name || 'Untitled Station',
  coverArt: normalizeUrl(station?.brandCover || station?.coverArt || station?.logo || station?.image),
  brandCover: normalizeUrl(station?.brandCover || station?.coverArt || station?.logo || station?.image),
  followerCount: Number(station?.followerCount) || 0,
  listenerCount: Number(station?.listenerCount) || 0,
  isLive: Boolean(station?.isLive),
});

export const normalizeBroadcast = (broadcast: any): EchooBroadcast => ({
  ...broadcast,
  id: broadcast?.id || broadcast?._id || '',
  title: broadcast?.title || 'Untitled Broadcast',
  stationId:
    typeof broadcast?.station === 'object'
      ? broadcast.station?.id || broadcast.station?._id
      : broadcast?.station || broadcast?.stationId || '',
  stationName:
    typeof broadcast?.station === 'object'
      ? broadcast.station?.name || 'Echoo Station'
      : broadcast?.stationName || 'Echoo Station',
  listenerCount: Number(broadcast?.listenerCount) || 0,
  peakListeners: Number(broadcast?.peakListeners) || 0,
  coverArt: normalizeUrl(broadcast?.coverArt || broadcast?.station?.coverArt || broadcast?.station?.logo),
});

export const normalizeAudio = (track: any): EchooAudio => ({
  ...track,
  id: track?.id || track?._id || '',
  title: track?.title || 'Untitled Audio',
  subtitle:
    track?.subtitle ||
    track?.artistName ||
    track?.artist?.displayName ||
    track?.artist?.username ||
    'Echoo Audio',
  coverArt: normalizeUrl(track?.coverArt || track?.artwork),
  duration: Number(track?.duration) || 0,
  playCount: Number(track?.playCount) || 0,
});

export async function getMobileDiscovery() {
  const [stationsPayload, livePayload, scheduledPayload, audioPayload] = await Promise.all([
    apiGet('/stations?page=1&limit=20'),
    apiGet('/broadcasts?status=live&page=1&limit=20'),
    apiGet('/broadcasts?status=scheduled&page=1&limit=20'),
    apiGet('/audio?page=1&limit=20&public=true').catch(() => ({ data: [] })),
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
    apiGet(`/audio?search=${value}&public=true&page=1&limit=12`).catch(() => ({ data: [] })),
    apiGet(`/stations?search=${value}&page=1&limit=12`).catch(() => ({ data: [] })),
    apiGet(`/broadcasts?search=${value}&page=1&limit=12`).catch(() => ({ data: [] })),
  ]);

  return {
    audio: unwrapList(audioPayload).map(normalizeAudio).filter((item: EchooAudio) => item.id),
    stations: unwrapList(stationsPayload).map(normalizeStation).filter((item: EchooStation) => item.id),
    live: unwrapList(livePayload).map(normalizeBroadcast).filter((item: EchooBroadcast) => item.id),
  };
}

export { API_URL };
