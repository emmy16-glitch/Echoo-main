import { apiRequest } from './api.js';
import { normalizeStation } from './batch2Service.js';

const normalizeCreator = (user) => {
  if (!user) return null;

  const creatorProfile = user.creatorProfile || {};
  const id = user.id || user._id || null;

  return {
    ...user,
    id,
    _id: user._id || user.id || null,
    name:
      user.displayName ||
      creatorProfile.artistName ||
      creatorProfile.organizationName ||
      user.username ||
      'Echoo Creator',
    displayName:
      user.displayName ||
      creatorProfile.artistName ||
      creatorProfile.organizationName ||
      user.username ||
      'Echoo Creator',
    category: creatorProfile.category || 'Other',
    avatar: user.avatar || creatorProfile.organizationLogo || null,
    verified: Boolean(creatorProfile.isVerified),
  };
};

const followService = {
  getFollowingCreators: async () => {
    const response = await apiRequest('/follows/me/creators');
    const raw = Array.isArray(response?.data?.following)
      ? response.data.following
      : [];

    return {
      ...response,
      data: raw.map(normalizeCreator).filter(Boolean),
    };
  },

  getFollowingStations: async () => {
    const response = await apiRequest('/follows/me/stations');
    const raw = Array.isArray(response?.data?.stations)
      ? response.data.stations
      : [];

    return {
      ...response,
      data: raw.map(normalizeStation).filter(Boolean),
    };
  },

  followCreator: async (userId) => {
    return apiRequest(`/follows/users/${encodeURIComponent(userId)}`, {
      method: 'POST',
    });
  },

  unfollowCreator: async (userId) => {
    return apiRequest(`/follows/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  },

  getCreatorStatus: async (userId) => {
    const response = await apiRequest(
      `/follows/users/${encodeURIComponent(userId)}/status`
    );
    return response?.data || { isFollowing: false };
  },

  getCreatorCount: async (userId) => {
    const response = await apiRequest(
      `/follows/users/${encodeURIComponent(userId)}/count`
    );
    return response?.data || { followerCount: 0, followingCount: 0 };
  },

  followStation: async (stationId) => {
    return apiRequest(`/follows/stations/${encodeURIComponent(stationId)}`, {
      method: 'POST',
    });
  },

  unfollowStation: async (stationId) => {
    return apiRequest(`/follows/stations/${encodeURIComponent(stationId)}`, {
      method: 'DELETE',
    });
  },

  getStationStatus: async (stationId) => {
    const response = await apiRequest(
      `/follows/stations/${encodeURIComponent(stationId)}/status`
    );
    return response?.data || { isFollowing: false, followerCount: 0 };
  },

  normalizeCreator,
};

export default followService;
