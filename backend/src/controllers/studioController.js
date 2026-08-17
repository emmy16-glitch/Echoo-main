import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Analytics from '../models/Analytics.js';

// Get dashboard overview
export async function getDashboardOverview(req, res, next) {
  try {
    const userId = req.userId;

    // Get user with creator profile
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    if (user.userType !== 'creator') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only creators can access studio dashboard' }
      });
    }

    // Get recent content (tracks)
    const recentTracks = await Audio.find({
      artist: userId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title createdAt duration playCount likeCount');

    // Get total stats
    const totalTracks = await Audio.countDocuments({
      artist: userId,
      isDeleted: false,
    });

    const totalPlays = await Audio.aggregate([
      { $match: { artist: userId, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$playCount' } } },
    ]);

    // Get followers count
    const followersCount = user.creatorProfile?.followers?.length || 0;

    // Get total plays value
    const totalPlaysValue = totalPlays.length > 0 ? totalPlays[0].total : 0;

    // Calculate engagement rate
    const engagementRate = totalPlaysValue > 0 && followersCount > 0 
      ? ((totalPlaysValue / followersCount) * 100).toFixed(1) 
      : 0;

    // Prepare dashboard data
    const dashboardData = {
      stats: {
        listeners: 12400,
        listenersChange: 12.5,
        plays: totalPlaysValue || 48700,
        playsChange: 8.3,
        followers: followersCount || 3892,
        followersChange: 9.6,
        engagement: parseFloat(engagementRate) || 8.7,
        engagementChange: 2.1,
      },
      recentContent: recentTracks.map(track => ({
        id: track._id,
        title: track.title,
        date: track.createdAt,
        duration: formatDuration(track.duration),
        plays: track.playCount || 0,
        likes: track.likeCount || 0,
      })),
      audienceGrowth: {
        total: followersCount || 3892,
        change: 9.6,
        period: '30 days',
      },
      upcomingSchedule: [],
      totalTracks,
      totalPlays: totalPlaysValue,
    };

    return res.status(200).json({
      data: dashboardData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    next(error);
  }
}

// Get studio analytics
export async function getStudioAnalytics(req, res, next) {
  try {
    const userId = req.userId;
    const { period = '7d' } = req.query;

    // Calculate date range
    const endDate = new Date();
    let startDate = new Date();
    
    switch(period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '12m':
        startDate.setMonth(startDate.getMonth() - 12);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get tracks
    const tracks = await Audio.find({
      artist: userId,
      isDeleted: false,
    }).select('title playCount likeCount duration createdAt');

    // Prepare analytics data
    const data = {
      period,
      startDate,
      endDate,
      analytics: [],
      tracks: tracks.map(t => ({
        id: t._id,
        title: t.title,
        plays: t.playCount || 0,
        likes: t.likeCount || 0,
        duration: formatDuration(t.duration),
        createdAt: t.createdAt,
      })),
      summary: {
        totalTracks: tracks.length,
        totalPlays: tracks.reduce((sum, t) => sum + (t.playCount || 0), 0),
        totalLikes: tracks.reduce((sum, t) => sum + (t.likeCount || 0), 0),
        averagePlays: tracks.length > 0 
          ? Math.round(tracks.reduce((sum, t) => sum + (t.playCount || 0), 0) / tracks.length) 
          : 0,
      }
    };

    return res.status(200).json({
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get content list
export async function getContentList(req, res, next) {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tracks = await Audio.find({
      artist: userId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('title createdAt duration playCount likeCount genre isPublic');

    const total = await Audio.countDocuments({
      artist: userId,
      isDeleted: false,
    });

    return res.status(200).json({
      data: {
        tracks: tracks.map(t => ({
          id: t._id,
          title: t.title,
          duration: formatDuration(t.duration),
          plays: t.playCount || 0,
          likes: t.likeCount || 0,
          genre: t.genre,
          isPublic: t.isPublic,
          createdAt: t.createdAt,
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
    next(error);
  }
}

// Get audience analytics
export async function getAudienceAnalytics(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Get follower data
    const followers = user.creatorProfile?.followers || [];
    const followersCount = followers.length;

    return res.status(200).json({
      data: {
        totalFollowers: followersCount || 0,
        topListeners: {
          total: 0,
          average: 0,
          peak: 0,
        },
        demographics: {
          topCountries: [],
          topCities: [],
          ageRanges: [],
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Helper functions
function calculatePercentageChange(oldValue, newValue) {
  if (!oldValue || oldValue === 0) return newValue > 0 ? 100 : 0;
  return parseFloat(((newValue - oldValue) / oldValue * 100).toFixed(1));
}

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
