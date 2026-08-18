import { apiRequest, buildMediaUrl } from './api.js';
import batch2Service, { normalizeStation } from './batch2Service.js';

const normalizeCreator = (creator) => {
  if (!creator) return null;
  const profile = creator.creatorProfile || {};

  return {
    ...creator,
    id: creator.id || creator._id || null,
    avatar: buildMediaUrl(
      creator.avatar || profile.organizationLogo || null
    ),
    name:
      creator.displayName ||
      profile.artistName ||
      profile.organizationName ||
      creator.username ||
      'Echoo Creator',
    category: profile.category || creator.category || 'Creator',
    verified: Boolean(profile.isVerified || creator.verified),
  };
};

const loadFollowingCreators = async () => {
  // Backend route is /follows/me/creators. Using /me/following caused the
  // Following page to surface the API's generic "Route not found" message.
  const response = await apiRequest('/follows/me/creators');
  const raw = Array.isArray(response?.data?.following)
    ? response.data.following
    : Array.isArray(response?.data?.creators)
      ? response.data.creators
      : Array.isArray(response?.data)
        ? response.data
        : [];

  return {
    ...response,
    data: raw.map(normalizeCreator).filter(Boolean),
  };
};

const followService = {
  getCreatorStatus: async (creatorId) => {
    const response = await apiRequest(
      `/follows/users/${encodeURIComponent(creatorId)}/status`
    );
    return response?.data || { isFollowing: false, isFollowedBy: false };
  },

  followCreator: async (creatorId) => {
    const response = await apiRequest(
      `/follows/users/${encodeURIComponent(creatorId)}`,
      { method: 'POST' }
    );
    return response?.data || null;
  },

  unfollowCreator: async (creatorId) => {
    const response = await apiRequest(
      `/follows/users/${encodeURIComponent(creatorId)}`,
      { method: 'DELETE' }
    );
    return response?.data || null;
  },

  getFollowingCreators: loadFollowingCreators,
  getMyFollowingCreators: loadFollowingCreators,

  getStationStatus: async (stationId) => {
    const response = await apiRequest(
      `/follows/stations/${encodeURIComponent(stationId)}/status`
    );
    return response?.data || { isFollowing: false, followerCount: 0 };
  },

  followStation: async (stationId) => {
    const response = await apiRequest(
      `/follows/stations/${encodeURIComponent(stationId)}`,
      { method: 'POST' }
    );
    return response?.data || null;
  },

  unfollowStation: async (stationId) => {
    const response = await apiRequest(
      `/follows/stations/${encodeURIComponent(stationId)}`,
      { method: 'DELETE' }
    );
    return response?.data || null;
  },

  getFollowingStations: async () => {
    const response = await apiRequest('/follows/me/stations');
    const raw = Array.isArray(response?.data?.stations)
      ? response.data.stations.map(normalizeStation).filter(Boolean)
      : Array.isArray(response?.data)
        ? response.data.map(normalizeStation).filter(Boolean)
        : [];

    const canonical = await Promise.all(
      raw.map(async (station) => {
        if (!station?.id) return station;
        try {
          const current = await batch2Service.getStation(station.id);
          return current?.data || station;
        } catch {
          return station;
        }
      })
    );

    return {
      ...response,
      data: canonical.filter(Boolean),
    };
  },

  normalizeCreator,
};

export default followService;
