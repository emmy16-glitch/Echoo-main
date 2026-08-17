import {
  apiRequest,
} from "./api.js";

const query = (
  values = {}
) => {
  const params =
    new URLSearchParams();

  Object.entries(
    values
  ).forEach(
    ([
      key,
      value,
    ]) => {
      if (
        value ===
          undefined ||
        value ===
          null ||
        value ===
          ""
      ) {
        return;
      }

      params.set(
        key,
        String(value)
      );
    }
  );

  const string =
    params.toString();

  return string
    ? `?${string}`
    : "";
};

const normalizeBackendDownload =
  (
    item
  ) => {
    if (!item) {
      return null;
    }

    const track =
      item.track ||
      item.trackId ||
      null;

    return {
      ...item,

      id:
        item.id ||
        item._id ||
        null,

      track:
        track &&
        typeof track ===
          "object"
          ? {
              ...track,

              id:
                track.id ||
                track._id ||
                null,
            }
          : null,

      trackId:
        (
          track &&
          typeof track ===
            "object"
            ? (
                track.id ||
                track._id
              )
            : track
        ) ||
        item.trackId ||
        null,

      progress:
        Number(
          item.progress
        ) || 0,

      fileSize:
        Number(
          item.fileSize
        ) || 0,

      downloadedSize:
        Number(
          item.downloadedSize
        ) || 0,

      status:
        item.status ||
        "pending",
    };
  };

const batch6Service = {
  getAnalyticsOverview:
    async (
      period = "30d"
    ) => {
      return apiRequest(
        `/analytics/overview${query({
          period,
        })}`
      );
    },

  getContentAnalytics:
    async (
      period = "30d"
    ) => {
      return apiRequest(
        `/analytics/content${query({
          period,
        })}`
      );
    },

  getTrustedAnalytics:
    async (
      period = "30d"
    ) => {
      const [
        overviewResult,
        contentResult,
      ] =
        await Promise.all([
          batch6Service
            .getAnalyticsOverview(
              period
            ),

          batch6Service
            .getContentAnalytics(
              period
            ),
        ]);

      const overview =
        overviewResult
          ?.data
          ?.overview ||
        {};

      const content =
        contentResult?.data ||
        {};

      const summary =
        content.summary ||
        {};

      return {
        period,

        overview,

        summary,

        topTracks:
          Array.isArray(
            content.topTracks
          )
            ? content.topTracks
            : [],

        recentBroadcasts:
          Array.isArray(
            content.recentBroadcasts
          )
            ? content.recentBroadcasts
            : [],

        contentByType:
          content.contentByType ||
          {},

        legacyAnalytics: {
          summary: {
            totalTracks:
              Number(
                summary.totalTracks ??
                overview.totalTracks
              ) || 0,

            totalPlays:
              Number(
                summary.totalPlays ??
                overview.totalPlays
              ) || 0,

            totalLikes:
              Number(
                summary.totalLikes
              ) || 0,

            averagePlays:
              Number(
                summary.avgPlays
              ) || 0,

            avgPlays:
              Number(
                summary.avgPlays
              ) || 0,

            followers:
              Number(
                overview.totalFollowers
              ) || 0,

            totalFollowers:
              Number(
                overview.totalFollowers
              ) || 0,

            avgListeners:
              Number(
                overview.avgListeners
              ) || 0,

            peakListeners:
              Number(
                overview.peakListeners
              ) || 0,

            engagementRate:
              Number(
                overview.engagementRate
              ) || 0,
          },

          tracks:
            Array.isArray(
              content.topTracks
            )
              ? content.topTracks
              : [],

          recentBroadcasts:
            Array.isArray(
              content.recentBroadcasts
            )
              ? content.recentBroadcasts
              : [],
        },
      };
    },

  getHistory: async (
    options = {}
  ) => {
    return apiRequest(
      `/history${query({
        page:
          options.page ||
          1,

        limit:
          options.limit ||
          100,

        type:
          options.type ||
          "all",

        startDate:
          options.startDate,

        endDate:
          options.endDate,

        sort:
          options.sort ||
          "recent",
      })}`
    );
  },

  getHistoryStats:
    async () => {
      return apiRequest(
        "/history/stats"
      );
    },

  removeHistoryItem:
    async (
      historyId
    ) => {
      return apiRequest(
        `/history/${encodeURIComponent(
          historyId
        )}`,
        {
          method:
            "DELETE",
        }
      );
    },

  clearHistory:
    async () => {
      return apiRequest(
        "/history/clear",
        {
          method:
            "DELETE",
        }
      );
    },

  getDownloads: async (
    options = {}
  ) => {
    const response =
      await apiRequest(
        `/downloads${query({
          page:
            options.page ||
            1,

          limit:
            options.limit ||
            100,

          status:
            options.status,
        })}`
      );

    const raw =
      response?.data
        ?.downloads;

    return {
      ...response,

      data: {
        ...(
          response?.data ||
          {}
        ),

        downloads:
          Array.isArray(
            raw
          )
            ? raw
                .map(
                  normalizeBackendDownload
                )
                .filter(Boolean)
            : [],
      },
    };
  },

  getDownloadStats:
    async () => {
      return apiRequest(
        "/downloads/stats"
      );
    },

  requestDownload:
    async (
      trackId,
      quality = "medium"
    ) => {
      return apiRequest(
        "/downloads",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              trackId,
              quality,
            }),
        }
      );
    },

  updateDownloadProgress:
    async (
      downloadId,
      data
    ) => {
      return apiRequest(
        `/downloads/${encodeURIComponent(
          downloadId
        )}/progress`,
        {
          method:
            "PATCH",

          body:
            JSON.stringify(
              data
            ),
        }
      );
    },

  deleteDownload:
    async (
      downloadId
    ) => {
      return apiRequest(
        `/downloads/${encodeURIComponent(
          downloadId
        )}`,
        {
          method:
            "DELETE",
        }
      );
    },

  normalizeBackendDownload,
};

export default batch6Service;
