import User from '../models/User.js';
import Audio from '../models/Audio.js';

// Get listening history
export async function getHistory(req, res, next) {
  try {
    const userId = req.userId;
    const { 
      page = 1, 
      limit = 20, 
      type = 'all',
      startDate,
      endDate,
      sort = 'recent'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const user = await User.findById(userId)
      .populate({
        path: 'listeningHistory.trackId',
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

    let history = user.listeningHistory || [];

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      history = history.filter(item => item.playedAt >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      history = history.filter(item => item.playedAt <= end);
    }

    // Filter by type (completed vs in progress)
    if (type === 'completed') {
      history = history.filter(item => item.completed === true);
    } else if (type === 'in-progress') {
      history = history.filter(item => item.completed !== true);
    }

    // Sort
    switch(sort) {
      case 'recent':
        history.sort((a, b) => b.playedAt - a.playedAt);
        break;
      case 'oldest':
        history.sort((a, b) => a.playedAt - b.playedAt);
        break;
      case 'title':
        history.sort((a, b) => (a.trackId?.title || '').localeCompare(b.trackId?.title || ''));
        break;
      default:
        history.sort((a, b) => b.playedAt - a.playedAt);
    }

    const total = history.length;
    const paginated = history.slice(skip, skip + parseInt(limit));

    // Format history items
    const formattedHistory = paginated.map(item => ({
      id: item._id,
      track: item.trackId ? {
        id: item.trackId._id,
        title: item.trackId.title,
        duration: item.trackId.duration,
        genre: item.trackId.genre,
        artist: item.trackId.artist ? {
          id: item.trackId.artist._id,
          username: item.trackId.artist.username,
          displayName: item.trackId.artist.displayName,
          avatar: item.trackId.artist.avatar,
        } : null,
      } : null,
      playedAt: item.playedAt,
      progress: item.progress,
      completed: item.completed,
      duration: item.duration,
    }));

    // Get history stats
    const totalPlays = history.length;
    const completedItems = history.filter(item => item.completed === true).length;
    const totalListeningTime = history.reduce((sum, item) => {
      const duration = item.trackId?.duration || 0;
      const progress = (item.progress || 0) / 100;
      return sum + (duration * progress);
    }, 0);

    return res.status(200).json({
      data: {
        history: formattedHistory,
        stats: {
          totalPlays,
          completedItems,
          totalListeningTime: Math.round(totalListeningTime / 60), // in minutes
        },
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
    console.error('Get history error:', error);
    next(error);
  }
}

// Clear history
export async function clearHistory(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    user.listeningHistory = [];
    await user.save();

    return res.status(200).json({
      data: {
        message: 'History cleared successfully',
        cleared: true,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Clear history error:', error);
    next(error);
  }
}

// Remove single history item
export async function removeHistoryItem(req, res, next) {
  try {
    const userId = req.userId;
    const { historyId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const initialLength = user.listeningHistory.length;
    user.listeningHistory = user.listeningHistory.filter(
      item => item._id.toString() !== historyId
    );

    if (user.listeningHistory.length === initialLength) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'History item not found' }
      });
    }

    await user.save();

    return res.status(200).json({
      data: {
        message: 'History item removed successfully',
        removed: true,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Remove history item error:', error);
    next(error);
  }
}

// Get history stats
export async function getHistoryStats(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const history = user.listeningHistory || [];
    const totalPlays = history.length;
    const completedItems = history.filter(item => item.completed === true).length;
    
    // Get most played tracks
    const trackCount = {};
    history.forEach(item => {
      const trackId = item.trackId?.toString();
      if (trackId) {
        trackCount[trackId] = (trackCount[trackId] || 0) + 1;
      }
    });

    const mostPlayed = Object.entries(trackCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([trackId, count]) => ({ trackId, count }));

    // Get listening by day of week
    const dayCount = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
    history.forEach(item => {
      const day = new Date(item.playedAt).toLocaleDateString('en-US', { weekday: 'long' });
      dayCount[day] = (dayCount[day] || 0) + 1;
    });

    return res.status(200).json({
      data: {
        totalPlays,
        completedItems,
        completionRate: totalPlays > 0 ? Math.round((completedItems / totalPlays) * 100) : 0,
        mostPlayed,
        listeningByDay: Object.entries(dayCount).map(([day, count]) => ({ day, count })),
        totalListeningTime: history.reduce((sum, item) => {
          const duration = item.trackId?.duration || 0;
          const progress = (item.progress || 0) / 100;
          return sum + (duration * progress);
        }, 0),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get history stats error:', error);
    next(error);
  }
}
