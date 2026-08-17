import Playlist from '../models/Playlist.js';
import Audio from '../models/Audio.js';

// Create playlist
export async function createPlaylist(req, res, next) {
  try {
    const { name, description, isPublic, isCollaborative } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Playlist name is required' }
      });
    }

    const playlist = new Playlist({
      name,
      description: description || '',
      owner: req.userId,
      isPublic: isPublic !== undefined ? isPublic : true,
      isCollaborative: isCollaborative || false,
    });

    await playlist.save();

    return res.status(201).json({
      data: playlist,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get all playlists
export async function getPlaylists(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const filter = { isDeleted: false };
    
    // If not authenticated, only show public playlists
    if (!req.userId) {
      filter.isPublic = true;
    } else {
      // Show user's own playlists and public playlists
      filter.$or = [
        { owner: req.userId },
        { isPublic: true }
      ];
    }

    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const playlists = await Playlist.find(filter)
      .populate('owner', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Playlist.countDocuments(filter);

    return res.status(200).json({
      data: playlists,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get single playlist
export async function getPlaylistById(req, res, next) {
  try {
    const playlist = await Playlist.findById(req.params.id)
      .populate('owner', 'username displayName avatar bio')
      .populate('tracks.trackId', 'title artist duration fileUrl genre')
      .populate('tracks.addedBy', 'username displayName');

    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' }
      });
    }

    // Check access
    if (!playlist.isPublic && playlist.owner._id.toString() !== req.userId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this playlist' }
      });
    }

    return res.status(200).json({
      data: playlist,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update playlist
export async function updatePlaylist(req, res, next) {
  try {
    const { name, description, isPublic, isCollaborative, coverArt } = req.body;

    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' }
      });
    }

    // Check ownership
    if (playlist.owner.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this playlist' }
      });
    }

    if (name) playlist.name = name;
    if (description !== undefined) playlist.description = description;
    if (isPublic !== undefined) playlist.isPublic = isPublic;
    if (isCollaborative !== undefined) playlist.isCollaborative = isCollaborative;
    if (coverArt) playlist.coverArt = coverArt;

    await playlist.save();

    return res.status(200).json({
      data: playlist,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Delete playlist
export async function deletePlaylist(req, res, next) {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' }
      });
    }

    // Check ownership
    if (playlist.owner.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this playlist' }
      });
    }

    playlist.isDeleted = true;
    await playlist.save();

    return res.status(200).json({
      data: { message: 'Playlist deleted successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Add track to playlist
export async function addTrackToPlaylist(req, res, next) {
  try {
    const { trackId } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Track ID is required' }
      });
    }

    // Check if track exists
    const track = await Audio.findById(trackId);
    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track not found' }
      });
    }

    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' }
      });
    }

    // Check edit permission
    if (!playlist.canEdit(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this playlist' }
      });
    }

    await playlist.addTrack(trackId, req.userId);

    return res.status(200).json({
      data: playlist,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Remove track from playlist
export async function removeTrackFromPlaylist(req, res, next) {
  try {
    const { trackId } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Track ID is required' }
      });
    }

    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' }
      });
    }

    // Check edit permission
    if (!playlist.canEdit(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this playlist' }
      });
    }

    await playlist.removeTrack(trackId);

    return res.status(200).json({
      data: playlist,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Reorder tracks in playlist
export async function reorderTracks(req, res, next) {
  try {
    const { trackIds } = req.body;

    if (!trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Track IDs array is required' }
      });
    }

    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Playlist not found' }
      });
    }

    // Check edit permission
    if (!playlist.canEdit(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this playlist' }
      });
    }

    await playlist.reorderTracks(trackIds);

    return res.status(200).json({
      data: playlist,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
