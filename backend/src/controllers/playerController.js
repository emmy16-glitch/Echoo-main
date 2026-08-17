import User from '../models/User.js';
import Audio from '../models/Audio.js';

const clampProgress = (value, completed = false) => {
  if (completed) return 100;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
};

const sameId = (first, second) =>
  Boolean(first && second && String(first) === String(second));

// Get current playback state
export async function getPlaybackState(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId)
      .populate('continueListening.trackId', 'title duration artist genre fileUrl coverArt');

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

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
          coverArt: currentTrack.trackId?.coverArt,
          genre: currentTrack.trackId?.genre,
        } : null,
        isPlaying: false,
        volume: user.preferences?.player?.volume ?? 0.8,
        isMuted: Boolean(user.preferences?.player?.isMuted),
        playbackRate: user.preferences?.player?.playbackRate ?? 1.0,
        isShuffled: Boolean(user.preferences?.player?.isShuffled),
        repeatMode: user.preferences?.player?.repeatMode || 'none',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Persist a listener's current position. `progress` is always a percentage (0-100).
export async function updatePlaybackProgress(req, res, next) {
  try {
    const userId = req.userId;
    const { trackId, progress, duration, completed } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Track ID is required' }
      });
    }

    const [user, track] = await Promise.all([
      User.findById(userId),
      Audio.findOne({ _id: trackId, isDeleted: false }),
    ]);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track not found' }
      });
    }

    const progressPercent = clampProgress(progress, completed === true);
    const isCompleted = completed === true || progressPercent >= 99.5;
    const clientDuration = Math.max(0, Number(duration) || 0);
    const totalDuration = clientDuration || Math.max(0, Number(track.duration) || 0);
    const remaining = totalDuration > 0
      ? Math.max(0, totalDuration * (1 - progressPercent / 100))
      : 0;
    const now = new Date();

    // Older uploads may not have duration metadata. Once a browser has loaded
    // the real media metadata, use it to repair the canonical Audio record so
    // creator totals, history and future resume calculations stay accurate.
    if (
      clientDuration > 0 &&
      Math.abs((Number(track.duration) || 0) - clientDuration) > 0.5
    ) {
      track.duration = clientDuration;
      await track.save();
    }

    // Update the latest unfinished session for this track instead of creating a
    // duplicate history row every time the client syncs its playback position.
    let historyEntry = null;
    for (let index = user.listeningHistory.length - 1; index >= 0; index -= 1) {
      const candidate = user.listeningHistory[index];
      if (sameId(candidate.trackId, trackId) && !candidate.completed) {
        historyEntry = candidate;
        break;
      }
    }

    if (!historyEntry) {
      user.listeningHistory.push({
        trackId,
        playedAt: now,
        progress: progressPercent,
        completed: isCompleted,
      });
    } else {
      historyEntry.playedAt = now;
      historyEntry.progress = progressPercent;
      historyEntry.completed = isCompleted;
    }

    if (user.listeningHistory.length > 100) {
      user.listeningHistory = user.listeningHistory.slice(-100);
    }

    // Completed audio should leave Continue Listening. Otherwise keep one
    // canonical entry at the front while preserving the percentage position.
    user.continueListening = user.continueListening.filter(
      (item) => !sameId(item.trackId, trackId)
    );

    if (!isCompleted) {
      user.continueListening.unshift({
        trackId,
        title: track.title,
        progress: progressPercent,
        remaining,
        lastPlayed: now,
      });
    }

    if (user.continueListening.length > 20) {
      user.continueListening = user.continueListening.slice(0, 20);
    }

    await user.save();

    // Play counts are recorded by POST /audio/:id/play when playback actually
    // starts. Do not increment again here or one listen is counted twice.
    return res.status(200).json({
      data: {
        trackId,
        progress: progressPercent,
        duration: totalDuration,
        remaining,
        completed: isCompleted,
        updated: true,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Add to continue listening without erasing an existing saved position.
export async function addToContinueListening(req, res, next) {
  try {
    const userId = req.userId;
    const { trackId } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Track ID is required' }
      });
    }

    const [user, track] = await Promise.all([
      User.findById(userId),
      Audio.findOne({ _id: trackId, isDeleted: false }),
    ]);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track not found' }
      });
    }

    const existing = user.continueListening.find(
      (item) => sameId(item.trackId, trackId)
    );
    const progress = clampProgress(existing?.progress || 0);
    const duration = Math.max(0, Number(track.duration) || 0);
    const remaining = Number.isFinite(Number(existing?.remaining))
      ? Math.max(0, Number(existing.remaining))
      : duration * (1 - progress / 100);

    user.continueListening = user.continueListening.filter(
      (item) => !sameId(item.trackId, trackId)
    );

    user.continueListening.unshift({
      trackId,
      title: track.title,
      progress,
      remaining,
      lastPlayed: new Date(),
    });

    if (user.continueListening.length > 20) {
      user.continueListening = user.continueListening.slice(0, 20);
    }

    await user.save();

    return res.status(200).json({
      data: {
        message: 'Added to continue listening',
        track: {
          id: track._id,
          title: track.title,
          duration: track.duration,
          progress,
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

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
      (item) => !sameId(item.trackId, trackId)
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

export async function getContinueListening(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId)
      .populate({
        path: 'continueListening.trackId',
        select: 'title duration artist genre fileUrl coverArt isDeleted isPublic',
        populate: {
          path: 'artist',
          select: 'username displayName avatar',
        },
      });

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const tracks = user.continueListening
      .filter((item) => item.trackId && !item.trackId.isDeleted)
      .map((item) => ({
        id: item.trackId?._id,
        title: item.title || item.trackId?.title,
        artist: item.trackId?.artist,
        duration: item.trackId?.duration,
        progress: clampProgress(item.progress || 0),
        remaining: item.remaining || 0,
        lastPlayed: item.lastPlayed,
        fileUrl: item.trackId?.fileUrl,
        coverArt: item.trackId?.coverArt,
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

export async function getListeningHistory(req, res, next) {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const user = await User.findById(userId)
      .populate({
        path: 'listeningHistory.trackId',
        select: 'title duration artist genre fileUrl coverArt',
        populate: {
          path: 'artist',
          select: 'username displayName avatar',
        },
      });

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const history = user.listeningHistory
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(skip, skip + parseInt(limit, 10))
      .map((item) => ({
        trackId: item.trackId?._id,
        title: item.trackId?.title,
        artist: item.trackId?.artist,
        duration: item.trackId?.duration,
        genre: item.trackId?.genre,
        fileUrl: item.trackId?.fileUrl,
        coverArt: item.trackId?.coverArt,
        playedAt: item.playedAt,
        progress: clampProgress(item.progress || 0),
        completed: item.completed,
      }));

    const total = user.listeningHistory.length;

    return res.status(200).json({
      data: {
        history,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          totalPages: Math.ceil(total / parseInt(limit, 10)),
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

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
