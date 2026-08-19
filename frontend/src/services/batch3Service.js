import { apiRequest } from './api.js';
import batch2Service, {
  normalizeBroadcast,
  normalizeStation,
} from './batch2Service.js';
import {
  announceFinishedBroadcastRecording,
  discardBroadcastRecording,
  finishBroadcastRecording,
} from './broadcastRecordingService.js';

const sleep = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

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
    const stationBrand = station?.brandCover || station?.coverArt || station?.logo || null;
    const artwork = stationBrand || broadcast.coverArt || null;

    return {
      ...broadcast,
      station: station || broadcast.station,
      stationName:
        station?.name || broadcast.stationName || 'Echoo Station',
      category:
        station?.category || broadcast.category || 'Other',
      stationBranding: station?.branding || broadcast.stationBranding || null,
      // The current Station brand is authoritative for every listener surface.
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

const checkLiveKitReadiness = async () => {
  try {
    const health = await apiRequest('/health/livekit', {
      skipAuth: true,
      skipRefresh: true,
    });

    if (health?.reachable !== true) {
      throw new Error('LiveKit health check did not report ready.');
    }

    return health;
  } catch (error) {
    const readinessError = new Error(
      error?.message
        ? `Live audio service is not ready: ${error.message}`
        : 'Live audio service is not ready. Check the backend LiveKit configuration.'
    );
    readinessError.code = error?.code || 'LIVEKIT_NOT_READY';
    readinessError.status = error?.status || 503;
    readinessError.cause = error;
    throw readinessError;
  }
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

    const normalized = normalizeBroadcast(response?.data);
    let canonical = normalized;

    // Broadcast records can carry older copied artwork. Re-resolve the Station so
    // a creator's latest uploaded/generated Station brand is what listeners see.
    if (normalized?.stationId) {
      try {
        const stationResult = await batch2Service.getStation(normalized.stationId);
        const station = stationResult?.data || null;
        if (station?.id) {
          canonical = enrichBroadcasts([normalized], [station])[0] || normalized;
        }
      } catch {
        // The broadcast itself remains usable if Station metadata refresh fails.
      }
    }

    return {
      ...response,
      data: canonical,
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

  checkLiveKitReadiness,

  startBroadcast: async (broadcastId) => {
    // Fail before changing the broadcast lifecycle if this machine's backend
    // cannot actually reach/authenticate to LiveKit.
    await checkLiveKitReadiness();

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
    const path = `/broadcasts/${encodeURIComponent(broadcastId)}/confirm-live`;
    const maxAttempts = 7;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await apiRequest(path, { method: 'POST' });

        return {
          ...response,
          data: normalizeBroadcast(response?.data),
        };
      } catch (error) {
        const creatorPropagationDelay =
          error?.code === 'CREATOR_NOT_CONNECTED' ||
          (
            error?.status === 409 &&
            /creator.*not.*connected|has not connected/i.test(error?.message || '')
          );

        if (!creatorPropagationDelay || attempt === maxAttempts - 1) {
          throw error;
        }

        // LiveKit client connection can complete slightly before the server API
        // participant list reflects it. Give Cloud/WebRTC propagation a bounded
        // window rather than incorrectly cancelling a healthy publisher.
        await sleep(250 + attempt * 250);
      }
    }

    throw new Error('Echoo could not confirm the live publisher.');
  },

  cancelBroadcast: async (broadcastId) => {
    try {
      const response = await apiRequest(
        `/broadcasts/${encodeURIComponent(broadcastId)}/cancel`,
        { method: 'POST' }
      );

      return {
        ...response,
        data: normalizeBroadcast(response?.data),
      };
    } finally {
      // Cancelled/failed starts must never surface a save-recording prompt.
      await discardBroadcastRecording(broadcastId).catch(() => {});
    }
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
    const normalized = normalizeBroadcast(raw);

    // End the browser-local recorder only after the backend accepts the end
    // transition. The Blob remains in memory until the creator explicitly
    // chooses Discard, Save privately, or Save & publish.
    try {
      const recording = await finishBroadcastRecording(broadcastId);
      if (recording?.blob?.size) {
        announceFinishedBroadcastRecording({
          recording,
          broadcast: normalized,
        });
      }
    } catch (recordingError) {
      console.warn(
        '[Echoo Recording] could not finalize local recording:',
        recordingError?.message || recordingError
      );
    }

    return {
      ...response,
      data: normalized,
    };
  },

  normalizeStation,
  normalizeBroadcast,
};

export default batch3Service;
