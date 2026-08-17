import {
  apiRequest,
  buildMediaUrl,
} from './api.js';

const normalizeTrack = (
  entry
) => {
  if (!entry) {
    return null;
  }

  const track =
    entry.trackId &&
    typeof entry.trackId ===
      'object'
      ? entry.trackId
      : entry.track &&
          typeof entry.track ===
            'object'
        ? entry.track
        : entry;

  const id =
    track.id ||
    track._id ||
    (
      typeof entry.trackId ===
      'string'
        ? entry.trackId
        : null
    ) ||
    null;

  const artist =
    track.artist ||
    null;

  return {
    ...track,

    id,

    title:
      track.title ||
      'Untitled Audio',

    artistName:
      track.artistName ||
      (
        typeof artist ===
        'string'
          ? artist
          : artist?.displayName ||
            artist?.username
      ) ||
      'Unknown Artist',

    fileUrl:
      buildMediaUrl(
        track.fileUrl
      ),

    coverArt:
      buildMediaUrl(
        track.coverArt
      ),

    duration:
      Number(
        track.duration
      ) || 0,

    genre:
      track.genre ||
      'Audio',
  };
};

const normalizePlaylist = (
  playlist
) => {
  if (!playlist) {
    return null;
  }

  const owner =
    playlist.owner;

  const tracks =
    Array.isArray(
      playlist.tracks
    )
      ? playlist.tracks
          .map(
            normalizeTrack
          )
          .filter(Boolean)
      : [];

  return {
    ...playlist,

    id:
      playlist.id ||
      playlist._id ||
      null,

    name:
      playlist.name ||
      'Untitled Playlist',

    description:
      playlist.description ||
      '',

    ownerId:
      typeof owner ===
      'string'
        ? owner
        : owner?._id ||
          owner?.id ||
          null,

    ownerName:
      typeof owner ===
      'string'
        ? 'Echoo User'
        : owner?.displayName ||
          owner?.username ||
          'Echoo User',

    coverArt:
      buildMediaUrl(
        playlist.coverArt
      ),

    tracks,

    trackCount:
      Number(
        playlist.trackCount
      ) ||
      tracks.length,

    isPublic:
      playlist.isPublic !==
      false,

    isCollaborative:
      Boolean(
        playlist.isCollaborative
      ),
  };
};

const playlistService = {
  getAll:
    async ({
      page = 1,
      limit = 50,
      search = '',
    } = {}) => {
      const query =
        new URLSearchParams();

      query.set(
        'page',
        String(page)
      );

      query.set(
        'limit',
        String(limit)
      );

      if (
        search.trim()
      ) {
        query.set(
          'search',
          search.trim()
        );
      }

      const response =
        await apiRequest(
          `/playlists?${query.toString()}`
        );

      return {
        ...response,

        data:
          Array.isArray(
            response?.data
          )
            ? response.data
                .map(
                  normalizePlaylist
                )
                .filter(
                  Boolean
                )
            : [],
      };
    },

  getById:
    async (id) => {
      const response =
        await apiRequest(
          `/playlists/${id}`
        );

      return {
        ...response,

        data:
          normalizePlaylist(
            response?.data
          ),
      };
    },

  create:
    async ({
      name,
      description = '',
      isPublic = true,
      isCollaborative = false,
    }) => {
      const response =
        await apiRequest(
          '/playlists',
          {
            method: 'POST',

            body:
              JSON.stringify({
                name,
                description,
                isPublic,
                isCollaborative,
              }),
          }
        );

      return {
        ...response,

        data:
          normalizePlaylist(
            response?.data
          ),
      };
    },

  update:
    async (
      id,
      data
    ) => {
      const response =
        await apiRequest(
          `/playlists/${id}`,
          {
            method: 'PATCH',

            body:
              JSON.stringify(
                data
              ),
          }
        );

      return {
        ...response,

        data:
          normalizePlaylist(
            response?.data
          ),
      };
    },

  delete:
    async (id) => {
      return apiRequest(
        `/playlists/${id}`,
        {
          method: 'DELETE',
        }
      );
    },

  addTrack:
    async (
      playlistId,
      trackId
    ) => {
      const response =
        await apiRequest(
          `/playlists/${playlistId}/tracks`,
          {
            method: 'POST',

            body:
              JSON.stringify({
                trackId,
              }),
          }
        );

      return response;
    },

  removeTrack:
    async (
      playlistId,
      trackId
    ) => {
      const response =
        await apiRequest(
          `/playlists/${playlistId}/tracks`,
          {
            method: 'DELETE',

            body:
              JSON.stringify({
                trackId,
              }),
          }
        );

      return response;
    },

  reorder:
    async (
      playlistId,
      trackIds
    ) => {
      return apiRequest(
        `/playlists/${playlistId}/reorder`,
        {
          method: 'PATCH',

          body:
            JSON.stringify({
              trackIds,
            }),
        }
      );
    },

  normalizePlaylist,
  normalizeTrack,
};

export default playlistService;