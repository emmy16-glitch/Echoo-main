import PlayerQueue from '../models/PlayerQueue.js';
import Audio from '../models/Audio.js';
import User from '../models/User.js';

// Get current queue
export async function getQueue(req, res, next) {
  try {
    const userId = req.userId;

    let queue = await PlayerQueue.findOne({ userId, isActive: true })
      .populate('tracks.trackId', 'title duration artist genre fileUrl playCount likeCount');

    if (!queue) {
      // Create empty queue
      queue = new PlayerQueue({ userId });
      await queue.save();
    }

    // Get current track
    const currentTrack = queue.tracks[queue.currentIndex] || null;

    // Get next track
    const nextTrack = queue.tracks[queue.currentIndex + 1] || null;

    return res.status(200).json({
      data: {
        queue: {
          id: queue.id,
          name: queue.name,
          currentIndex: queue.currentIndex,
          shuffle: queue.shuffle,
          repeatMode: queue.repeatMode,
          tracks: queue.tracks.map((t, index) => ({
            id: t.trackId?._id,
            title: t.trackId?.title,
            duration: t.trackId?.duration,
            artist: t.trackId?.artist,
            addedAt: t.addedAt,
            isCurrent: index === queue.currentIndex,
          })),
        },
        currentTrack: currentTrack ? {
          id: currentTrack.trackId?._id,
          title: currentTrack.trackId?.title,
          duration: currentTrack.trackId?.duration,
          artist: currentTrack.trackId?.artist,
          fileUrl: currentTrack.trackId?.fileUrl,
          playCount: currentTrack.trackId?.playCount,
          likeCount: currentTrack.trackId?.likeCount,
        } : null,
        nextTrack: nextTrack ? {
          id: nextTrack.trackId?._id,
          title: nextTrack.trackId?.title,
          duration: nextTrack.trackId?.duration,
          artist: nextTrack.trackId?.artist,
        } : null,
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

    // Check if track exists
    const track = await Audio.findById(trackId);
    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track not found' }
      });
    }

    let queue = await PlayerQueue.findOne({ userId, isActive: true });
    if (!queue) {
      queue = new PlayerQueue({ userId });
    }

    const newTrack = {
      trackId,
      addedBy: userId,
    };

    if (position === 'next' && queue.tracks.length > 0) {
      // Add after current track
      const insertIndex = queue.currentIndex + 1;
      queue.tracks.splice(insertIndex, 0, newTrack);
    } else if (position === 'now') {
      // Add as next and shift current index
      queue.tracks.splice(queue.currentIndex + 1, 0, newTrack);
      queue.currentIndex += 1;
    } else {
      // Add to end
      queue.tracks.push(newTrack);
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
    const { trackIndex } = req.params;

    const queue = await PlayerQueue.findOne({ userId, isActive: true });
    if (!queue) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Queue not found' }
      });
    }

    const index = parseInt(trackIndex);
    if (index < 0 || index >= queue.tracks.length) {
      return res.status(400).json({
        error: { code: 'INVALID_INDEX', message: 'Invalid track index' }
      });
    }

    queue.tracks.splice(index, 1);
    if (queue.currentIndex >= queue.tracks.length) {
      queue.currentIndex = Math.max(0, queue.tracks.length - 1);
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
    console.error('Remove from queue error:', error);
    next(error);
  }
}

// Reorder queue
export async function reorderQueue(req, res, next) {
  try {
    const userId = req.userId;
    const { startIndex, endIndex } = req.body;

    const queue = await PlayerQueue.findOne({ userId, isActive: true });
    if (!queue) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Queue not found' }
      });
    }

    const start = parseInt(startIndex);
    const end = parseInt(endIndex);

    if (start < 0 || start >= queue.tracks.length || end < 0 || end >= queue.tracks.length) {
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
        queue: queue,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Reorder queue error:', error);
    next(error);
  }
}

// Play next track
export async function playNext(req, res, next) {
  try {
    const userId = req.userId;

    const queue = await PlayerQueue.findOne({ userId, isActive: true });
    if (!queue || queue.tracks.length === 0) {
      return res.status(404).json({
        error: { code: 'NO_TRACKS', message: 'No tracks in queue' }
      });
    }

    if (queue.currentIndex < queue.tracks.length - 1) {
      queue.currentIndex += 1;
    } else if (queue.repeatMode === 'all') {
      queue.currentIndex = 0;
    } else {
      return res.status(400).json({
        error: { code: 'END_OF_QUEUE', message: 'End of queue reached' }
      });
    }

    await queue.save();

    const currentTrack = queue.tracks[queue.currentIndex];
    await currentTrack.trackId.populate('title duration artist genre');

    return res.status(200).json({
      data: {
        currentTrack: {
          id: currentTrack.trackId._id,
          title: currentTrack.trackId.title,
          duration: currentTrack.trackId.duration,
          artist: currentTrack.trackId.artist,
        },
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

// Play previous track
export async function playPrevious(req, res, next) {
  try {
    const userId = req.userId;

    const queue = await PlayerQueue.findOne({ userId, isActive: true });
    if (!queue || queue.tracks.length === 0) {
      return res.status(404).json({
        error: { code: 'NO_TRACKS', message: 'No tracks in queue' }
      });
    }

    if (queue.currentIndex > 0) {
      queue.currentIndex -= 1;
    } else {
      return res.status(400).json({
        error: { code: 'START_OF_QUEUE', message: 'Start of queue reached' }
      });
    }

    await queue.save();

    const currentTrack = queue.tracks[queue.currentIndex];
    await currentTrack.trackId.populate('title duration artist genre');

    return res.status(200).json({
      data: {
        currentTrack: {
          id: currentTrack.trackId._id,
          title: currentTrack.trackId.title,
          duration: currentTrack.trackId.duration,
          artist: currentTrack.trackId.artist,
        },
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

// Clear queue
export async function clearQueue(req, res, next) {
  try {
    const userId = req.userId;

    const queue = await PlayerQueue.findOne({ userId, isActive: true });
    if (!queue) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Queue not found' }
      });
    }

    queue.tracks = [];
    queue.currentIndex = 0;
    await queue.save();

    return res.status(200).json({
      data: {
        message: 'Queue cleared successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Clear queue error:', error);
    next(error);
  }
}

// Update player settings
export async function updatePlayerSettings(req, res, next) {
  try {
    const userId = req.userId;
    const { shuffle, repeatMode } = req.body;

    const queue = await PlayerQueue.findOne({ userId, isActive: true });
    if (!queue) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Queue not found' }
      });
    }

    if (shuffle !== undefined) queue.shuffle = shuffle;
    if (repeatMode) queue.repeatMode = repeatMode;

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
