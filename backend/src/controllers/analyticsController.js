import Analytics from '../models/Analytics.js';
import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Follow from '../models/Follow.js';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';

// Get creator analytics overview
export async function getAnalyticsOverview(req, res, next) {
  try {
    const userId = req.userId;
    const { period = '30d' } = req.query;

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
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Get total followers
    const totalFollowers = user.creatorProfile?.followers?.length || 0;

    // Get total tracks and plays
    const totalTracks = await Audio.countDocuments({
      artist: userId,
      isDeleted: false,
    });

    const totalPlaysResult = await Audio.aggregate([
      { $match: { artist: userId, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$playCount' } } },
    ]);
    const totalPlays = totalPlaysResult.length > 0 ? totalPlaysResult[0].total : 0;

    // Get analytics data from database
    const analytics = await Analytics.find({
      userId,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });

    // Calculate metrics
    const totalListeners = analytics.reduce((sum, a) => sum + a.metrics.listeners, 0);
    const avgListeners = analytics.length > 0 ? Math.round(totalListeners / analytics.length) : 0;
    const peakListeners = analytics.reduce((max, a) => Math.max(max, a.metrics.peakListeners || 0), 0);

    // Get previous period for comparison
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - parseInt(period.replace('d', '')));
    
    const prevAnalytics = await Analytics.find({
      userId,
      date: { $gte: prevStartDate, $lt: startDate },
    });

    const prevTotalListeners = prevAnalytics.reduce((sum, a) => sum + a.metrics.listeners, 0);
    const prevListeners = prevAnalytics.length > 0 ? Math.round(prevTotalListeners / prevAnalytics.length) : 0;

    // Get engagement rate
    const engagementRate = totalFollowers > 0 && totalPlays > 0 
      ? parseFloat(((totalPlays / totalFollowers) * 100).toFixed(1))
      : 0;

    const prevEngagementRate = prevAnalytics.reduce((sum, a) => sum + (a.metrics.engagement || 0), 0) / (prevAnalytics.length || 1);

    // Get top tracks
    const topTracks = await Audio.find({
      artist: userId,
      isDeleted: false,
    })
      .sort({ playCount: -1 })
      .limit(5)
      .select('title playCount likeCount duration');

    // Get recent activity
    const recentBroadcasts = await Broadcast.find({
      creator: userId,
      isDeleted: false,
    })
      .sort({ startTime: -1 })
      .limit(5)
      .select('title startTime listenerCount status');

    // Get follower growth data
    const followerData = await getFollowerGrowth(userId, startDate, endDate);

    return res.status(200).json({
      data: {
        overview: {
          totalListeners: totalListeners || 0,
          avgListeners: avgListeners || 0,
          peakListeners: peakListeners || 0,
          totalFollowers: totalFollowers || 0,
          totalPlays: totalPlays || 0,
          totalTracks: totalTracks || 0,
          engagementRate: engagementRate || 0,
          followerGrowth: followerData,
        },
        changes: {
          listeners: prevListeners > 0 
            ? parseFloat(((avgListeners - prevListeners) / prevListeners * 100).toFixed(1))
            : 0,
          followers: followerData.change || 0,
          plays: 0,
          engagement: prevEngagementRate > 0
            ? parseFloat(((engagementRate - prevEngagementRate) / prevEngagementRate * 100).toFixed(1))
            : 0,
        },
        topTracks: topTracks.map(track => ({
          id: track._id,
          title: track.title,
          plays: track.playCount || 0,
          likes: track.likeCount || 0,
          duration: formatDuration(track.duration),
        })),
        recentActivity: recentBroadcasts.map(b => ({
          id: b._id,
          title: b.title,
          startTime: b.startTime,
          listeners: b.listenerCount || 0,
          status: b.status,
        })),
        period,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    next(error);
  }
}

// Get audience analytics
export async function getAudienceAnalytics(req, res, next) {
  try {
    const userId = req.userId;
    const { period = '30d' } = req.query;

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
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Get followers list
    const followers = user.creatorProfile?.followers || [];
    const totalFollowers = followers.length;

    // Get analytics data
    const analytics = await Analytics.find({
      userId,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });

    // Calculate audience metrics
    const totalListeners = analytics.reduce((sum, a) => sum + a.metrics.listeners, 0);
    const avgListeners = analytics.length > 0 ? Math.round(totalListeners / analytics.length) : 0;
    const peakListeners = analytics.reduce((max, a) => Math.max(max, a.metrics.peakListeners || 0), 0);
    
    // Calculate returning listeners (simplified)
    const returningListeners = analytics.reduce((sum, a) => sum + (a.metrics.returningListeners || 0), 0);
    const newListeners = analytics.reduce((sum, a) => sum + (a.metrics.newListeners || 0), 0);

    // Get segments (mock data for now - would come from real analytics)
    const segments = [
      { name: 'Chill & Relax', count: Math.round(totalFollowers * 0.38), percentage: 38 },
      { name: 'Deep Focus', count: Math.round(totalFollowers * 0.26), percentage: 26 },
      { name: 'Live Session Fans', count: Math.round(totalFollowers * 0.18), percentage: 18 },
      { name: 'Podcast Listeners', count: Math.round(totalFollowers * 0.10), percentage: 10 },
      { name: 'New Listeners', count: Math.round(totalFollowers * 0.08), percentage: 8 },
    ];

    // Get top locations (mock data)
    const topLocations = [
      { city: 'Lagos', country: 'Nigeria', count: Math.round(totalListeners * 0.28), percentage: 28 },
      { city: 'London', country: 'United Kingdom', count: Math.round(totalListeners * 0.16), percentage: 16 },
      { city: 'New York', country: 'USA', count: Math.round(totalListeners * 0.12), percentage: 12 },
      { city: 'Accra', country: 'Ghana', count: Math.round(totalListeners * 0.08), percentage: 8 },
      { city: 'Nairobi', country: 'Kenya', count: Math.round(totalListeners * 0.06), percentage: 6 },
    ];

    // Get recent followers
    const recentFollowers = await User.find({
      _id: { $in: followers.slice(-5) },
    }).select('username displayName avatar');

    // Get listening patterns (mock data for now)
    const listeningPatterns = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => ({
      day,
      value: Math.floor(Math.random() * 80) + 20,
    }));

    return res.status(200).json({
      data: {
        followers: {
          total: totalFollowers,
          change: 15.3, // Mock change percentage
        },
        activeListeners: {
          total: avgListeners,
          change: 8.7,
        },
        returningListeners: {
          total: returningListeners,
          change: 5.2,
        },
        engagementRate: {
          rate: 6.4,
          change: 2.1,
        },
        segments,
        topLocations,
        recentFollowers: recentFollowers.map(f => ({
          id: f._id,
          username: f.username,
          displayName: f.displayName,
          avatar: f.avatar,
        })),
        listeningPatterns,
        listeningTime: {
          average: 120, // minutes
          change: 12.5,
        },
        growth: {
          listeners: avgListeners,
          followers: totalFollowers,
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Audience analytics error:', error);
    next(error);
  }
}

// Get content analytics
export async function getContentAnalytics(req, res, next) {
  try {
    const userId = req.userId;
    const { period = '30d' } = req.query;

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
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get all tracks
    const tracks = await Audio.find({
      artist: userId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .select('title playCount likeCount duration createdAt');

    // Get broadcasts
    const broadcasts = await Broadcast.find({
      creator: userId,
      isDeleted: false,
    })
      .sort({ startTime: -1 })
      .limit(10)
      .select('title startTime listenerCount status type');

    // Calculate totals
    const totalTracks = tracks.length;
    const totalPlays = tracks.reduce((sum, t) => sum + (t.playCount || 0), 0);
    const totalLikes = tracks.reduce((sum, t) => sum + (t.likeCount || 0), 0);
    const avgPlays = totalTracks > 0 ? Math.round(totalPlays / totalTracks) : 0;

    // Top performing tracks
    const topTracks = [...tracks]
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, 5)
      .map(track => ({
        id: track._id,
        title: track.title,
        plays: track.playCount || 0,
        likes: track.likeCount || 0,
        duration: formatDuration(track.duration),
        createdAt: track.createdAt,
      }));

    // Content performance by type
    const contentByType = {
      tracks: {
        count: totalTracks,
        plays: totalPlays,
        likes: totalLikes,
        avgPlays,
      },
      broadcasts: {
        count: broadcasts.length,
        totalListeners: broadcasts.reduce((sum, b) => sum + (b.listenerCount || 0), 0),
        live: broadcasts.filter(b => b.status === 'live').length,
        completed: broadcasts.filter(b => b.status === 'completed').length,
      },
    };

    return res.status(200).json({
      data: {
        summary: {
          totalTracks,
          totalPlays,
          totalLikes,
          avgPlays,
        },
        topTracks,
        contentByType,
        recentBroadcasts: broadcasts.map(b => ({
          id: b._id,
          title: b.title,
          startTime: b.startTime,
          listeners: b.listenerCount || 0,
          status: b.status,
          type: b.type,
        })),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Content analytics error:', error);
    next(error);
  }
}

// Get follower growth data
async function getFollowerGrowth(userId, startDate, endDate) {
  try {
    // Get user data
    const user = await User.findById(userId);
    if (!user) return { data: [], change: 0 };

    const followers = user.creatorProfile?.followers || [];
    
    // Create daily growth data (simplified for now)
    const data = [];
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      // This would be actual daily data in production
      data.push({
        date: date.toISOString().split('T')[0],
        count: Math.round(followers.length * (0.5 + Math.random() * 0.5)),
      });
    }

    // Calculate change
    const firstDay = data[0]?.count || 0;
    const lastDay = data[data.length - 1]?.count || 0;
    const change = firstDay > 0 ? parseFloat(((lastDay - firstDay) / firstDay * 100).toFixed(1)) : 0;

    return { data, change };
  } catch (error) {
    return { data: [], change: 0 };
  }
}

// Helper function
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
