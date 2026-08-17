import {
  apiRequest,
  buildMediaUrl,
} from './api.js';
import { getMockMediaForKey } from "./mockMediaService.js";

const getTemporaryAudioUrl = (track) => {
  const title =
    track?.title?.toLowerCase() || '';

  if (
    title.includes(
      'first track'
    )
  ) {
    return '/audio/motivation.mp3';
  }

  if (
    title.includes(
      'updated track'
    )
  ) {
    return '/audio/deep-focus.mp3';
  }

  if (
    title.includes(
      'sunday'
    )
  ) {
    return '/audio/sunday-message.mp3';
  }

  return '/audio/motivation.mp3';
};

const normalizeAudio = (track) => {
  if (!track) {
    return null;
  }

  return {
    ...track,

    id:
      track.id ||
      track._id ||
      null,

    backendFileUrl:
      buildMediaUrl(
        track.fileUrl
      ),

    fileUrl:
      getTemporaryAudioUrl(
        track
      ),

    coverArt:
      buildMediaUrl(
        track.coverArt
      ) ||
      getMockMediaForKey(
      `${
        track.id ||
        track._id ||
        ""
      } ${
        track.title ||
        ""
      }`,
      "audio"
    ),


    artistName:
      typeof track.artist ===
      'string'
        ? track.artist
        : track.artist
            ?.displayName ||
          track.artist
            ?.username ||
          'Unknown Artist',
  };
};

export const audioService = {
  getAll: async (
    params = {}
  ) => {
    const query =
      new URLSearchParams();

    if (params.search) {
      query.append(
        'search',
        params.search
      );
    }

    if (params.genre) {
      query.append(
        'genre',
        params.genre
      );
    }

    if (
      params.public !==
      undefined
    ) {
      query.append(
        'public',
        String(
          params.public
        )
      );
    }

    if (params.page) {
      query.append(
        'page',
        String(
          params.page
        )
      );
    }

    if (params.limit) {
      query.append(
        'limit',
        String(
          params.limit
        )
      );
    }

    if (params.userId) {
      query.append(
        'userId',
        params.userId
      );
    }

    const queryString =
      query.toString();

    const response =
      await apiRequest(
        `/audio${
          queryString
            ? `?${queryString}`
            : ''
        }`
      );

    return {
      ...response,

      data: Array.isArray(
        response?.data
      )
        ? response.data.map(
            normalizeAudio
          )
        : [],
    };
  },

  getById: async (id) => {
    const response =
      await apiRequest(
        `/audio/${id}`
      );

    return {
      ...response,

      data:
        normalizeAudio(
          response?.data
        ),
    };
  },

  upload: async (
    formData
  ) => {
    const response =
      await apiRequest(
        '/audio/upload',
        {
          method: 'POST',
          body: formData,
          isFormData: true,
        }
      );

    return {
      ...response,

      data:
        normalizeAudio(
          response?.data
        ),
    };
  },

  update: async (
    id,
    data
  ) => {
    return apiRequest(
      `/audio/${id}`,
      {
        method: 'PATCH',

        body:
          JSON.stringify(
            data
          ),
      }
    );
  },

  delete: async (id) => {
    return apiRequest(
      `/audio/${id}`,
      {
        method: 'DELETE',
      }
    );
  },

  play: async (id) => {
    return apiRequest(
      `/audio/${id}/play`,
      {
        method: 'POST',
      }
    );
  },

  like: async (id) => {
    return apiRequest(
      `/audio/${id}/like`,
      {
        method: 'POST',
      }
    );
  },

  search: async (
    search
  ) => {
    const query =
      new URLSearchParams({
        q:
          String(
            search || ""
          ).trim(),
        page: "1",
        limit: "20",
      });

    const response =
      await apiRequest(
        `/search/tracks?${query.toString()}`,
        {
          skipAuth: true,
          skipRefresh: true,
        }
      );

    const tracks =
      Array.isArray(
        response?.data?.tracks
      )
        ? response.data.tracks
        : [];

    return {
      ...response,
      data:
        tracks
          .map(
            normalizeAudio
          )
          .filter(Boolean),
      pagination:
        response?.data
          ?.pagination ||
        null,
    };
  },

  normalize:
    normalizeAudio,
};

export default audioService;