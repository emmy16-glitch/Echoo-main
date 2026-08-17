import {
  apiRequest,
} from "./api.js";

import {
  getMockMediaForKey,
} from "./mockMediaService.js";

const queryString = (
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

  const result =
    params.toString();

  return result
    ? `?${result}`
    : "";
};

const readStoredUser =
  () => {
    try {
      return JSON.parse(
        localStorage.getItem(
          "user"
        ) || "{}"
      );
    } catch {
      return {};
    }
  };

const normalizeId = (
  value
) => {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  return (
    value.id ||
    value._id ||
    null
  );
};

const normalizeOwner = (
  owner
) => {
  if (!owner) {
    return {
      id: null,
      username: "",
      displayName: "",
      avatar: null,
    };
  }

  if (
    typeof owner ===
    "string"
  ) {
    return {
      id: owner,
      username: "",
      displayName: "",
      avatar: null,
    };
  }

  return {
    ...owner,

    id:
      owner.id ||
      owner._id ||
      null,

    username:
      owner.username ||
      "",

    displayName:
      owner.displayName ||
      owner.fullname ||
      owner.username ||
      "",

    avatar:
      owner.avatar ||
      owner.profileImage ||
      null,
  };
};

export const normalizeStation = (
  station
) => {
  if (!station) {
    return null;
  }

  const id =
    station.id ||
    station._id ||
    station.slug ||
    station.name;

  const owner =
    normalizeOwner(
      station.owner
    );

  const coverArt =
    station.coverArt ||
    station.artwork ||
    station.image ||
    getMockMediaForKey(
      id ||
        station.name,
      "stations"
    );

  return {
    ...station,

    id,

    _id:
      station._id ||
      station.id ||
      null,

    owner,

    ownerId:
      owner.id,

    ownerName:
      owner.displayName ||
      owner.username ||
      "Echoo Creator",

    creatorId:
      owner.id,

    creatorName:
      owner.displayName ||
      owner.username ||
      "Echoo Creator",

    name:
      station.name ||
      "Untitled Station",

    title:
      station.name ||
      "Untitled Station",

    description:
      station.description ||
      "",

    category:
      station.category ||
      "Other",

    coverArt,
    artwork:
      coverArt,

    image:
      coverArt,

    isLive:
      Boolean(
        station.isLive
      ),

    listenerCount:
      Number(
        station.listenerCount
      ) || 0,

    listeners:
      Number(
        station.listenerCount
      ) || 0,

    followerCount:
      Number(
        station.followerCount
      ) || 0,

    followers:
      Number(
        station.followerCount
      ) || 0,

    isPublic:
      station.isPublic !==
      false,

    tags:
      Array.isArray(
        station.tags
      )
        ? station.tags
        : [],

    schedule:
      Array.isArray(
        station.schedule
      )
        ? station.schedule
        : [],
  };
};

export const normalizeBroadcast = (
  broadcast
) => {
  if (!broadcast) {
    return null;
  }

  const id =
    broadcast.id ||
    broadcast._id;

  const stationObject =
    typeof broadcast.station ===
    "object"
      ? broadcast.station
      : null;

  const creatorObject =
    typeof broadcast.creator ===
    "object"
      ? broadcast.creator
      : null;

  const stationId =
    normalizeId(
      broadcast.station
    ) ||
    broadcast.stationId ||
    null;

  const creatorId =
    normalizeId(
      broadcast.creator
    ) ||
    broadcast.creatorId ||
    null;

  const coverArt =
    broadcast.coverArt ||
    stationObject?.coverArt ||
    getMockMediaForKey(
      id ||
        broadcast.title,
      "broadcasts"
    );

  const status =
    broadcast.status ||
    (
      broadcast.isLive
        ? "live"
        : "scheduled"
    );

  return {
    ...broadcast,

    id,

    _id:
      broadcast._id ||
      broadcast.id ||
      null,

    title:
      broadcast.title ||
      "Untitled Broadcast",

    description:
      broadcast.description ||
      "",

    stationId,

    stationName:
      stationObject?.name ||
      broadcast.stationName ||
      "Echoo Station",

    stationSlug:
      stationObject?.slug ||
      null,

    creatorId,

    creatorName:
      creatorObject
        ?.displayName ||
      creatorObject
        ?.username ||
      broadcast.creatorName ||
      "Echoo Creator",

    creatorAvatar:
      creatorObject?.avatar ||
      null,

    coverArt,

    artwork:
      coverArt,

    image:
      coverArt,

    status,

    isLive:
      status === "live" ||
      Boolean(
        broadcast.isLive
      ),

    isUpcoming:
      status ===
        "scheduled" ||
      Boolean(
        broadcast.isUpcoming
      ),

    listenerCount:
      Number(
        broadcast.listenerCount
      ) || 0,

    listeners:
      Number(
        broadcast.listenerCount
      ) || 0,

    peakListeners:
      Number(
        broadcast.peakListeners
      ) || 0,

    startTime:
      broadcast.startTime ||
      broadcast.startAt ||
      null,

    endTime:
      broadcast.endTime ||
      null,

    startAt:
      broadcast.startTime ||
      broadcast.startAt ||
      null,

    type:
      broadcast.type ||
      "live",

    duration:
      Number(
        broadcast.duration
      ) || 0,

    isPublic:
      broadcast.isPublic !==
      false,

    tags:
      Array.isArray(
        broadcast.tags
      )
        ? broadcast.tags
        : [],
  };
};

const normalizeStationList = (
  response
) => {
  const data =
    response?.data;

  const list =
    Array.isArray(
      data
    )
      ? data
      : Array.isArray(
          data?.stations
        )
        ? data.stations
        : [];

  return list
    .map(
      normalizeStation
    )
    .filter(Boolean);
};

const normalizeBroadcastList = (
  response
) => {
  const data =
    response?.data;

  const list =
    Array.isArray(
      data
    )
      ? data
      : Array.isArray(
          data?.broadcasts
        )
        ? data.broadcasts
        : [];

  return list
    .map(
      normalizeBroadcast
    )
    .filter(Boolean);
};

const sameOwner = (
  station,
  user
) => {
  const owner =
    station.owner ||
    {};

  const ownerId =
    station.ownerId ||
    owner.id ||
    owner._id ||
    null;

  const userId =
    user.id ||
    user._id ||
    user.userId ||
    null;

  if (
    ownerId &&
    userId &&
    String(ownerId) ===
      String(userId)
  ) {
    return true;
  }

  const ownerUsername =
    owner.username ||
    "";

  const username =
    user.username ||
    "";

  if (
    ownerUsername &&
    username &&
    ownerUsername
      .toLowerCase() ===
      username.toLowerCase()
  ) {
    return true;
  }

  return false;
};

const batch2Service = {
  listStations: async (
    options = {}
  ) => {
    const response =
      await apiRequest(
        `/stations${queryString({
          page:
            options.page ||
            1,

          limit:
            options.limit ||
            100,

          category:
            options.category,

          search:
            options.search,

          featured:
            options.featured,

          live:
            options.live,
        })}`
      );

    return {
      ...response,

      data:
        normalizeStationList(
          response
        ),
    };
  },

  getMyStations:
    async () => {
      const response =
        await batch2Service
          .listStations({
            page: 1,
            limit: 100,
          });

      const user =
        readStoredUser();

      const owned =
        response.data.filter(
          (
            station
          ) =>
            sameOwner(
              station,
              user
            )
        );

      return {
        ...response,
        data:
          owned,
      };
    },

  getStation: async (
    stationId
  ) => {
    const response =
      await apiRequest(
        `/stations/${encodeURIComponent(
          stationId
        )}`
      );

    return {
      ...response,

      data:
        normalizeStation(
          response?.data
        ),
    };
  },

  createStation: async (
    payload
  ) => {
    const response =
      await apiRequest(
        "/stations",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              name:
                payload.name,

              description:
                payload.description ||
                "",

              category:
                payload.category ||
                "Other",

              tags:
                Array.isArray(
                  payload.tags
                )
                  ? payload.tags
                  : [],

              isPublic:
                true,

              coverArt:
                payload.coverArt ||
                null,
            }),
        }
      );

    return {
      ...response,

      data:
        normalizeStation(
          response?.data
        ),
    };
  },

  updateStation: async (
    stationId,
    payload
  ) => {
    const response =
      await apiRequest(
        `/stations/${encodeURIComponent(
          stationId
        )}`,
        {
          method:
            "PATCH",

          body:
            JSON.stringify(
              payload
            ),
        }
      );

    return {
      ...response,

      data:
        normalizeStation(
          response?.data
        ),
    };
  },

  deleteStation: async (
    stationId
  ) => {
    return apiRequest(
      `/stations/${encodeURIComponent(
        stationId
      )}`,
      {
        method:
          "DELETE",
      }
    );
  },

  getStationSchedule:
    async (
      stationId
    ) => {
      return apiRequest(
        `/stations/${encodeURIComponent(
          stationId
        )}/schedule`
      );
    },

  updateStationSchedule:
    async (
      stationId,
      schedule
    ) => {
      return apiRequest(
        `/stations/${encodeURIComponent(
          stationId
        )}/schedule`,
        {
          method:
            "PATCH",

          body:
            JSON.stringify({
              schedule,
            }),
        }
      );
    },

  listBroadcasts: async (
    options = {}
  ) => {
    const response =
      await apiRequest(
        `/broadcasts${queryString({
          page:
            options.page ||
            1,

          limit:
            options.limit ||
            100,

          stationId:
            options.stationId,

          status:
            options.status,

          startDate:
            options.startDate,

          endDate:
            options.endDate,

          search:
            options.search,

          type:
            options.type,

          isRecurring:
            options.isRecurring,
        })}`
      );

    return {
      ...response,

      data:
        normalizeBroadcastList(
          response
        ),
    };
  },

  getCreatorBroadcasts:
    async () => {
      const stationResponse =
        await batch2Service
          .getMyStations();

      const stations =
        stationResponse.data;

      if (
        !stations.length
      ) {
        return {
          data: [],
        };
      }

      const results =
        await Promise.allSettled(
          stations.map(
            (
              station
            ) =>
              batch2Service
                .listBroadcasts({
                  stationId:
                    station.id,

                  limit:
                    100,
                })
          )
        );

      const seen =
        new Set();

      const broadcasts =
        [];

      results.forEach(
        (
          result
        ) => {
          if (
            result.status !==
            "fulfilled"
          ) {
            return;
          }

          result.value.data
            .forEach(
              (
                broadcast
              ) => {
                if (
                  !broadcast.id ||
                  seen.has(
                    String(
                      broadcast.id
                    )
                  )
                ) {
                  return;
                }

                seen.add(
                  String(
                    broadcast.id
                  )
                );

                broadcasts.push(
                  broadcast
                );
              }
            );
        }
      );

      broadcasts.sort(
        (
          first,
          second
        ) =>
          new Date(
            first.startTime ||
            0
          ) -
          new Date(
            second.startTime ||
            0
          )
      );

      return {
        data:
          broadcasts,
      };
    },

  createBroadcast: async (
    payload
  ) => {
    const response =
      await apiRequest(
        "/broadcasts",
        {
          method:
            "POST",

          body:
            JSON.stringify(
              payload
            ),
        }
      );

    return {
      ...response,

      data:
        normalizeBroadcast(
          response?.data
        ),
    };
  },

  updateBroadcast: async (
    broadcastId,
    payload
  ) => {
    const response =
      await apiRequest(
        `/broadcasts/${encodeURIComponent(
          broadcastId
        )}`,
        {
          method:
            "PATCH",

          body:
            JSON.stringify(
              payload
            ),
        }
      );

    return {
      ...response,

      data:
        normalizeBroadcast(
          response?.data
        ),
    };
  },

  cancelBroadcast: async (
    broadcastId
  ) => {
    return batch2Service
      .updateBroadcast(
        broadcastId,
        {
          status:
            "cancelled",
        }
      );
  },

  deleteBroadcast: async (
    broadcastId
  ) => {
    return apiRequest(
      `/broadcasts/${encodeURIComponent(
        broadcastId
      )}`,
      {
        method:
          "DELETE",
      }
    );
  },

  getUpcomingBroadcasts:
    async (
      stationId
    ) => {
      const response =
        await apiRequest(
          `/broadcasts/station/${encodeURIComponent(
            stationId
          )}/upcoming`,
          {
            skipAuth:
              true,

            skipRefresh:
              true,
          }
        );

      return {
        ...response,

        data:
          normalizeBroadcastList(
            response
          ),
      };
    },

  getLiveBroadcast:
    async (
      stationId
    ) => {
      const response =
        await apiRequest(
          `/broadcasts/station/${encodeURIComponent(
            stationId
          )}/live`,
          {
            skipAuth:
              true,

            skipRefresh:
              true,
          }
        );

      return {
        ...response,

        data:
          normalizeBroadcast(
            response?.data
          ),
      };
    },
};

export default batch2Service;
