import mongoose from 'mongoose';
import User from '../models/User.js';
import {
  findAccessibleAudio,
  isAudioAccessibleToUser,
} from '../services/audioAccess.js';

const clampProgress = (value, completed = false) => {
  if (completed) return 100;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
};

const sameId = (first, second) =>
  Boolean(first && second && String(first) === String(second));

const validTrackId = (value) => mongoose.isValidObjectId(value);

const invalidTrack = (res) =>
  res.status(400).json({
    error: { code: 'INVALID_TRACK_ID', message: 'Invalid track ID' },
  });

const playableTrackFields =
  'title duration artist genre fileUrl coverArt isDeleted isPublic';

// Get current playback state. A creator making a track private or deleting it
// takes effect on listener resume surfaces immediately; old history state is not
// allowed to keep a now-inaccessible track playable.
export async function getPlaybackState(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId)
      .populate('continueListening.trackId', playableTrackFields);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const currentTrack = (user.continueListening || []).find((item) =>
      isAudioAccessibleToUser(item.trackId, userId)
    ) || null;

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
    if (!validTrackId(trackId)) return invalidTrack(res);

    const [user, track] = await Promise.all([
      User.findById(userId),
      findAccessibleAudio(trackId, userId),
    ]);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track is unavailable' }
      });
    }

    const progressPercent = clampProgress(progress, completed === true);
    const isCompleted = completed === true || progressPercent >= 99.5;
    const canonicalDuration = Math.max(0, Number(track.duration) || 0);
    const reportedDuration = Math.max(0, Number(duration) || 0);
    // Client media metadata is useful only as a per-user fallback for legacy
    // records with no duration. A listener must never be able to rewrite or
    // override the creator-owned Audio.duration field.
    const totalDuration = canonicalDuration || reportedDuration;
    const remaining = totalDuration > 0
      ? Math.max(0, totalDuration * (1 - progressPercent / 100))
      : 0;
    const now = new Date();

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
    if (!validTrackId(trackId)) return invalidTrack(res);

    const [user, track] = await Promise.all([
      User.findById(userId),
      findAccessibleAudio(trackId, userId),
    ]);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track is unavailable' }
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

    if (!validTrackId(trackId)) return invalidTrack(res);

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
        select: playableTrackFields,
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
      .filter((item) => isAudioAccessibleToUser(item.trackId, userId))
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
    const safePage = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    const user = await User.findById(userId)
      .populate({
        path: 'listeningHistory.trackId',
        select: playableTrackFields,
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

    const accessibleHistory = user.listeningHistory
      .filter((item) => isAudioAccessibleToUser(item.trackId, userId))
      .sort((a, b) => b.playedAt - a.playedAt);

    const history = accessibleHistory
      .slice(skip, skip + safeLimit)
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

    const total = accessibleHistory.length;

    return res.status(200).json({
      data: {
        history,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.ceil(total / safeLimit),
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

    if (volume !== undefined) {
      const nextVolume = Number(volume);
      if (Number.isFinite(nextVolume)) {
        user.preferences.player.volume = Math.min(1, Math.max(0, nextVolume));
      }
    }
    if (isMuted !== undefined) user.preferences.player.isMuted = Boolean(isMuted);
    if (playbackRate !== undefined) {
      const nextRate = Number(playbackRate);
      if (Number.isFinite(nextRate) && nextRate >= 0.5 && nextRate <= 2) {
        user.preferences.player.playbackRate = nextRate;
      }
    }
    if (isShuffled !== undefined) user.preferences.player.isShuffled = Boolean(isShuffled);
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
