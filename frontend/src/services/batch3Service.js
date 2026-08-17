import { apiRequest } from './api.js';
import batch2Service, {
  normalizeBroadcast,
  normalizeStation,
} from './batch2Service.js';

const uniqueById = (items) => {
  const seen = new Set();

  return items.filter((item) => {
    if (!item?.id) return false;
    const key = String(item.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const enrichBroadcasts = (broadcasts, stations) => {
  const stationMap = new Map(
    stations.map((station) => [String(station.id), station])
  );

  return broadcasts.map((broadcast) => {
    const station = stationMap.get(String(broadcast.stationId)) || null;
    const stationBrand = station?.logo || station?.coverArt || null;
    const artwork = stationBrand || broadcast.coverArt || null;

    return {
      ...broadcast,
      station: station || broadcast.station,
      stationName:
        station?.name || broadcast.stationName || 'Echoo Station',
      category:
        station?.category || broadcast.category || 'Other',
      // Station branding stays current everywhere; broadcast artwork is fallback only.
      coverArt: artwork,
      artwork,
      image: artwork,
      followers: station?.followerCount || 0,
    };
  });
};

const normalizeList = (response) => {
  const data = Array.isArray(response?.data) ? response.data : [];
  return data.map(normalizeBroadcast).filter(Boolean);
};

const batch3Service = {
  getStations: async () => {
    return batch2Service.listStations({ page: 1, limit: 100 });
  },

  getStation: async (stationId) => {
    return batch2Service.getStation(stationId);
  },

  getLiveBroadcastForStation: async (stationId) => {
    return batch2Service.getLiveBroadcast(stationId);
  },

  getUpcomingForStation: async (stationId) => {
    return batch2Service.getUpcomingBroadcasts(stationId);
  },

  getBroadcast: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}`
    );

    return {
      ...response,
      data: normalizeBroadcast(response?.data),
    };
  },

  getDiscovery: async () => {
    const [stationsResult, liveResult, scheduledResult] =
      await Promise.all([
        batch2Service.listStations({ page: 1, limit: 100 }),
        batch2Service.listBroadcasts({
          status: 'live',
          page: 1,
          limit: 100,
        }),
        batch2Service.listBroadcasts({
          status: 'scheduled',
          page: 1,
          limit: 100,
        }),
      ]);

    const stations = Array.isArray(stationsResult?.data)
      ? stationsResult.data
      : [];

    const live = enrichBroadcasts(
      Array.isArray(liveResult?.data) ? liveResult.data : [],
      stations
    );

    const scheduled = enrichBroadcasts(
      Array.isArray(scheduledResult?.data) ? scheduledResult.data : [],
      stations
    );

    scheduled.sort(
      (first, second) =>
        new Date(first.startTime || 0) - new Date(second.startTime || 0)
    );

    return {
      stations,
      live: uniqueById(live),
      scheduled: uniqueById(scheduled),
    };
  },

  getCreatorBroadcasts: async () => {
    const response = await apiRequest('/broadcasts/mine/all');

    return {
      ...response,
      data: normalizeList(response),
    };
  },

  startBroadcast: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/start`,
      { method: 'POST' }
    );

    const payload = response?.data || {};
    const raw = payload?.broadcast || payload;

    return {
      ...response,
      data: normalizeBroadcast(raw),
      livekit: {
        token: payload?.token || null,
        roomName:
          payload?.roomName || raw?.livekitRoomName || null,
        livekitUrl: payload?.livekitUrl || null,
        ingestUrl: payload?.ingestUrl || null,
        playbackUrls: payload?.playbackUrls || null,
        mediaMode: payload?.mediaMode || null,
        relayAvailable: Boolean(payload?.relayAvailable),
      },
    };
  },

  confirmBroadcastLive: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/confirm-live`,
      { method: 'POST' }
    );

    return {
      ...response,
      data: normalizeBroadcast(response?.data),
    };
  },

  cancelBroadcast: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/cancel`,
      { method: 'POST' }
    );

    return {
      ...response,
      data: normalizeBroadcast(response?.data),
    };
  },

  getLiveKitToken: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/livekit-token`,
      { method: 'POST' }
    );

    return response?.data || {};
  },

  getListenerLiveKitToken: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/listener-token`,
      { method: 'POST' }
    );

    return response?.data || {};
  },

  getPresence: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/presence`,
      {
        skipAuth: true,
        skipRefresh: true,
      }
    );

    return response?.data || {
      listenerCount: 0,
      peakListeners: 0,
      creatorConnected: false,
    };
  },

  endBroadcast: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/end`,
      { method: 'POST' }
    );

    const raw = response?.data?.broadcast || response?.data;

    return {
      ...response,
      data: normalizeBroadcast(raw),
    };
  },

  normalizeStation,
  normalizeBroadcast,
};

export default batch3Service;
