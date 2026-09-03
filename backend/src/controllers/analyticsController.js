import Analytics from '../models/Analytics.js';
import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Follow from '../models/Follow.js';
import Broadcast from '../models/Broadcast.js';
import ChatMessage from '../models/ChatMessage.js';
import TranscriptSegment from '../models/TranscriptSegment.js';

const periodDates = (period = '30d') => {
  const endDate = new Date();
  const startDate = new Date(endDate);

  switch (period) {
    case 'all':
      startDate.setTime(0);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    case '12m':
      startDate.setMonth(startDate.getMonth() - 12);
      break;
    case '30d':
    default:
      startDate.setDate(startDate.getDate() - 30);
      break;
  }

  const durationMs = endDate.getTime() - startDate.getTime();
  const previousEnd = new Date(startDate);
  const previousStart = new Date(previousEnd.getTime() - durationMs);

  return { startDate, endDate, previousStart, previousEnd };
};

const percentChange = (current, previous) => {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (previousValue <= 0) return 0;
  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
};

const recordedAnalytics = async (userId, startDate, endDate) =>
  Analytics.find({
    userId,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });

const analyticsTotals = (rows) => {
  const totalListeners = rows.reduce(
    (sum, row) => sum + (Number(row.metrics?.listeners) || 0),
    0
  );
  const averageListeners = rows.length
    ? Math.round(totalListeners / rows.length)
    : 0;
  const peakListeners = rows.reduce(
    (maximum, row) => Math.max(maximum, Number(row.metrics?.peakListeners) || 0),
    0
  );
  const returningListeners = rows.reduce(
    (sum, row) => sum + (Number(row.metrics?.returningListeners) || 0),
    0
  );
  const newListeners = rows.reduce(
    (sum, row) => sum + (Number(row.metrics?.newListeners) || 0),
    0
  );
  const engagementValues = rows
    .map((row) => Number(row.metrics?.engagement))
    .filter((value) => Number.isFinite(value) && value > 0);
  const averageListenDuration = rows.length
    ? Math.round(
        rows.reduce(
          (sum, row) => sum + (Number(row.metrics?.avgListenDuration) || 0),
          0
        ) / rows.length
      )
    : 0;

  return {
    totalListeners,
    averageListeners,
    peakListeners,
    returningListeners,
    newListeners,
    averageListenDuration,
    engagementRate: engagementValues.length
      ? Number(
          (
            engagementValues.reduce((sum, value) => sum + value, 0) /
            engagementValues.length
          ).toFixed(1)
        )
      : 0,
  };
};

const getFollowerGrowth = async (userId, startDate, endDate) => {
  const follows = await Follow.find({
    following: userId,
    status: 'accepted',
    createdAt: { $lte: endDate },
  })
    .sort({ createdAt: 1 })
    .select('createdAt');

  const beforePeriod = follows.filter((follow) => follow.createdAt < startDate).length;
  const byDay = new Map();

  follows.forEach((follow) => {
    if (follow.createdAt < startDate || follow.createdAt > endDate) return;
    const day = follow.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  });

  const data = [];
  let runningTotal = beforePeriod;
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const finalDay = new Date(endDate);
  finalDay.setHours(0, 0, 0, 0);

  while (cursor <= finalDay) {
    const day = cursor.toISOString().slice(0, 10);
    runningTotal += byDay.get(day) || 0;
    data.push({ date: day, count: runningTotal });
    cursor.setDate(cursor.getDate() + 1);
  }

  const first = data[0]?.count ?? beforePeriod;
  const last = data[data.length - 1]?.count ?? beforePeriod;

  return {
    data,
    change: percentChange(last, first),
    newFollowers: Math.max(0, last - beforePeriod),
  };
};

export async function getAnalyticsOverview(req, res, next) {
  try {
    const userId = req.userId;
    const period = req.query.period || '30d';
    const { startDate, endDate, previousStart, previousEnd } = periodDates(period);

    const user = await User.findById(userId).select('_id userType');
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const [
      totalFollowers,
      totalTracks,
      totalPlaysResult,
      analytics,
      previousAnalytics,
      topTracks,
      recentBroadcasts,
      followerGrowth,
      currentPeriodFollows,
      previousPeriodFollows,
    ] = await Promise.all([
      Follow.countDocuments({ following: userId, status: 'accepted' }),
      Audio.countDocuments({ artist: userId, isDeleted: false }),
      Audio.aggregate([
        { $match: { artist: user._id, isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$playCount' } } },
      ]),
      recordedAnalytics(userId, startDate, endDate),
      recordedAnalytics(userId, previousStart, previousEnd),
      Audio.find({ artist: userId, isDeleted: false })
        .sort({ playCount: -1, createdAt: -1 })
        .limit(5)
        .select('title playCount likeCount duration'),
      Broadcast.find({ creator: userId, isDeleted: false })
        .sort({ startTime: -1 })
        .limit(5)
        .select('title startTime listenerCount peakListeners status'),
      getFollowerGrowth(userId, startDate, endDate),
      Follow.countDocuments({
        following: userId,
        status: 'accepted',
        createdAt: { $gte: startDate, $lte: endDate },
      }),
      Follow.countDocuments({
        following: userId,
        status: 'accepted',
        createdAt: { $gte: previousStart, $lt: previousEnd },
      }),
    ]);

    const current = analyticsTotals(analytics);
    const previous = analyticsTotals(previousAnalytics);
    const totalPlays = Number(totalPlaysResult?.[0]?.total) || 0;

    return res.status(200).json({
      data: {
        overview: {
          totalListeners: current.totalListeners,
          avgListeners: current.averageListeners,
          peakListeners: current.peakListeners,
          totalFollowers,
          totalPlays,
          totalTracks,
          engagementRate: current.engagementRate,
          averageListenDuration: current.averageListenDuration,
          followerGrowth,
        },
        changes: {
          listeners: percentChange(
            current.averageListeners,
            previous.averageListeners
          ),
          followers: percentChange(currentPeriodFollows, previousPeriodFollows),
          plays: 0,
          engagement: percentChange(
            current.engagementRate,
            previous.engagementRate
          ),
        },
        topTracks: topTracks.map((track) => ({
          id: track._id,
          title: track.title,
          plays: track.playCount || 0,
          likes: track.likeCount || 0,
          duration: formatDuration(track.duration),
        })),
        recentActivity: recentBroadcasts.map((broadcast) => ({
          id: broadcast._id,
          title: broadcast.title,
          startTime: broadcast.startTime,
          listeners: broadcast.listenerCount || 0,
          peakListeners: broadcast.peakListeners || 0,
          status: broadcast.status,
        })),
        // Analytics stores listener snapshots and new-listener counts, but no
        // leave-event stream. Expose only these measured series so Creator
        // surfaces never infer departures from aggregate totals.
        listenerActivity: analytics.map((row) => ({
          date: row.date,
          listeners: Number(row.metrics?.listeners) || 0,
          newListeners: Number(row.metrics?.newListeners) || 0,
        })),
        availability: {
          listenerTimeSeries: analytics.length > 0,
          followerTimeSeries: true,
          playChange: false,
          note:
            analytics.length > 0
              ? null
              : 'Listener trend data will appear after completed broadcasts create analytics records.',
        },
        period,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    next(error);
  }
}

export async function getLiveBroadcastAnalytics(req, res, next) {
  try {
    const broadcast = await Broadcast.findOne({
      _id: req.params.broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).select('_id status listenerCount peakListeners listenerSeconds startedAt');
    if (!broadcast) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Broadcast not found' } });
    }
    const [chatMessages, uniqueChatters, transcriptTotals] = await Promise.all([
      ChatMessage.countDocuments({ broadcastId: broadcast._id, isDeleted: false }),
      ChatMessage.distinct('userId', { broadcastId: broadcast._id, isDeleted: false }),
      TranscriptSegment.aggregate([
        { $match: { broadcastId: broadcast._id, isFinal: true } },
        { $group: { _id: null, words: { $sum: { $size: { $split: ['$text', ' '] } } }, segments: { $sum: 1 } } },
      ]),
    ]);
    const audienceBase = Math.max(1, Number(broadcast.peakListeners) || Number(broadcast.listenerCount) || 1);
    const engagementRate = Number(Math.min(100, (uniqueChatters.length / audienceBase) * 100).toFixed(1));
    return res.status(200).json({
      data: {
        currentListeners: Number(broadcast.listenerCount) || 0,
        peakListeners: Number(broadcast.peakListeners) || 0,
        totalListeningSeconds: Number(broadcast.listenerSeconds) || 0,
        chatMessages,
        uniqueChatters: uniqueChatters.length,
        engagementRate,
        transcriptWords: Number(transcriptTotals[0]?.words) || 0,
        transcriptSegments: Number(transcriptTotals[0]?.segments) || 0,
        status: broadcast.status,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAudienceAnalytics(req, res, next) {
  try {
    const userId = req.userId;
    const period = req.query.period || '30d';
    const { startDate, endDate, previousStart, previousEnd } = periodDates(period);

    const user = await User.findById(userId).select('_id');
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const [
      totalFollowers,
      analytics,
      previousAnalytics,
      currentPeriodFollows,
      previousPeriodFollows,
      recentFollowRecords,
    ] = await Promise.all([
      Follow.countDocuments({ following: userId, status: 'accepted' }),
      recordedAnalytics(userId, startDate, endDate),
      recordedAnalytics(userId, previousStart, previousEnd),
      Follow.countDocuments({
        following: userId,
        status: 'accepted',
        createdAt: { $gte: startDate, $lte: endDate },
      }),
      Follow.countDocuments({
        following: userId,
        status: 'accepted',
        createdAt: { $gte: previousStart, $lt: previousEnd },
      }),
      Follow.find({ following: userId, status: 'accepted' })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('follower', 'username displayName avatar')
        .select('follower createdAt'),
    ]);

    const current = analyticsTotals(analytics);
    const previous = analyticsTotals(previousAnalytics);

    return res.status(200).json({
      data: {
        followers: {
          total: totalFollowers,
          change: percentChange(currentPeriodFollows, previousPeriodFollows),
          addedThisPeriod: currentPeriodFollows,
        },
        activeListeners: {
          total: current.averageListeners,
          change: percentChange(
            current.averageListeners,
            previous.averageListeners
          ),
        },
        returningListeners: {
          total: current.returningListeners,
          change: percentChange(
            current.returningListeners,
            previous.returningListeners
          ),
        },
        newListeners: {
          total: current.newListeners,
          change: percentChange(current.newListeners, previous.newListeners),
        },
        engagementRate: {
          rate: current.engagementRate,
          change: percentChange(
            current.engagementRate,
            previous.engagementRate
          ),
        },
        recentFollowers: recentFollowRecords
          .filter((record) => record.follower)
          .map((record) => ({
            id: record.follower._id,
            username: record.follower.username,
            displayName: record.follower.displayName,
            avatar: record.follower.avatar,
            followedAt: record.createdAt,
          })),
        growth: {
          listeners: current.averageListeners,
          followers: totalFollowers,
        },
        segments: [],
        topLocations: [],
        listeningPatterns: [],
        listeningTime: null,
        availability: {
          segments: false,
          locations: false,
          listeningPatterns: false,
          listeningTime: false,
          message:
            'Echoo does not yet collect demographic, location, or listening-pattern analytics. No estimated data is shown.',
        },
        period,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Audience analytics error:', error);
    next(error);
  }
}

export async function getContentAnalytics(req, res, next) {
  try {
    const userId = req.userId;
    const period = req.query.period || '30d';
    const { startDate, endDate } = periodDates(period);

    const [tracks, broadcasts] = await Promise.all([
      Audio.find({ artist: userId, isDeleted: false })
        .sort({ createdAt: -1 })
        .select('title playCount likeCount duration createdAt'),
      Broadcast.find({
        creator: userId,
        isDeleted: false,
        startTime: { $gte: startDate, $lte: endDate },
      })
        .sort({ startTime: -1 })
        .limit(20)
        .select('title startTime listenerCount peakListeners status type recordingUrl replayAudio')
        .populate('replayAudio', 'fileUrl isDeleted'),
    ]);

    const totalTracks = tracks.length;
    const totalPlays = tracks.reduce(
      (sum, track) => sum + (Number(track.playCount) || 0),
      0
    );
    const totalLikes = tracks.reduce(
      (sum, track) => sum + (Number(track.likeCount) || 0),
      0
    );
    const avgPlays = totalTracks > 0 ? Math.round(totalPlays / totalTracks) : 0;

    const topTracks = [...tracks]
      .sort((first, second) =>
        (Number(second.playCount) || 0) - (Number(first.playCount) || 0)
      )
      .slice(0, 5)
      .map((track) => ({
        id: track._id,
        title: track.title,
        plays: track.playCount || 0,
        likes: track.likeCount || 0,
        duration: formatDuration(track.duration),
        createdAt: track.createdAt,
      }));

    return res.status(200).json({
      data: {
        summary: {
          totalTracks,
          totalPlays,
          totalLikes,
          avgPlays,
        },
        topTracks,
        contentByType: {
          tracks: {
            count: totalTracks,
            plays: totalPlays,
            likes: totalLikes,
            avgPlays,
          },
          broadcasts: {
            count: broadcasts.length,
            totalListeners: broadcasts.reduce(
              (sum, broadcast) => sum + (Number(broadcast.listenerCount) || 0),
              0
            ),
            peakListeners: broadcasts.reduce(
              (maximum, broadcast) =>
                Math.max(maximum, Number(broadcast.peakListeners) || 0),
              0
            ),
            live: broadcasts.filter((broadcast) => broadcast.status === 'live').length,
            completed: broadcasts.filter(
              (broadcast) => broadcast.status === 'completed'
            ).length,
          },
        },
        recentBroadcasts: broadcasts.map((broadcast) => ({
          id: broadcast._id,
          title: broadcast.title,
          startTime: broadcast.startTime,
          listeners: broadcast.listenerCount || 0,
          peakListeners: broadcast.peakListeners || 0,
          status: broadcast.status,
          type: broadcast.type,
          replayUrl:
            broadcast.recordingUrl ||
            (broadcast.replayAudio && !broadcast.replayAudio.isDeleted
              ? broadcast.replayAudio.fileUrl
              : null),
        })),
        availability: {
          trackCountersAreCumulative: true,
          broadcastWindow: period,
          message:
            'Track play and like counters are cumulative. Broadcast rows are filtered to the selected period.',
        },
        period,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Content analytics error:', error);
    next(error);
  }
}

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
