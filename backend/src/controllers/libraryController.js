import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Playlist from '../models/Playlist.js';

// Save a track to library
export async function saveTrack(req, res, next) {
  try {
    const { trackId } = req.params;
    const userId = req.userId;

    // Check if track exists
    const track = await Audio.findById(trackId);
    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track not found' }
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Check if already saved
    if (user.savedAudio.includes(trackId)) {
      return res.status(400).json({
        error: { code: 'ALREADY_SAVED', message: 'Track already saved' }
      });
    }

    user.savedAudio.push(trackId);
    await user.save();

    return res.status(200).json({
      data: {
        message: 'Track saved successfully',
        trackId,
        saved: true,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Save track error:', error);
    next(error);
  }
}

// Remove a track from library
export async function unsaveTrack(req, res, next) {
  try {
    const { trackId } = req.params;
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Check if saved
    if (!user.savedAudio.includes(trackId)) {
      return res.status(400).json({
        error: { code: 'NOT_SAVED', message: 'Track not saved' }
      });
    }

    user.savedAudio = user.savedAudio.filter(
      id => id.toString() !== trackId
    );
    await user.save();

    return res.status(200).json({
      data: {
        message: 'Track removed from library',
        trackId,
        saved: false,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Unsave track error:', error);
    next(error);
  }
}

// Get saved tracks
export async function getSavedTracks(req, res, next) {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const user = await User.findById(userId)
      .populate({
        path: 'savedAudio',
        populate: {
          path: 'artist',
          select: 'username displayName avatar',
        },
        options: {
          sort: { createdAt: -1 },
          skip: skip,
          limit: parseInt(limit),
        },
      });

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const total = user.savedAudio.length;

    return res.status(200).json({
      data: {
        tracks: user.savedAudio.map(track => ({
          id: track._id,
          title: track.title,
          description: track.description,
          duration: track.duration,
          genre: track.genre,
          fileUrl: track.fileUrl,
          playCount: track.playCount,
          likeCount: track.likeCount,
          artist: track.artist ? {
            id: track.artist._id,
            username: track.artist.username,
            displayName: track.artist.displayName,
            avatar: track.artist.avatar,
          } : null,
          createdAt: track.createdAt,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get saved tracks error:', error);
    next(error);
  }
}

// Check if track is saved
export async function checkSaved(req, res, next) {
  try {
    const { trackId } = req.params;
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const isSaved = user.savedAudio.includes(trackId);

    return res.status(200).json({
      data: {
        saved: isSaved,
        trackId,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Check saved error:', error);
    next(error);
  }
}

// Get library stats
export async function getLibraryStats(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Get playlists count using the imported Playlist model
    const playlistCount = await Playlist.countDocuments({
      owner: userId,
      isDeleted: false,
    });

    return res.status(200).json({
      data: {
        savedTracks: user.savedAudio.length,
        playlists: playlistCount,
        totalSaved: user.savedAudio.length + playlistCount,
        listeningHistory: user.listeningHistory.length,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get library stats error:', error);
    next(error);
  }
}
