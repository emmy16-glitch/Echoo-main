import { apiRequest, buildMediaUrl } from './api.js';

const normalizeTrack = (track) => {
  if (!track) return null;
  return {
    ...track,
    id: track.id || track._id || null,
    fileUrl: buildMediaUrl(track.fileUrl || null),
    coverArt: buildMediaUrl(track.coverArt || null),
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

const normalizeBroadcast = (broadcast) => {
  if (!broadcast) return null;
  const station = typeof broadcast.station === 'object' ? broadcast.station : null;
  return {
    ...broadcast,
    id: broadcast.id || broadcast._id || null,
    stationId: station?.id || station?._id || broadcast.station || null,
    stationName: station?.name || 'Echoo Station',
    coverArt: buildMediaUrl(broadcast.coverArt || station?.coverArt || null),
  };
};

const normalizeProfile = (profile) => {
  if (!profile) return null;

  return {
    ...profile,
    id: profile.id || profile._id || null,
    avatar: buildMediaUrl(
      profile.avatar || profile.creatorProfile?.organizationLogo || null
    ),
    content: Array.isArray(profile.content)
      ? profile.content.map(normalizeTrack).filter(Boolean)
      : [],
    stations: Array.isArray(profile.stations)
      ? profile.stations.map(normalizeStation).filter(Boolean)
      : [],
    liveBroadcast: normalizeBroadcast(profile.liveBroadcast),
    recentBroadcasts: Array.isArray(profile.recentBroadcasts)
      ? profile.recentBroadcasts.map(normalizeBroadcast).filter(Boolean)
      : [],
  };
};

const profileService = {
  getProfile: async (identifier) => {
    const response = await apiRequest(
      `/profile/${encodeURIComponent(identifier)}`,
      {
        skipAuth: true,
        skipRefresh: true,
      }
    );

    return {
      ...response,
      data: normalizeProfile(response?.data),
    };
  },

  getMine: async () => {
    const response = await apiRequest('/profile/me');
    return {
      ...response,
      data: normalizeProfile(response?.data),
    };
  },

  normalizeProfile,
};

export default profileService;
