import { apiRequest, buildMediaUrl } from './api.js';
import batch2Service, { normalizeStation as normalizeCanonicalStation } from './batch2Service.js';

const queryString = (values = {}) => {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const result = query.toString();
  return result ? `?${result}` : '';
};

const normalizeCreator = (creator) => {
  if (!creator) return null;
  return {
    ...creator,
    id: creator.id || creator._id || null,
    avatar: buildMediaUrl(creator.avatar) || null,
  };
};

const normalizeStation = (station) => normalizeCanonicalStation(station);

const normalizePlaylist = (playlist) => {
  if (!playlist) return null;
  return {
    ...playlist,
    id: playlist.id || playlist._id || null,
    coverArt: buildMediaUrl(playlist.coverArt) || null,
    owner: playlist.owner ? normalizeCreator(playlist.owner) : null,
  };
};

const normalizeProfile = (profile) => {
  if (!profile) return null;
  return {
    ...profile,
    id: profile.id || profile._id || null,
    avatar: buildMediaUrl(profile.avatar) || null,
    stations: Array.isArray(profile.stations)
      ? profile.stations.map(normalizeStation).filter(Boolean)
      : [],
  };
};

const resolveCanonicalStations = async (stations = []) => {
  const normalized = stations.map(normalizeStation).filter(Boolean);

  return Promise.all(
    normalized.map(async (station) => {
      if (!station?.id) return station;
      try {
        const response = await batch2Service.getStation(station.id);
        return response?.data || station;
      } catch {
        return station;
      }
    })
  );
};

export const batch1Service = {
  globalSearch: async (q, options = {}) => {
    const response = await apiRequest(
      `/search${queryString({
        q,
        type: options.type,
        category: options.category,
        page: options.page || 1,
        limit: options.limit || 20,
      })}`,
      { skipAuth: true, skipRefresh: true }
    );

    const data = response?.data || {};
    const results = data.results || {};
    const stations = await resolveCanonicalStations(
      Array.isArray(results.stations) ? results.stations : []
    );

    return {
      ...response,
      data: {
        ...data,
        results: {
          ...results,
          tracks: Array.isArray(results.tracks) ? results.tracks : [],
          creators: Array.isArray(results.creators)
            ? results.creators.map(normalizeCreator).filter(Boolean)
            : [],
          stations,
          playlists: Array.isArray(results.playlists)
            ? results.playlists.map(normalizePlaylist).filter(Boolean)
            : [],
        },
      },
    };
  },

  getSavedTracks: async (options = {}) =>
    apiRequest(
      `/library/tracks${queryString({
        page: options.page || 1,
        limit: options.limit || 50,
      })}`
    ),

  saveTrack: async (trackId) =>
    apiRequest(`/library/tracks/${encodeURIComponent(trackId)}/save`, {
      method: 'POST',
    }),

  unsaveTrack: async (trackId) =>
    apiRequest(`/library/tracks/${encodeURIComponent(trackId)}/save`, {
      method: 'DELETE',
    }),

  checkSaved: async (trackId) =>
    apiRequest(`/library/tracks/${encodeURIComponent(trackId)}/check`),

  getLibraryStats: async () => apiRequest('/library/stats'),

  getProfile: async (username) => {
    const response = await apiRequest(`/profile/${encodeURIComponent(username)}`, {
      skipAuth: true,
      skipRefresh: true,
    });
    return { ...response, data: normalizeProfile(response?.data) };
  },

  getMyProfile: async () => {
    const response = await apiRequest('/profile/me');
    return { ...response, data: normalizeProfile(response?.data) };
  },

  followCreator: async (userId) =>
    apiRequest(`/follows/${encodeURIComponent(userId)}/follow`, {
      method: 'POST',
    }),

  unfollowCreator: async (userId) =>
    apiRequest(`/follows/${encodeURIComponent(userId)}/follow`, {
      method: 'DELETE',
    }),

  getFollowStatus: async (userId) =>
    apiRequest(`/follows/${encodeURIComponent(userId)}/status`),

  getSettings: async () => apiRequest('/settings'),

  updateProfile: async (payload) =>
    apiRequest('/settings/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updatePreferences: async (payload) =>
    apiRequest('/settings/preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  normalizeCreator,
  normalizeStation,
  normalizePlaylist,
};

export default batch1Service;
