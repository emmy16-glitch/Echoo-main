import mongoose from 'mongoose';
import PlayerQueue from '../models/PlayerQueue.js';
import {
  findAccessibleAudio,
  isAudioAccessibleToUser,
} from '../services/audioAccess.js';

const QUEUE_TRACK_FIELDS =
  'title duration artist genre fileUrl playCount likeCount isPublic isDeleted';

const safeIndex = (value) => Number.parseInt(value, 10);

const invalidTrackId = (res) =>
  res.status(400).json({
    error: { code: 'INVALID_TRACK_ID', message: 'Invalid track ID' },
  });

const formatTrack = (track) => track ? {
  id: track._id,
  title: track.title,
  duration: track.duration,
  artist: track.artist,
  genre: track.genre,
  fileUrl: track.fileUrl,
  playCount: track.playCount,
  likeCount: track.likeCount,
} : null;

const loadQueue = (userId, { populate = false } = {}) => {
  let query = PlayerQueue.findOne({ userId, isActive: true });
  if (populate) {
    query = query.populate('tracks.trackId', QUEUE_TRACK_FIELDS);
  }
  return query;
};

const findNextAccessible = async (queue, userId, direction) => {
  const length = queue.tracks.length;
  if (!length) return null;

  let index = queue.currentIndex;
  let inspected = 0;

  while (inspected < length) {
    index += direction;

    if (index >= length) {
      if (direction > 0 && queue.repeatMode === 'all') index = 0;
      else return null;
    }
    if (index < 0) {
      if (direction < 0 && queue.repeatMode === 'all') index = length - 1;
      else return null;
    }

    inspected += 1;
    const ref = queue.tracks[index]?.trackId;
    if (!ref) continue;

    const track = await findAccessibleAudio(ref, userId, QUEUE_TRACK_FIELDS);
    if (track) return { index, track };
  }

  return null;
};

// Get current queue
export async function getQueue(req, res, next) {
  try {
    const userId = req.userId;

    let queue = await loadQueue(userId, { populate: true });

    if (!queue) {
      queue = new PlayerQueue({ userId });
      await queue.save();
      await queue.populate('tracks.trackId', QUEUE_TRACK_FIELDS);
    }

    const visibleTracks = queue.tracks
      .map((entry, originalIndex) => ({ entry, originalIndex }))
      .filter(({ entry }) => isAudioAccessibleToUser(entry.trackId, userId));

    const currentEntry = queue.tracks[queue.currentIndex] || null;
    const currentTrack = isAudioAccessibleToUser(currentEntry?.trackId, userId)
      ? currentEntry
      : null;

    const nextVisible = visibleTracks.find(
      ({ originalIndex }) => originalIndex > queue.currentIndex
    )?.entry || null;

    return res.status(200).json({
      data: {
        queue: {
          id: queue.id,
          name: queue.name,
          currentIndex: queue.currentIndex,
          shuffle: queue.shuffle,
          repeatMode: queue.repeatMode,
          tracks: visibleTracks.map(({ entry, originalIndex }) => ({
            id: entry.trackId?._id,
            title: entry.trackId?.title,
            duration: entry.trackId?.duration,
            artist: entry.trackId?.artist,
            addedAt: entry.addedAt,
            isCurrent: originalIndex === queue.currentIndex,
          })),
        },
        currentTrack: currentTrack ? formatTrack(currentTrack.trackId) : null,
        nextTrack: nextVisible ? formatTrack(nextVisible.trackId) : null,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get queue error:', error);
    next(error);
  }
}

// Add track to queue
export async function addToQueue(req, res, next) {
  try {
    const userId = req.userId;
    const { trackId, position } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Track ID is required' }
      });
    }
    if (!mongoose.isValidObjectId(trackId)) return invalidTrackId(res);

    const track = await findAccessibleAudio(trackId, userId, '_id');
    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track is unavailable' }
      });
    }

    let queue = await loadQueue(userId);
    if (!queue) queue = new PlayerQueue({ userId });

    const newTrack = {
      trackId,
      addedBy: userId,
    };

    if (position === 'next' && queue.tracks.length > 0) {
      const insertIndex = Math.min(queue.tracks.length, queue.currentIndex + 1);
      queue.tracks.splice(insertIndex, 0, newTrack);
    } else if (position === 'now') {
      const insertIndex = Math.min(queue.tracks.length, queue.currentIndex + 1);
      queue.tracks.splice(insertIndex, 0, newTrack);
      queue.currentIndex = insertIndex;
    } else {
      queue.tracks.push(newTrack);
      if (queue.tracks.length === 1) queue.currentIndex = 0;
    }

    await queue.save();

    return res.status(200).json({
      data: {
        message: 'Track added to queue',
        queueId: queue.id,
        trackCount: queue.tracks.length,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Add to queue error:', error);
    next(error);
  }
}

// Remove track from queue
export async function removeFromQueue(req, res, next) {
  try {
    const userId = req.userId;
    const index = safeIndex(req.params.trackIndex);

    const queue = await loadQueue(userId);
    if (!queue) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Queue not found' }
      });
    }

    if (!Number.isInteger(index) || index < 0 || index >= queue.tracks.length) {
      return res.status(400).json({
        error: { code: 'INVALID_INDEX', message: 'Invalid track index' }
      });
    }

    queue.tracks.splice(index, 1);

    if (!queue.tracks.length) {
      queue.currentIndex = 0;
    } else if (index < queue.currentIndex) {
      queue.currentIndex -= 1;
    } else if (queue.currentIndex >= queue.tracks.length) {
      queue.currentIndex = queue.tracks.length - 1;
    }

    await queue.save();

    return res.status(200).json({
      data: {
        message: 'Track removed from queue',
        trackCount: queue.tracks.length,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Remove track error:', error);
    next(error);
  }
}

// Reorder queue
export async function reorderQueue(req, res, next) {
  try {
    const userId = req.userId;
    const start = safeIndex(req.body.startIndex);
    const end = safeIndex(req.body.endIndex);

    const queue = await loadQueue(userId);
    if (!queue) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Queue not found' }
      });
    }

    if (
      !Number.isInteger(start) || !Number.isInteger(end) ||
      start < 0 || start >= queue.tracks.length ||
      end < 0 || end >= queue.tracks.length
    ) {
      return res.status(400).json({
        error: { code: 'INVALID_INDEX', message: 'Invalid indices' }
      });
    }

    const [movedTrack] = queue.tracks.splice(start, 1);
    queue.tracks.splice(end, 0, movedTrack);

    if (queue.currentIndex === start) {
      queue.currentIndex = end;
    } else if (queue.currentIndex > start && queue.currentIndex <= end) {
      queue.currentIndex -= 1;
    } else if (queue.currentIndex < start && queue.currentIndex >= end) {
      queue.currentIndex += 1;
    }

    await queue.save();

    return res.status(200).json({
      data: {
        message: 'Queue reordered successfully',
        queue,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Reorder queue error:', error);
    next(error);
  }
}

export async function playNext(req, res, next) {
  try {
    const userId = req.userId;
    const queue = await loadQueue(userId);

    if (!queue || queue.tracks.length === 0) {
      return res.status(404).json({
        error: { code: 'NO_TRACKS', message: 'No tracks in queue' }
      });
    }

    const nextTrack = await findNextAccessible(queue, userId, 1);
    if (!nextTrack) {
      return res.status(400).json({
        error: { code: 'END_OF_QUEUE', message: 'No more available tracks in the queue' }
      });
    }

    queue.currentIndex = nextTrack.index;
    await queue.save();

    return res.status(200).json({
      data: {
        currentTrack: formatTrack(nextTrack.track),
        index: queue.currentIndex,
        total: queue.tracks.length,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Play next error:', error);
    next(error);
  }
}

export async function playPrevious(req, res, next) {
  try {
    const userId = req.userId;
    const queue = await loadQueue(userId);

    if (!queue || queue.tracks.length === 0) {
      return res.status(404).json({
        error: { code: 'NO_TRACKS', message: 'No tracks in queue' }
      });
    }

    const previousTrack = await findNextAccessible(queue, userId, -1);
    if (!previousTrack) {
      return res.status(400).json({
        error: { code: 'START_OF_QUEUE', message: 'No previous available track in the queue' }
      });
    }

    queue.currentIndex = previousTrack.index;
    await queue.save();

    return res.status(200).json({
      data: {
        currentTrack: formatTrack(previousTrack.track),
        index: queue.currentIndex,
        total: queue.tracks.length,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Play previous error:', error);
    next(error);
  }
}

export async function clearQueue(req, res, next) {
  try {
    const queue = await loadQueue(req.userId);
    if (!queue) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Queue not found' }
      });
    }

    queue.tracks = [];
    queue.currentIndex = 0;
    await queue.save();

    return res.status(200).json({
      data: { message: 'Queue cleared successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Clear queue error:', error);
    next(error);
  }
}

export async function updatePlayerSettings(req, res, next) {
  try {
    const userId = req.userId;
    const { shuffle, repeatMode } = req.body;

    const queue = await loadQueue(userId);
    if (!queue) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Queue not found' }
      });
    }

    if (shuffle !== undefined) queue.shuffle = Boolean(shuffle);
    if (repeatMode !== undefined) {
      if (!['none', 'one', 'all'].includes(repeatMode)) {
        return res.status(400).json({
          error: { code: 'INVALID_REPEAT_MODE', message: 'repeatMode must be none, one or all' }
        });
      }
      queue.repeatMode = repeatMode;
    }

    await queue.save();

    return res.status(200).json({
      data: {
        shuffle: queue.shuffle,
        repeatMode: queue.repeatMode,
        message: 'Player settings updated',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update player settings error:', error);
    next(error);
  }
}
