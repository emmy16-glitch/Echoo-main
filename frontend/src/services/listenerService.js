import {
  apiRequest,
  buildMediaUrl,
} from './api.js';
import { buildGeneratedAudioCoverUrl } from '../audioCover/audioCover.js';

const normalizeTrack = (item) => {
  if (!item) return null;

  const nestedTrack = item.track || item.audio || item.audioId || null;
  const source = nestedTrack && typeof nestedTrack === 'object'
    ? { ...nestedTrack, ...item }
    : item;

  const id =
    source.id ||
    source._id ||
    source.trackId ||
    nestedTrack?.id ||
    nestedTrack?._id ||
    null;

  const artist = source.artist || nestedTrack?.artist || null;
  const artistName =
    source.artistName ||
    nestedTrack?.artistName ||
    (typeof artist === 'string'
      ? artist
      : artist?.displayName ||
        artist?.username ||
        artist?.creatorProfile?.artistName ||
        artist?.creatorProfile?.organizationName) ||
    'Echoo Creator';

  const normalized = {
    ...source,
    id,
    trackId: source.trackId || id,
    title: source.title || nestedTrack?.title || 'Untitled Audio',
    artistName,
    fileUrl: buildMediaUrl(source.fileUrl || nestedTrack?.fileUrl),
    duration: Number(source.duration || nestedTrack?.duration) || 0,
    genre: source.genre || nestedTrack?.genre || 'Other',
    coverArtMode: source.coverArtMode || nestedTrack?.coverArtMode || null,
    coverArtVariant: source.coverArtVariant ?? nestedTrack?.coverArtVariant,
    progress: Number(source.progress) || 0,
    playedAt: source.playedAt || source.updatedAt || source.createdAt || null,
  };

  normalized.coverArt =
    buildMediaUrl(source.coverArt || nestedTrack?.coverArt) ||
    buildGeneratedAudioCoverUrl(normalized);

  return normalized;
};

const normalizeArray = (value) => {
  if (!value) return [];
  const list = Array.isArray(value)
    ? value
    : value.history ||
      value.items ||
      value.tracks ||
      value.continueListening ||
      value.results ||
      [];

  return list.map(normalizeTrack).filter(Boolean);
};

const normalizeDashboard = (data = {}) => ({
  ...data,
  continueListening: normalizeArray(data.continueListening),
  recommendedTracks: normalizeArray(data.recommendedTracks),
  recentActivity: Array.isArray(data.recentActivity)
    ? data.recentActivity.map((entry) => {
        const track = normalizeTrack(entry?.track ? { ...entry.track, ...entry } : entry);
        return track ? { ...entry, track, ...track } : null;
      }).filter(Boolean)
    : [],
});

const listenerService = {
  getDashboard: async () => {
    const response = await apiRequest('/listener/dashboard', { cache: 'no-store' });
    return {
      ...response,
      data: normalizeDashboard(response?.data || {}),
    };
  },

  getPlayerState: async () => {
    const response = await apiRequest('/player/state');
    return { ...response, data: response?.data || null };
  },

  getContinueListening: async () => {
    const response = await apiRequest('/player/continue-listening');
    return { ...response, data: normalizeArray(response?.data) };
  },

  getHistory: async (page = 1, limit = 50) => {
    const response = await apiRequest(
      `/history?page=${page}&limit=${limit}&type=all&sort=recent`
    );

    const raw = response?.data || {};
    const history = Array.isArray(raw.history)
      ? raw.history
          .map((entry) => {
            const track = entry?.track && typeof entry.track === 'object'
              ? entry.track
              : null;
            if (!track) return null;

            return normalizeTrack({
              ...track,
              playedAt: entry.playedAt,
              progress: entry.progress,
              completed: entry.completed,
              duration: track.duration || entry.duration || 0,
              historyId: entry.id,
              id: track.id || track._id,
              trackId: track.id || track._id,
              track,
            });
          })
          .filter(Boolean)
      : [];

    return { ...response, data: { ...raw, history } };
  },

  updateProgress: async ({ trackId, progress, duration, completed = false }) => {
    const elapsedSeconds = Math.max(0, Number(progress) || 0);
    const totalSeconds = Math.max(0, Number(duration) || 0);
    const progressPercent = completed
      ? 100
      : totalSeconds > 0
        ? Math.max(0, Math.min(100, (elapsedSeconds / totalSeconds) * 100))
        : 0;

    return apiRequest('/player/progress', {
      method: 'POST',
      body: JSON.stringify({
        trackId,
        progress: progressPercent,
        duration: totalSeconds,
        completed: Boolean(completed),
      }),
    });
  },

  addToContinueListening: async (trackId) =>
    apiRequest('/player/continue-listening', {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    }),

  removeFromContinueListening: async (trackId) =>
    apiRequest(`/player/continue-listening/${trackId}`, { method: 'DELETE' }),

  updatePreferences: async (preferences) =>
    apiRequest('/player/preferences', {
      method: 'PATCH',
      body: JSON.stringify(preferences),
    }),

  normalizeTrack,
};

export default listenerService;
