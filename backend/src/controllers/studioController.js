import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Analytics from '../models/Analytics.js';
import Follow from '../models/Follow.js';
import Broadcast from '../models/Broadcast.js';

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function periodRange(period = '7d') {
  const endDate = new Date();
  const startDate = new Date(endDate);

  if (period === '30d') startDate.setDate(startDate.getDate() - 30);
  else if (period === '90d') startDate.setDate(startDate.getDate() - 90);
  else if (period === '12m') startDate.setMonth(startDate.getMonth() - 12);
  else startDate.setDate(startDate.getDate() - 7);

  return { startDate, endDate };
}

async function requireCreator(userId, res) {
  const user = await User.findById(userId);

  if (!user) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });
    return null;
  }

  if (user.userType !== 'creator') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Only creators can access Creator Studio',
      },
    });
    return null;
  }

  return user;
}

export async function getDashboardOverview(req, res, next) {
  try {
    const user = await requireCreator(req.userId, res);
    if (!user) return;

    const [
      recentTracks,
      totalTracks,
      playsResult,
      followersCount,
      runningBroadcasts,
      completedBroadcasts,
      upcomingSchedule,
    ] = await Promise.all([
      Audio.find({ artist: req.userId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title createdAt duration playCount likeCount coverArt fileUrl genre isPublic'),
      Audio.countDocuments({ artist: req.userId, isDeleted: false }),
      Audio.aggregate([
        { $match: { artist: user._id, isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$playCount' } } },
      ]),
      Follow.countDocuments({ following: req.userId, status: 'accepted' }),
      Broadcast.find({
        creator: req.userId,
        status: { $in: ['starting', 'live'] },
        isDeleted: false,
      }).select('listenerCount peakListeners status startedAt title'),
      Broadcast.find({
        creator: req.userId,
        status: 'completed',
        isDeleted: false,
      }).select('listenerCount peakListeners startedAt endedAt'),
      Broadcast.find({
        creator: req.userId,
        status: 'scheduled',
        isDeleted: false,
        startTime: { $gte: new Date() },
      })
        .populate('station', 'name coverArt category')
        .sort({ startTime: 1 })
        .limit(8),
    ]);

    const totalPlays = playsResult[0]?.total || 0;
    const liveListeners = runningBroadcasts.reduce(
      (sum, item) => sum + (Number(item.listenerCount) || 0),
      0
    );
    const peakListeners = Math.max(
      0,
      ...runningBroadcasts.map((item) => Number(item.peakListeners) || 0),
      ...completedBroadcasts.map((item) => Number(item.peakListeners) || 0)
    );
    const engagement =
      followersCount > 0
        ? Number(((totalPlays / followersCount) * 100).toFixed(1))
        : 0;

    return res.status(200).json({
      data: {
        stats: {
          listeners: liveListeners,
          listenersChange: 0,
          peakListeners,
          plays: totalPlays,
          playsChange: 0,
          followers: followersCount,
          followersChange: 0,
          engagement,
          engagementChange: 0,
        },
        recentContent: recentTracks.map((track) => ({
          id: track._id,
          title: track.title,
          date: track.createdAt,
          duration: formatDuration(track.duration),
          plays: track.playCount || 0,
          likes: track.likeCount || 0,
          coverArt: track.coverArt,
          fileUrl: track.fileUrl,
          genre: track.genre,
          isPublic: track.isPublic,
        })),
        audienceGrowth: {
          total: followersCount,
          change: 0,
          period: 'current',
        },
        upcomingSchedule,
        activeBroadcasts: runningBroadcasts,
        totalTracks,
        totalPlays,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    next(error);
  }
}

export async function getStudioAnalytics(req, res, next) {
  try {
    const user = await requireCreator(req.userId, res);
    if (!user) return;

    const period = req.query.period || '7d';
    const { startDate, endDate } = periodRange(period);

    const [analytics, tracks, broadcasts] = await Promise.all([
      Analytics.find({
        userId: req.userId,
        date: { $gte: startDate, $lte: endDate },
      }).sort({ date: 1 }),
      Audio.find({
        artist: req.userId,
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .select('title playCount likeCount duration createdAt'),
      Broadcast.find({
        creator: req.userId,
        status: 'completed',
        isDeleted: false,
        endedAt: { $gte: startDate, $lte: endDate },
      })
        .sort({ endedAt: -1 })
        .select('title listenerCount peakListeners startedAt endedAt'),
    ]);

    const summaryFromEvents = analytics.reduce(
      (summary, row) => {
        summary.listeners += Number(row.metrics?.listeners) || 0;
        summary.plays += Number(row.metrics?.plays) || 0;
        summary.followers += Number(row.metrics?.followers) || 0;
        summary.peakListeners = Math.max(
          summary.peakListeners,
          Number(row.metrics?.peakListeners) || 0
        );
        return summary;
      },
      { listeners: 0, plays: 0, followers: 0, peakListeners: 0 }
    );

    const totalTrackPlays = tracks.reduce(
      (sum, track) => sum + (Number(track.playCount) || 0),
      0
    );
    const totalLikes = tracks.reduce(
      (sum, track) => sum + (Number(track.likeCount) || 0),
      0
    );

    return res.status(200).json({
      data: {
        period,
        startDate,
        endDate,
        analytics,
        broadcasts,
        tracks: tracks.map((track) => ({
          id: track._id,
          title: track.title,
          plays: track.playCount || 0,
          likes: track.likeCount || 0,
          duration: formatDuration(track.duration),
          createdAt: track.createdAt,
        })),
        summary: {
          totalTracks: tracks.length,
          totalPlays: totalTrackPlays,
          totalLikes,
          averagePlays:
            tracks.length > 0 ? Math.round(totalTrackPlays / tracks.length) : 0,
          liveListenersInPeriod: summaryFromEvents.listeners,
          peakListeners: Math.max(
            summaryFromEvents.peakListeners,
            ...broadcasts.map((item) => Number(item.peakListeners) || 0),
            0
          ),
          completedBroadcasts: broadcasts.length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getContentList(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { artist: req.userId, isDeleted: false };
    const [tracks, total] = await Promise.all([
      Audio.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          'title description createdAt duration playCount likeCount genre isPublic fileUrl coverArt'
        ),
      Audio.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: {
        tracks: tracks.map((track) => ({
          id: track._id,
          title: track.title,
          description: track.description,
          duration: formatDuration(track.duration),
          plays: track.playCount || 0,
          likes: track.likeCount || 0,
          genre: track.genre,
          isPublic: track.isPublic,
          fileUrl: track.fileUrl,
          coverArt: track.coverArt,
          createdAt: track.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAudienceAnalytics(req, res, next) {
  try {
    const user = await requireCreator(req.userId, res);
    if (!user) return;

    const [follows, completedBroadcasts, liveBroadcasts] = await Promise.all([
      Follow.find({ following: req.userId, status: 'accepted' })
        .populate('follower', 'username displayName avatar bio userType')
        .sort({ createdAt: -1 })
        .limit(100),
      Broadcast.find({
        creator: req.userId,
        status: 'completed',
        isDeleted: false,
      }).select('peakListeners listenerCount startedAt endedAt'),
      Broadcast.find({
        creator: req.userId,
        status: { $in: ['starting', 'live'] },
        isDeleted: false,
      }).select('peakListeners listenerCount startedAt'),
    ]);

    const totalFollowers = follows.length;
    const peak = Math.max(
      0,
      ...completedBroadcasts.map((item) => Number(item.peakListeners) || 0),
      ...liveBroadcasts.map((item) => Number(item.peakListeners) || 0)
    );
    const average =
      completedBroadcasts.length > 0
        ? Math.round(
            completedBroadcasts.reduce(
              (sum, item) => sum + (Number(item.peakListeners) || 0),
              0
            ) / completedBroadcasts.length
          )
        : 0;
    const liveNow = liveBroadcasts.reduce(
      (sum, item) => sum + (Number(item.listenerCount) || 0),
      0
    );

    return res.status(200).json({
      data: {
        totalFollowers,
        followers: follows
          .map((item) => item.follower)
          .filter(Boolean),
        topListeners: {
          total: liveNow,
          average,
          peak,
        },
        demographics: {
          topCountries: [],
          topCities: [],
          ageRanges: [],
        },
        dataAvailability: {
          demographics: false,
          reason: 'Echoo does not collect audience location/age demographics yet.',
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
