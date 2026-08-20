import mongoose from 'mongoose';
import Playlist from '../models/Playlist.js';
import Audio from '../models/Audio.js';
import { isAudioAccessibleToUser } from '../services/audioAccess.js';

const OWNER_FIELDS = 'username displayName avatar';

function validId(value) {
  return mongoose.isValidObjectId(value);
}

function invalidId(res) {
  return res.status(400).json({
    error: { code: 'INVALID_PLAYLIST_ID', message: 'Invalid playlist ID' },
  });
}

function populatePlaylist(query) {
  return query
    .populate('owner', OWNER_FIELDS)
    .populate(
      'tracks.trackId',
      'title artist duration fileUrl coverArt genre isPublic isDeleted'
    )
    .populate('tracks.addedBy', OWNER_FIELDS);
}

const idOf = (value) => String(value?._id || value?.id || value || '');

function sanitizePlaylist(playlist, viewerId = null) {
  if (!playlist) return null;

  const plain = playlist.toObject
    ? playlist.toObject({ getters: true })
    : { ...playlist };
  const viewer = viewerId ? String(viewerId) : null;

  plain.tracks = (plain.tracks || []).filter((entry) =>
    isAudioAccessibleToUser(entry?.trackId, viewer)
  );
  plain.trackCount = plain.tracks.length;
  return plain;
}

const canReadPrivatePlaylist = (playlist, userId) => {
  const user = String(userId || '');
  if (!user) return false;
  if (idOf(playlist.owner) === user) return true;
  return Boolean(
    playlist.isCollaborative &&
    (playlist.collaborators || []).some((id) => idOf(id) === user)
  );
};

export async function createPlaylist(req, res, next) {
  try {
    const {
      name,
      description = '',
      isPublic = false,
      isCollaborative = false,
    } = req.body;

    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Playlist name is required' },
      });
    }

    const playlist = await Playlist.create({
      name: cleanName,
      description,
      owner: req.userId,
      isPublic: Boolean(isPublic),
      isCollaborative: Boolean(isCollaborative),
    });

    const populated = await populatePlaylist(Playlist.findById(playlist._id));

    return res.status(201).json({
      data: sanitizePlaylist(populated, req.userId),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPlaylists(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter = {
      isDeleted: false,
      isPublic: true,
    };

    if (req.query.search) {
      filter.$text = { $search: String(req.query.search).slice(0, 120) };
    }

    const [playlists, total] = await Promise.all([
      populatePlaylist(
        Playlist.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
      ),
      Playlist.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: playlists.map((playlist) => sanitizePlaylist(playlist, null)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyPlaylists(req, res, next) {
  try {
    const playlists = await populatePlaylist(
      Playlist.find({
        owner: req.userId,
        isDeleted: false,
      }).sort({ createdAt: -1 })
    );

    return res.status(200).json({
      data: playlists.map((playlist) => sanitizePlaylist(playlist, req.userId)),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPlaylistById(req, res, next) {
  try {
    const { id } = req.params;
    if (!validId(id)) return invalidId(res);

    const playlist = await populatePlaylist(
      Playlist.findOne({ _id: id, isDeleted: false })
    );

    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' },
      });
    }

    if (!playlist.isPublic && !canReadPrivatePlaylist(playlist, req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this playlist' },
      });
    }

    return res.status(200).json({
      data: sanitizePlaylist(playlist, req.userId),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePlaylist(req, res, next) {
  try {
    const { id } = req.params;
    if (!validId(id)) return invalidId(res);

    const playlist = await Playlist.findOne({ _id: id, isDeleted: false });
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' },
      });
    }

    if (String(playlist.owner) !== String(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this playlist' },
      });
    }

    const { name, description, isPublic, isCollaborative, coverArt } = req.body;
    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Playlist name cannot be empty' },
        });
      }
      playlist.name = cleanName;
    }
    if (description !== undefined) playlist.description = description;
    if (isPublic !== undefined) playlist.isPublic = Boolean(isPublic);
    if (isCollaborative !== undefined) playlist.isCollaborative = Boolean(isCollaborative);
    if (coverArt !== undefined) playlist.coverArt = coverArt || null;

    await playlist.save();
    const populated = await populatePlaylist(Playlist.findById(playlist._id));

    return res.status(200).json({
      data: sanitizePlaylist(populated, req.userId),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deletePlaylist(req, res, next) {
  try {
    const { id } = req.params;
    if (!validId(id)) return invalidId(res);

    const playlist = await Playlist.findOne({ _id: id, isDeleted: false });
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' },
      });
    }

    if (String(playlist.owner) !== String(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this playlist' },
      });
    }

    playlist.isDeleted = true;
    await playlist.save();

    return res.status(200).json({
      data: { message: 'Playlist deleted successfully' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function addTrackToPlaylist(req, res, next) {
  try {
    const { id } = req.params;
    const { trackId } = req.body;
    if (!validId(id)) return invalidId(res);
    if (!validId(trackId)) {
      return res.status(400).json({
        error: { code: 'INVALID_TRACK_ID', message: 'Invalid track ID' },
      });
    }

    const [track, playlist] = await Promise.all([
      Audio.findOne({ _id: trackId, isDeleted: false, isPublic: true }).select('_id'),
      Playlist.findOne({ _id: id, isDeleted: false }),
    ]);

    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Public track not found' },
      });
    }
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' },
      });
    }
    if (!playlist.canEdit(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You cannot edit this playlist' },
      });
    }

    if (playlist.tracks.some((entry) => idOf(entry.trackId) === String(trackId))) {
      return res.status(409).json({
        error: {
          code: 'TRACK_ALREADY_IN_PLAYLIST',
          message: 'Track already in playlist',
        },
      });
    }

    await playlist.addTrack(trackId, req.userId);
    const populated = await populatePlaylist(Playlist.findById(playlist._id));

    return res.status(200).json({
      data: sanitizePlaylist(populated, req.userId),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function removeTrackFromPlaylist(req, res, next) {
  try {
    const { id } = req.params;
    const { trackId } = req.body;
    if (!validId(id)) return invalidId(res);
    if (!validId(trackId)) {
      return res.status(400).json({
        error: { code: 'INVALID_TRACK_ID', message: 'Invalid track ID' },
      });
    }

    const playlist = await Playlist.findOne({ _id: id, isDeleted: false });
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' },
      });
    }
    if (!playlist.canEdit(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You cannot edit this playlist' },
      });
    }

    await playlist.removeTrack(trackId);
    const populated = await populatePlaylist(Playlist.findById(playlist._id));

    return res.status(200).json({
      data: sanitizePlaylist(populated, req.userId),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function reorderTracks(req, res, next) {
  try {
    const { id } = req.params;
    const { trackIds } = req.body;
    if (!validId(id)) return invalidId(res);
    if (!Array.isArray(trackIds)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'trackIds must be an array' },
      });
    }
    if (
      trackIds.some((trackId) => !validId(trackId)) ||
      new Set(trackIds.map(String)).size !== trackIds.length
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PLAYLIST_ORDER',
          message: 'trackIds must contain unique valid track IDs',
        },
      });
    }

    const playlist = await Playlist.findOne({ _id: id, isDeleted: false });
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' },
      });
    }
    if (!playlist.canEdit(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You cannot edit this playlist' },
      });
    }

    const existingIds = playlist.tracks.map((entry) => idOf(entry.trackId));
    const requestedIds = trackIds.map(String);
    if (
      requestedIds.length !== existingIds.length ||
      requestedIds.some((trackId) => !existingIds.includes(trackId)) ||
      existingIds.some((trackId) => !requestedIds.includes(trackId))
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PLAYLIST_ORDER',
          message: 'trackIds must contain every playlist track exactly once',
        },
      });
    }

    await playlist.reorderTracks(trackIds);
    const populated = await populatePlaylist(Playlist.findById(playlist._id));

    return res.status(200).json({
      data: sanitizePlaylist(populated, req.userId),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
