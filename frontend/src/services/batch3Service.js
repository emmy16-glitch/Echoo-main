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

const PENDING_RECORDING_DECISION_KEY = '__echooPendingBroadcastRecording';

const rememberPendingRecordingDecision = (detail) => {
  if (typeof window === 'undefined' || !detail?.recording?.blob?.size) return;
  window[PENDING_RECORDING_DECISION_KEY] = detail;
};

const forgetPendingRecordingDecision = () => {
  if (typeof window === 'undefined') return;
  try {
    delete window[PENDING_RECORDING_DECISION_KEY];
  } catch {
    window[PENDING_RECORDING_DECISION_KEY] = null;
  }
};

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
    const eventArtwork = broadcast.coverArt || broadcast.artwork || broadcast.image || null;
    const artwork = stationBrand || broadcast.coverArt || null;

    return {
      ...broadcast,
      eventArtwork,
      station: station || broadcast.station,
      stationName:
        station?.name || broadcast.stationName || 'Echoo Station',
      category:
        station?.category || broadcast.category || 'Other',
      stationBranding: station?.branding || broadcast.stationBranding || null,
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

const prioritizeRequestedCreatorBroadcast = (broadcasts) => {
  if (typeof sessionStorage === 'undefined') return broadcasts;
  const requestedId =
    sessionStorage.getItem('echooProcessingBroadcastId') ||
    sessionStorage.getItem('echooPreparedBroadcastId') ||
    '';
  if (!requestedId) return broadcasts;

  const index = broadcasts.findIndex((item) => String(item?.id || '') === String(requestedId));
  if (index <= 0) return broadcasts;
  const ordered = [...broadcasts];
  const [requested] = ordered.splice(index, 1);
  ordered.unshift(requested);
  return ordered;
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
        batch2Service.listStations({ page: 1, limit: 100, cache: 'no-store' }),
        batch2Service.listBroadcasts({
          status: 'live',
          page: 1,
          limit: 100,
          cache: 'no-store',
        }),
        batch2Service.listBroadcasts({
          status: 'scheduled',
          page: 1,
          limit: 100,
          cache: 'no-store',
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
      data: prioritizeRequestedCreatorBroadcast(normalizeList(response)),
    };
  },

  checkLiveKitReadiness,

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
      await discardBroadcastRecording(broadcastId).catch(() => {});
      forgetPendingRecordingDecision();
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

  getLiveAnalytics: async (broadcastId) =>
    apiRequest(`/analytics/live/${encodeURIComponent(broadcastId)}`),

  // Realtime lifecycle only. Recording finalization deliberately happens
  // afterwards so endpoint latency never keeps listeners connected.
  endBroadcastRealtime: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/end`,
      { method: 'POST' }
    );

    const raw = response?.data?.broadcast || response?.data;
    const normalized = normalizeBroadcast(raw);
    return {
      ...response,
      data: normalized,
    };
  },

  // Called after local LiveKit publication has stopped. The mixer program
  // stays alive while its recorder flushes, preserving the completed take.
  finalizeBroadcastRecording: async (broadcastId, broadcast = null) => {
    try {
      const recording = await finishBroadcastRecording(broadcastId);
      if (!recording?.blob?.size) return { recordingReady: false, recording: null };
      const decision = { recording, broadcast: broadcast || null };
      rememberPendingRecordingDecision(decision);
      announceFinishedBroadcastRecording(decision);
      return { recordingReady: true, recording };
    } catch (recordingError) {
      console.warn('[Echoo Recording] could not finalize local recording:', recordingError?.message || recordingError);
      return { recordingReady: false, recording: null, error: recordingError };
    }
  },

  getProcessing: async (broadcastId) =>
    apiRequest(`/broadcasts/${encodeURIComponent(broadcastId)}/processing`),

  updateAssetVisibility: async (broadcastId, values) =>
    apiRequest(`/broadcasts/${encodeURIComponent(broadcastId)}/asset-visibility`, {
      method: 'PATCH',
      body: JSON.stringify(values),
    }),

  publishReplay: async (broadcastId, visibility) =>
    apiRequest(`/broadcasts/${encodeURIComponent(broadcastId)}/publish-replay`, {
      method: 'POST',
      body: JSON.stringify({ visibility }),
    }),

  beginTranscriptReview: async (broadcastId) =>
    apiRequest(`/broadcasts/${encodeURIComponent(broadcastId)}/transcript/review`, {
      method: 'POST',
    }),

  publishTranscript: async (broadcastId, visibility) =>
    apiRequest(`/broadcasts/${encodeURIComponent(broadcastId)}/transcript/publish`, {
      method: 'POST',
      body: JSON.stringify({ visibility }),
    }),

  pauseBroadcast: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/pause`,
      { method: 'POST' }
    );
    return { ...response, data: normalizeBroadcast(response?.data) };
  },

  resumeBroadcast: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/resume`,
      { method: 'POST' }
    );
    return { ...response, data: normalizeBroadcast(response?.data) };
  },

  normalizeStation,
  normalizeBroadcast,
};

export default batch3Service;
