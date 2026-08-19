import User from '../models/User.js';
import { isAudioAccessibleToUser } from '../services/audioAccess.js';

const clampProgress = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
};

const historyPopulate = {
  path: 'listeningHistory.trackId',
  select: 'title duration genre fileUrl coverArt artist isDeleted isPublic',
  populate: {
    path: 'artist',
    select: 'username displayName avatar',
  },
};

const listeningSeconds = (history = []) =>
  history.reduce((sum, item) => {
    const duration = Number(item.trackId?.duration) || 0;
    const progress = clampProgress(item.progress) / 100;
    return sum + duration * progress;
  }, 0);

const accessibleHistory = (history, userId) =>
  (history || []).filter((item) =>
    isAudioAccessibleToUser(item.trackId, userId)
  );

export async function getHistory(req, res, next) {
  try {
    const userId = req.userId;
    const {
      page = 1,
      limit = 20,
      type = 'all',
      startDate,
      endDate,
      sort = 'recent',
    } = req.query;

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    const user = await User.findById(userId).populate(historyPopulate);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    // Visibility is evaluated at read time. If a creator unpublishes/deletes a
    // track, stale listening-history metadata cannot keep surfacing it.
    let history = accessibleHistory(user.listeningHistory, userId);

    if (startDate) {
      const start = new Date(startDate);
      if (!Number.isNaN(start.getTime())) {
        history = history.filter((item) => item.playedAt >= start);
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!Number.isNaN(end.getTime())) {
        history = history.filter((item) => item.playedAt <= end);
      }
    }

    if (type === 'completed') {
      history = history.filter((item) => item.completed === true);
    } else if (type === 'in-progress') {
      history = history.filter((item) => item.completed !== true);
    }

    switch (sort) {
      case 'oldest':
        history.sort((a, b) => a.playedAt - b.playedAt);
        break;
      case 'title':
        history.sort((a, b) =>
          (a.trackId?.title || '').localeCompare(b.trackId?.title || '')
        );
        break;
      case 'recent':
      default:
        history.sort((a, b) => b.playedAt - a.playedAt);
        break;
    }

    const total = history.length;
    const paginated = history.slice(skip, skip + safeLimit);

    const formattedHistory = paginated.map((item) => ({
      id: item._id,
      track: item.trackId ? {
        id: item.trackId._id,
        title: item.trackId.title,
        duration: item.trackId.duration,
        genre: item.trackId.genre,
        fileUrl: item.trackId.fileUrl,
        coverArt: item.trackId.coverArt,
        artist: item.trackId.artist ? {
          id: item.trackId.artist._id,
          username: item.trackId.artist.username,
          displayName: item.trackId.artist.displayName,
          avatar: item.trackId.artist.avatar,
        } : null,
      } : null,
      playedAt: item.playedAt,
      progress: clampProgress(item.progress),
      completed: Boolean(item.completed),
    }));

    const completedItems = history.filter((item) => item.completed === true).length;
    const totalListeningTime = listeningSeconds(history);

    return res.status(200).json({
      data: {
        history: formattedHistory,
        stats: {
          totalPlays: total,
          completedItems,
          totalListeningTime: Math.round(totalListeningTime),
        },
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.ceil(total / safeLimit),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get history error:', error);
    next(error);
  }
}

export async function clearHistory(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    user.listeningHistory = [];
    await user.save();

    return res.status(200).json({
      data: {
        message: 'History cleared successfully',
        cleared: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Clear history error:', error);
    next(error);
  }
}

export async function removeHistoryItem(req, res, next) {
  try {
    const { historyId } = req.params;
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const initialLength = user.listeningHistory.length;
    user.listeningHistory = user.listeningHistory.filter(
      (item) => String(item._id) !== String(historyId)
    );

    if (user.listeningHistory.length === initialLength) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'History item not found' },
      });
    }

    await user.save();

    return res.status(200).json({
      data: {
        message: 'History item removed successfully',
        removed: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Remove history item error:', error);
    next(error);
  }
}

export async function getHistoryStats(req, res, next) {
  try {
    const user = await User.findById(req.userId).populate(historyPopulate);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const history = accessibleHistory(user.listeningHistory, req.userId);
    const totalPlays = history.length;
    const completedItems = history.filter((item) => item.completed === true).length;

    const trackCount = {};
    history.forEach((item) => {
      const trackId = item.trackId?._id || item.trackId;
      if (trackId) {
        const key = String(trackId);
        trackCount[key] = (trackCount[key] || 0) + 1;
      }
    });

    const mostPlayed = Object.entries(trackCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([trackId, count]) => ({ trackId, count }));

    const dayCount = {
      Sunday: 0,
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
      Saturday: 0,
    };

    history.forEach((item) => {
      const day = new Date(item.playedAt).toLocaleDateString('en-US', {
        weekday: 'long',
      });
      dayCount[day] = (dayCount[day] || 0) + 1;
    });

    return res.status(200).json({
      data: {
        totalPlays,
        completedItems,
        completionRate:
          totalPlays > 0 ? Math.round((completedItems / totalPlays) * 100) : 0,
        mostPlayed,
        listeningByDay: Object.entries(dayCount).map(([day, count]) => ({
          day,
          count,
        })),
        totalListeningTime: Math.round(listeningSeconds(history)),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get history stats error:', error);
    next(error);
  }
}
