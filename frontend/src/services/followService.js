import { apiRequest, buildMediaUrl } from './api.js';
import { normalizeStation } from './batch2Service.js';

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

// Refresh both Following surfaces after a confirmed relationship change.
const announceFollowingChanged = (type, id, following) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('echoo:following-changed', {
    detail: { type, id: String(id), following },
  }));
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

  // Real follower/following totals from the existing
  // GET /follows/users/:userId/count endpoint.
  getCreatorCount: async (creatorId) => {
    const response = await apiRequest(
      `/follows/users/${encodeURIComponent(creatorId)}/count`
    );
    return response?.data || { followerCount: 0, followingCount: 0 };
  },

  followCreator: async (creatorId) => {
    const response = await apiRequest(
      `/follows/users/${encodeURIComponent(creatorId)}`,
      { method: 'POST' }
    );
    announceFollowingChanged('creator', creatorId, true);
    return response?.data || null;
  },

  unfollowCreator: async (creatorId) => {
    const response = await apiRequest(
      `/follows/users/${encodeURIComponent(creatorId)}`,
      { method: 'DELETE' }
    );
    announceFollowingChanged('creator', creatorId, false);
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
    announceFollowingChanged('station', stationId, true);
    return response?.data || null;
  },

  unfollowStation: async (stationId) => {
    const response = await apiRequest(
      `/follows/stations/${encodeURIComponent(stationId)}`,
      { method: 'DELETE' }
    );
    announceFollowingChanged('station', stationId, false);
    return response?.data || null;
  },

  getFollowingStations: async () => {
    const response = await apiRequest('/follows/me/stations');
    const raw = Array.isArray(response?.data?.stations)
      ? response.data.stations.map(normalizeStation).filter(Boolean)
      : Array.isArray(response?.data)
        ? response.data.map(normalizeStation).filter(Boolean)
        : [];

    // The authenticated follow endpoint already returns the current, populated
    // Channel. Avoid one more request per followed Channel, which delays the
    // Following panel and leaves it apparently empty on slow connections.
    return {
      ...response,
      data: raw,
    };
  },

  normalizeCreator,
};

export default followService;
