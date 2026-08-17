import User from '../models/User.js';
import Audio from '../models/Audio.js';

// Get current playback state
export async function getPlaybackState(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId)
      .populate('continueListening.trackId', 'title duration artist genre fileUrl');

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Get current playing track (first in continue listening or last played)
    const currentTrack = user.continueListening && user.continueListening.length > 0
      ? user.continueListening[0]
      : null;

    return res.status(200).json({
      data: {
        currentTrack: currentTrack ? {
          id: currentTrack.trackId?._id,
          title: currentTrack.title || currentTrack.trackId?.title,
          artist: currentTrack.trackId?.artist,
          duration: currentTrack.trackId?.duration,
          progress: currentTrack.progress || 0,
          remaining: currentTrack.remaining || 0,
          fileUrl: currentTrack.trackId?.fileUrl,
          genre: currentTrack.trackId?.genre,
        } : null,
        isPlaying: false, // This will be managed client-side with WebSocket
        volume: 0.8,
        isMuted: false,
        playbackRate: 1.0,
        isShuffled: false,
        repeatMode: 'none', // 'none', 'one', 'all'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update playback progress
export async function updatePlaybackProgress(req, res, next) {
  try {
    const userId = req.userId;
    const { trackId, progress, duration, completed } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Track ID is required' }
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Get track details
    const track = await Audio.findById(trackId);
    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track not found' }
      });
    }

    // Update listening history
    await user.updateListeningHistory(trackId, progress);

    // Update continue listening
    const remaining = duration ? duration - (progress / 100) * duration : 0;
    
    // Check if track already in continue listening
    const existingIndex = user.continueListening.findIndex(
      item => item.trackId && item.trackId.toString() === trackId
    );

    const continueItem = {
      trackId,
      title: track.title,
      progress: progress || 0,
      remaining: remaining,
      lastPlayed: new Date(),
    };

    if (existingIndex >= 0) {
      user.continueListening[existingIndex] = continueItem;
    } else {
      user.continueListening.unshift(continueItem);
    }

    // Keep only last 20 items
    if (user.continueListening.length > 20) {
      user.continueListening = user.continueListening.slice(0, 20);
    }

    await user.save();

    // Increment play count if completed or progress > 50%
    if (completed || progress >= 50) {
      // Check if this track was already counted for this session
      // For now, we'll increment play count
      await track.incrementPlays();
    }

    return res.status(200).json({
      data: {
        trackId,
        progress,
        remaining,
        completed: completed || false,
        updated: true,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Add to continue listening
export async function addToContinueListening(req, res, next) {
  try {
    const userId = req.userId;
    const { trackId } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Track ID is required' }
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const track = await Audio.findById(trackId);
    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track not found' }
      });
    }

    // Remove if already exists
    user.continueListening = user.continueListening.filter(
      item => item.trackId && item.trackId.toString() !== trackId
    );

    // Add to top
    user.continueListening.unshift({
      trackId,
      title: track.title,
      progress: 0,
      remaining: track.duration || 0,
      lastPlayed: new Date(),
    });

    await user.save();

    return res.status(200).json({
      data: {
        message: 'Added to continue listening',
        track: {
          id: track._id,
          title: track.title,
          duration: track.duration,
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Remove from continue listening
export async function removeFromContinueListening(req, res, next) {
  try {
    const userId = req.userId;
    const { trackId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    user.continueListening = user.continueListening.filter(
      item => item.trackId && item.trackId.toString() !== trackId
    );

    await user.save();

    return res.status(200).json({
      data: { message: 'Removed from continue listening' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get continue listening list
export async function getContinueListening(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId)
      .populate('continueListening.trackId', 'title duration artist genre fileUrl');

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const tracks = user.continueListening.map(item => ({
      id: item.trackId?._id,
      title: item.title || item.trackId?.title,
      artist: item.trackId?.artist,
      duration: item.trackId?.duration,
      progress: item.progress || 0,
      remaining: item.remaining || 0,
      lastPlayed: item.lastPlayed,
      fileUrl: item.trackId?.fileUrl,
      genre: item.trackId?.genre,
    }));

    return res.status(200).json({
      data: tracks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get listening history
export async function getListeningHistory(req, res, next) {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const user = await User.findById(userId)
      .populate('listeningHistory.trackId', 'title duration artist genre');

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const history = user.listeningHistory
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(skip, skip + parseInt(limit))
      .map(item => ({
        trackId: item.trackId?._id,
        title: item.trackId?.title,
        artist: item.trackId?.artist,
        duration: item.trackId?.duration,
        genre: item.trackId?.genre,
        playedAt: item.playedAt,
        progress: item.progress,
        completed: item.completed,
      }));

    const total = user.listeningHistory.length;

    return res.status(200).json({
      data: {
        history,
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
    next(error);
  }
}

// Update user preferences (volume, playback rate, etc.)
export async function updatePlayerPreferences(req, res, next) {
  try {
    const userId = req.userId;
    const { volume, isMuted, playbackRate, isShuffled, repeatMode } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Store player preferences in user preferences
    if (!user.preferences.player) {
      user.preferences.player = {};
    }

    if (volume !== undefined) user.preferences.player.volume = Math.min(1, Math.max(0, volume));
    if (isMuted !== undefined) user.preferences.player.isMuted = isMuted;
    if (playbackRate !== undefined) user.preferences.player.playbackRate = playbackRate;
    if (isShuffled !== undefined) user.preferences.player.isShuffled = isShuffled;
    if (repeatMode !== undefined) {
      const validModes = ['none', 'one', 'all'];
      if (validModes.includes(repeatMode)) {
        user.preferences.player.repeatMode = repeatMode;
      }
    }

    await user.save();

    return res.status(200).json({
      data: {
        preferences: user.preferences.player,
        message: 'Player preferences updated',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
