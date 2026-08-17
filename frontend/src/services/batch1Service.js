import {
  apiRequest,
  buildMediaUrl,
} from "./api.js";

const queryString = (
  values = {}
) => {
  const query =
    new URLSearchParams();

  Object.entries(
    values
  ).forEach(
    ([key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return;
      }

      query.set(
        key,
        String(value)
      );
    }
  );

  const result =
    query.toString();

  return result
    ? `?${result}`
    : "";
};

const normalizeCreator = (
  creator
) => {
  if (!creator) {
    return null;
  }

  return {
    ...creator,
    id:
      creator.id ||
      creator._id ||
      null,
    avatar:
      buildMediaUrl(
        creator.avatar
      ) ||
      null,
  };
};

const normalizePlaylist = (
  playlist
) => {
  if (!playlist) {
    return null;
  }

  return {
    ...playlist,
    id:
      playlist.id ||
      playlist._id ||
      null,
    coverArt:
      buildMediaUrl(
        playlist.coverArt
      ) ||
      null,
    owner:
      playlist.owner
        ? normalizeCreator(
            playlist.owner
          )
        : null,
  };
};

const normalizeProfile = (
  profile
) => {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    id:
      profile.id ||
      profile._id ||
      null,
    avatar:
      buildMediaUrl(
        profile.avatar
      ) ||
      null,
    stations:
      Array.isArray(
        profile.stations
      )
        ? profile.stations.map(
            (station) => ({
              ...station,
              id:
                station.id ||
                station._id ||
                null,
              coverArt:
                buildMediaUrl(
                  station.coverArt
                ) ||
                null,
            })
          )
        : [],
  };
};

export const batch1Service = {
  globalSearch: async (
    q,
    options = {}
  ) => {
    const response =
      await apiRequest(
        `/search${queryString({
          q,
          type:
            options.type,
          category:
            options.category,
          page:
            options.page || 1,
          limit:
            options.limit || 20,
        })}`,
        {
          skipAuth: true,
          skipRefresh: true,
        }
      );

    const data =
      response?.data || {};

    const results =
      data.results || {};

    return {
      ...response,
      data: {
        ...data,
        results: {
          ...results,
          tracks:
            Array.isArray(
              results.tracks
            )
              ? results.tracks
              : [],
          creators:
            Array.isArray(
              results.creators
            )
              ? results.creators
                  .map(
                    normalizeCreator
                  )
                  .filter(Boolean)
              : [],
          playlists:
            Array.isArray(
              results.playlists
            )
              ? results.playlists
                  .map(
                    normalizePlaylist
                  )
                  .filter(Boolean)
              : [],
        },
      },
    };
  },

  getSavedTracks: async (
    options = {}
  ) => {
    return apiRequest(
      `/library/tracks${queryString({
        page:
          options.page || 1,
        limit:
          options.limit || 50,
      })}`
    );
  },

  saveTrack: async (
    trackId
  ) => {
    return apiRequest(
      `/library/tracks/${encodeURIComponent(
        trackId
      )}/save`,
      {
        method: "POST",
      }
    );
  },

  unsaveTrack: async (
    trackId
  ) => {
    return apiRequest(
      `/library/tracks/${encodeURIComponent(
        trackId
      )}/save`,
      {
        method: "DELETE",
      }
    );
  },

  checkSaved: async (
    trackId
  ) => {
    return apiRequest(
      `/library/tracks/${encodeURIComponent(
        trackId
      )}/check`
    );
  },

  getLibraryStats:
    async () => {
      return apiRequest(
        "/library/stats"
      );
    },

  getProfile: async (
    username
  ) => {
    const response =
      await apiRequest(
        `/profile/${encodeURIComponent(
          username
        )}`,
        {
          skipAuth: true,
          skipRefresh: true,
        }
      );

    return {
      ...response,
      data:
        normalizeProfile(
          response?.data
        ),
    };
  },

  getMyProfile:
    async () => {
      const response =
        await apiRequest(
          "/profile/me"
        );

      return {
        ...response,
        data:
          normalizeProfile(
            response?.data
          ),
      };
    },

  followCreator: async (
    userId
  ) => {
    return apiRequest(
      `/follows/${encodeURIComponent(
        userId
      )}/follow`,
      {
        method: "POST",
      }
    );
  },

  unfollowCreator: async (
    userId
  ) => {
    return apiRequest(
      `/follows/${encodeURIComponent(
        userId
      )}/follow`,
      {
        method: "DELETE",
      }
    );
  },

  getFollowStatus: async (
    userId
  ) => {
    return apiRequest(
      `/follows/${encodeURIComponent(
        userId
      )}/status`
    );
  },

  getSettings:
    async () => {
      return apiRequest(
        "/settings"
      );
    },

  updateProfile: async (
    payload
  ) => {
    return apiRequest(
      "/settings/profile",
      {
        method: "PATCH",
        body:
          JSON.stringify(
            payload
          ),
      }
    );
  },

  updatePreferences: async (
    payload
  ) => {
    return apiRequest(
      "/settings/preferences",
      {
        method: "PATCH",
        body:
          JSON.stringify(
            payload
          ),
      }
    );
  },
};

export default batch1Service;
