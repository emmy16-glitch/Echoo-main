import { apiRequest, buildMediaUrl } from './api.js';

const normalizeTrack = (track) => {
  if (!track) return null;
  const artist = typeof track.artist === 'object' ? track.artist : null;
  return {
    ...track,
    id: track.id || track._id || null,
    title: track.title || 'Untitled Audio',
    artistName:
      artist?.displayName ||
      artist?.username ||
      track.artistName ||
      'Echoo Creator',
    coverArt: buildMediaUrl(track.coverArt || null),
    fileUrl: buildMediaUrl(track.fileUrl || null),
  };
};

const normalizeCreator = (creator) => {
  if (!creator) return null;
  const profile = creator.creatorProfile || {};
  return {
    ...creator,
    id: creator.id || creator._id || null,
    name:
      creator.displayName ||
      profile.artistName ||
      profile.organizationName ||
      creator.username ||
      'Echoo Creator',
    avatar: buildMediaUrl(creator.avatar || profile.organizationLogo || null),
    category: profile.category || 'Creator',
  };
};

const normalizeStation = (station) => {
  if (!station) return null;
  return {
    ...station,
    id: station.id || station._id || null,
    coverArt: buildMediaUrl(station.coverArt || null),
  };
};

const normalizePlaylist = (playlist) => {
  if (!playlist) return null;
  return {
    ...playlist,
    id: playlist.id || playlist._id || null,
    coverArt: buildMediaUrl(playlist.coverArt || null),
  };
};

const searchService = {
  search: async (query, { type = 'all', limit = 20, genre = '' } = {}) => {
    const params = new URLSearchParams({
      q: query,
      type,
      limit: String(limit),
    });
    if (genre) params.set('genre', genre);

    const response = await apiRequest(`/search?${params.toString()}`, {
      skipAuth: true,
      skipRefresh: true,
    });

    const results = response?.data?.results || {};
    return {
      ...response,
      data: {
        ...response?.data,
        results: {
          tracks: Array.isArray(results.tracks)
            ? results.tracks.map(normalizeTrack).filter(Boolean)
            : [],
          creators: Array.isArray(results.creators)
            ? results.creators.map(normalizeCreator).filter(Boolean)
            : [],
          stations: Array.isArray(results.stations)
            ? results.stations.map(normalizeStation).filter(Boolean)
            : [],
          playlists: Array.isArray(results.playlists)
            ? results.playlists.map(normalizePlaylist).filter(Boolean)
            : [],
        },
      },
    };
  },

  saveQuery: async (query) =>
    apiRequest('/search/history', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  history: async () => apiRequest('/search/history'),

  clearHistory: async () =>
    apiRequest('/search/history', { method: 'DELETE' }),
};

export default searchService;
