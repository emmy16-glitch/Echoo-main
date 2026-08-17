import mongoose from 'mongoose';
import Playlist from '../models/Playlist.js';
import Audio from '../models/Audio.js';

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
    .populate('tracks.trackId', 'title artist duration fileUrl coverArt genre isPublic isDeleted')
    .populate('tracks.addedBy', OWNER_FIELDS);
}

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
      data: populated,
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
      filter.$text = { $search: req.query.search };
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
      data: playlists,
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
      data: playlists,
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

    const ownerId = playlist.owner?._id || playlist.owner;
    if (!playlist.isPublic && String(ownerId) !== String(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this playlist' },
      });
    }

    return res.status(200).json({
      data: playlist,
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
    if (name !== undefined) playlist.name = String(name).trim();
    if (description !== undefined) playlist.description = description;
    if (isPublic !== undefined) playlist.isPublic = Boolean(isPublic);
    if (isCollaborative !== undefined) playlist.isCollaborative = Boolean(isCollaborative);
    if (coverArt !== undefined) playlist.coverArt = coverArt || null;

    await playlist.save();
    const populated = await populatePlaylist(Playlist.findById(playlist._id));

    return res.status(200).json({
      data: populated,
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

    await playlist.addTrack(trackId, req.userId);
    const populated = await populatePlaylist(Playlist.findById(playlist._id));

    return res.status(200).json({
      data: populated,
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
      data: populated,
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

    await playlist.reorderTracks(trackIds);
    const populated = await populatePlaylist(Playlist.findById(playlist._id));

    return res.status(200).json({
      data: populated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
