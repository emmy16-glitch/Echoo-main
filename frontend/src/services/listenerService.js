import {
  apiRequest,
  buildMediaUrl,
} from './api.js';

const normalizeTrack = (
  item
) => {
  if (!item) {
    return null;
  }

  const nestedTrack =
    item.track ||
    item.audio ||
    item.audioId ||
    null;

  const source =
    nestedTrack &&
    typeof nestedTrack ===
      'object'
      ? {
          ...nestedTrack,
          ...item,
        }
      : item;

  const id =
    source.id ||
    source._id ||
    source.trackId ||
    nestedTrack?.id ||
    nestedTrack?._id ||
    null;

  const artist =
    source.artist ||
    nestedTrack?.artist ||
    null;

  return {
    ...source,

    id,

    trackId:
      source.trackId ||
      id,

    title:
      source.title ||
      nestedTrack?.title ||
      'Untitled Audio',

    artistName:
      source.artistName ||
      nestedTrack
        ?.artistName ||
      (typeof artist ===
      'string'
        ? artist
        : artist?.displayName ||
          artist?.username) ||
      'Unknown Artist',

    fileUrl:
      buildMediaUrl(
        source.fileUrl ||
          nestedTrack?.fileUrl
      ),

    coverArt:
      buildMediaUrl(
        source.coverArt ||
          nestedTrack?.coverArt
      ),

    duration:
      Number(
        source.duration ||
          nestedTrack?.duration
      ) || 0,

    progress:
      Number(
        source.progress
      ) || 0,

    playedAt:
      source.playedAt ||
      source.updatedAt ||
      source.createdAt ||
      null,
  };
};

const normalizeArray = (
  value
) => {
  if (!value) {
    return [];
  }

  const list =
    Array.isArray(value)
      ? value
      : value.history ||
        value.items ||
        value.tracks ||
        value.continueListening ||
        value.results ||
        [];

  return list
    .map(normalizeTrack)
    .filter(Boolean);
};

const listenerService = {
  getDashboard:
    async () => {
      return apiRequest(
        '/listener/dashboard'
      );
    },

  getPlayerState:
    async () => {
      const response =
        await apiRequest(
          '/player/state'
        );

      return {
        ...response,
        data:
          response?.data ||
          null,
      };
    },

  getContinueListening:
    async () => {
      const response =
        await apiRequest(
          '/player/continue-listening'
        );

      return {
        ...response,

        data:
          normalizeArray(
            response?.data
          ),
      };
    },

  getHistory:
    async (
      page = 1,
      limit = 50
    ) => {
      const response =
        await apiRequest(
          `/history?page=${page}&limit=${limit}&type=all&sort=recent`
        );

      const raw =
        response?.data || {};

      const history =
        Array.isArray(
          raw.history
        )
          ? raw.history
              .map(
                (entry) => {
                  const track =
                    entry?.track &&
                    typeof entry.track ===
                      'object'
                      ? entry.track
                      : null;

                  if (!track) {
                    return null;
                  }

                  return normalizeTrack({
                    ...track,
                    playedAt:
                      entry.playedAt,
                    progress:
                      entry.progress,
                    completed:
                      entry.completed,
                    duration:
                      track.duration ||
                      entry.duration ||
                      0,
                    historyId:
                      entry.id,
                    id:
                      track.id ||
                      track._id,
                    trackId:
                      track.id ||
                      track._id,
                    track,
                  });
                }
              )
              .filter(Boolean)
          : [];

      return {
        ...response,

        data: {
          ...raw,
          history,
        },
      };
    },

  updateProgress:
    async ({
      trackId,
      progress,
      duration,
      completed = false,
    }) => {
      const elapsedSeconds = Math.max(0, Number(progress) || 0);
      const totalSeconds = Math.max(0, Number(duration) || 0);
      const progressPercent = completed
        ? 100
        : totalSeconds > 0
          ? Math.max(0, Math.min(100, (elapsedSeconds / totalSeconds) * 100))
          : 0;

      return apiRequest(
        '/player/progress',
        {
          method: 'POST',
          body:
            JSON.stringify({
              trackId,
              progress: progressPercent,
              duration: totalSeconds,
              completed:
                Boolean(completed),
            }),
        }
      );
    },

  addToContinueListening:
    async (trackId) => {
      return apiRequest(
        '/player/continue-listening',
        {
          method: 'POST',
          body:
            JSON.stringify({
              trackId,
            }),
        }
      );
    },

  removeFromContinueListening:
    async (trackId) => {
      return apiRequest(
        `/player/continue-listening/${trackId}`,
        {
          method: 'DELETE',
        }
      );
    },

  updatePreferences:
    async (
      preferences
    ) => {
      return apiRequest(
        '/player/preferences',
        {
          method: 'PATCH',
          body:
            JSON.stringify(
              preferences
            ),
        }
      );
    },

  normalizeTrack,
};

export default listenerService;
