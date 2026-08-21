import { apiRequest, buildMediaUrl } from './api.js';
import { buildGeneratedAudioCoverUrl } from '../audioCover/audioCover.js';

const normalizeTrack = (entry) => {
  if (!entry) return null;

  const track =
    entry.trackId && typeof entry.trackId === 'object'
      ? entry.trackId
      : entry.track && typeof entry.track === 'object'
        ? entry.track
        : entry;

  if (!track || track.isDeleted || track.isPublic === false) return null;

  const artist = track.artist || null;

  return {
    ...track,
    id:
      track.id ||
      track._id ||
      (typeof entry.trackId === 'string' ? entry.trackId : null) ||
      null,
    title: track.title || 'Untitled Audio',
    artistName:
      track.artistName ||
      (typeof artist === 'string'
        ? artist
        : artist?.displayName || artist?.username) ||
      'Echoo Creator',
    fileUrl: buildMediaUrl(track.fileUrl || null),
    coverArt:
      buildMediaUrl(track.coverArt || null) ||
      buildGeneratedAudioCoverUrl({
        ...track,
        artistName:
          track.artistName ||
          (typeof artist === 'string' ? artist : artist?.displayName || artist?.username) ||
          'Echoo Creator',
      }),
    duration: Number(track.duration) || 0,
    genre: track.genre || 'Audio',
  };
};

const normalizePlaylist = (playlist) => {
  if (!playlist) return null;

  const owner = playlist.owner;
  const ownerName =
    typeof owner === 'string'
      ? 'Echoo User'
      : owner?.displayName || owner?.username || 'Echoo User';
  const tracks = Array.isArray(playlist.tracks)
    ? playlist.tracks.map(normalizeTrack).filter(Boolean)
    : [];

  return {
    ...playlist,
    id: playlist.id || playlist._id || null,
    name: playlist.name || 'Untitled Playlist',
    description: playlist.description || '',
    ownerId:
      typeof owner === 'string' ? owner : owner?._id || owner?.id || null,
    ownerName,
    coverArt:
      buildMediaUrl(playlist.coverArt || null) ||
      tracks[0]?.coverArt ||
      buildGeneratedAudioCoverUrl({
        title: playlist.name || 'Echoo Playlist',
        artistName: ownerName,
        genre: 'Playlist',
      }),
    tracks,
    trackCount: tracks.length,
    isPublic: Boolean(playlist.isPublic),
    isCollaborative: Boolean(playlist.isCollaborative),
  };
};

const normalizeList = (response) =>
  (Array.isArray(response?.data) ? response.data : [])
    .map(normalizePlaylist)
    .filter(Boolean);

const playlistService = {
  getAll: async ({ page = 1, limit = 50, search = '' } = {}) => {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search.trim()) query.set('search', search.trim());

    const response = await apiRequest(`/playlists?${query.toString()}`, {
      skipAuth: true,
      skipRefresh: true,
    });

    return { ...response, data: normalizeList(response) };
  },

  getMine: async () => {
    const response = await apiRequest('/playlists/mine/all');
    return { ...response, data: normalizeList(response) };
  },

  getById: async (id) => {
    const response = await apiRequest(`/playlists/${encodeURIComponent(id)}`);
    return { ...response, data: normalizePlaylist(response?.data) };
  },

  create: async ({
    name,
    description = '',
    isPublic = false,
    isCollaborative = false,
  }) => {
    const response = await apiRequest('/playlists', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        isPublic,
        isCollaborative,
      }),
    });

    return { ...response, data: normalizePlaylist(response?.data) };
  },

  update: async (id, data) => {
    const response = await apiRequest(`/playlists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return { ...response, data: normalizePlaylist(response?.data) };
  },

  delete: async (id) =>
    apiRequest(`/playlists/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  addTrack: async (playlistId, trackId) => {
    const response = await apiRequest(
      `/playlists/${encodeURIComponent(playlistId)}/tracks`,
      {
        method: 'POST',
        body: JSON.stringify({ trackId }),
      }
    );
    return { ...response, data: normalizePlaylist(response?.data) };
  },

  removeTrack: async (playlistId, trackId) => {
    const response = await apiRequest(
      `/playlists/${encodeURIComponent(playlistId)}/tracks`,
      {
        method: 'DELETE',
        body: JSON.stringify({ trackId }),
      }
    );
    return { ...response, data: normalizePlaylist(response?.data) };
  },

  reorder: async (playlistId, trackIds) =>
    apiRequest(`/playlists/${encodeURIComponent(playlistId)}/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ trackIds }),
    }),

  normalizePlaylist,
  normalizeTrack,
};

export default playlistService;
