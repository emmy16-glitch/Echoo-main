import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Follow from '../models/Follow.js';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';

// Get user profile
export async function getProfile(req, res, next) {
  try {
    const { username } = req.params;
    const currentUserId = req.userId;

    // Find user by username
    const user = await User.findOne({ 
      username,
      isActive: true,
    })
      .select('username displayName bio avatar userType creatorProfile createdAt');

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Get follower stats
    const followerCount = await Follow.countDocuments({ following: user._id, status: 'accepted' });
    const followingCount = await Follow.countDocuments({ follower: user._id, status: 'accepted' });

    // Check if current user follows this user
    let isFollowing = false;
    if (currentUserId) {
      isFollowing = await Follow.exists({
        follower: currentUserId,
        following: user._id,
        status: 'accepted',
      });
    }

    // Get user's content (if creator)
    let content = [];
    let totalTracks = 0;
    let totalPlays = 0;

    if (user.userType === 'creator') {
      const tracks = await Audio.find({
        artist: user._id,
        isDeleted: false,
        isPublic: true,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title duration playCount likeCount createdAt');

      totalTracks = await Audio.countDocuments({
        artist: user._id,
        isDeleted: false,
        isPublic: true,
      });

      const playsResult = await Audio.aggregate([
        { $match: { artist: user._id, isDeleted: false, isPublic: true } },
        { $group: { _id: null, total: { $sum: '$playCount' } } },
      ]);
      totalPlays = playsResult.length > 0 ? playsResult[0].total : 0;

      content = tracks.map(track => ({
        id: track._id,
        title: track.title,
        duration: track.duration,
        plays: track.playCount || 0,
        likes: track.likeCount || 0,
        createdAt: track.createdAt,
      }));
    }

    // Get user's stations (if creator)
    let stations = [];
    if (user.userType === 'creator') {
      stations = await Station.find({
        owner: user._id,
        isDeleted: false,
        isPublic: true,
      })
        .sort({ isLive: -1, createdAt: -1 })
        .limit(10)
        .select('name description coverArt isLive listenerCount followerCount');
    }

    // Get recent broadcasts (if creator)
    let recentBroadcasts = [];
    if (user.userType === 'creator') {
      recentBroadcasts = await Broadcast.find({
        creator: user._id,
        isDeleted: false,
        isPublic: true,
        status: 'completed',
      })
        .sort({ startTime: -1 })
        .limit(5)
        .select('title startTime listenerCount duration');
    }

    // Build profile response
    const profile = {
      id: user._id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      userType: user.userType,
      createdAt: user.createdAt,
      stats: {
        followers: followerCount,
        following: followingCount,
        totalTracks: totalTracks,
        totalPlays: totalPlays,
      },
      isFollowing,
      content,
      stations,
      recentBroadcasts,
    };

    // Add creator-specific fields
    if (user.userType === 'creator') {
      profile.creatorProfile = {
        artistName: user.creatorProfile?.artistName,
        organizationName: user.creatorProfile?.organizationName,
        category: user.creatorProfile?.category,
        isVerified: user.creatorProfile?.isVerified || false,
        totalListeners: user.creatorProfile?.totalListeners || 0,
        joinedDate: user.creatorProfile?.joinedDate || user.createdAt,
      };
    }

    return res.status(200).json({
      data: profile,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get profile error:', error);
    next(error);
  }
}

// Get current user profile (own profile)
export async function getMyProfile(req, res, next) {
  try {
    const userId = req.userId;

    const user = await User.findById(userId)
      .select('-passwordHash -refreshTokenVersion');

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Get follower stats
    const followerCount = await Follow.countDocuments({ following: userId, status: 'accepted' });
    const followingCount = await Follow.countDocuments({ follower: userId, status: 'accepted' });

    // Get user's content (if creator)
    let content = [];
    let totalTracks = 0;
    let totalPlays = 0;

    if (user.userType === 'creator') {
      const tracks = await Audio.find({
        artist: userId,
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title duration playCount likeCount createdAt isPublic');

      totalTracks = await Audio.countDocuments({
        artist: userId,
        isDeleted: false,
      });

      const playsResult = await Audio.aggregate([
        { $match: { artist: userId, isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$playCount' } } },
      ]);
      totalPlays = playsResult.length > 0 ? playsResult[0].total : 0;

      content = tracks.map(track => ({
        id: track._id,
        title: track.title,
        duration: track.duration,
        plays: track.playCount || 0,
        likes: track.likeCount || 0,
        isPublic: track.isPublic,
        createdAt: track.createdAt,
      }));
    }

    // Get user's stations
    let stations = [];
    if (user.userType === 'creator') {
      stations = await Station.find({
        owner: userId,
        isDeleted: false,
      })
        .sort({ isLive: -1, createdAt: -1 })
        .select('name description coverArt isLive listenerCount followerCount');
    }

    // Get listening history (if listener)
    let listeningHistory = [];
    if (user.userType === 'listener') {
      listeningHistory = user.listeningHistory || [];
    }

    // Build profile response
    const profile = {
      id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      userType: user.userType,
      preferences: user.preferences,
      createdAt: user.createdAt,
      stats: {
        followers: followerCount,
        following: followingCount,
        totalTracks: totalTracks,
        totalPlays: totalPlays,
      },
      content,
      stations,
      listeningHistory,
    };

    // Add creator-specific fields
    if (user.userType === 'creator') {
      profile.creatorProfile = {
        artistName: user.creatorProfile?.artistName,
        organizationName: user.creatorProfile?.organizationName,
        category: user.creatorProfile?.category,
        isVerified: user.creatorProfile?.isVerified || false,
        totalListeners: user.creatorProfile?.totalListeners || 0,
        joinedDate: user.creatorProfile?.joinedDate || user.createdAt,
      };
    }

    return res.status(200).json({
      data: profile,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get my profile error:', error);
    next(error);
  }
}

// Get user's followers
export async function getFollowers(req, res, next) {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const follows = await Follow.find({ 
      following: userId, 
      status: 'accepted' 
    })
      .populate('follower', 'username displayName avatar bio userType creatorProfile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Follow.countDocuments({ 
      following: userId, 
      status: 'accepted' 
    });

    // Check if current user follows each follower
    const currentUserId = req.userId;
    const followersWithStatus = await Promise.all(
      follows.map(async (follow) => {
        const isFollowing = await Follow.exists({
          follower: currentUserId,
          following: follow.follower._id,
          status: 'accepted',
        });
        return {
          id: follow.follower._id,
          username: follow.follower.username,
          displayName: follow.follower.displayName,
          avatar: follow.follower.avatar,
          bio: follow.follower.bio,
          userType: follow.follower.userType,
          isFollowing: !!isFollowing,
          followedAt: follow.createdAt,
        };
      })
    );

    return res.status(200).json({
      data: {
        followers: followersWithStatus,
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
    console.error('Get followers error:', error);
    next(error);
  }
}

// Get user's following
export async function getFollowing(req, res, next) {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const follows = await Follow.find({ 
      follower: userId, 
      status: 'accepted' 
    })
      .populate('following', 'username displayName avatar bio userType creatorProfile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Follow.countDocuments({ 
      follower: userId, 
      status: 'accepted' 
    });

    // Check if current user follows each following
    const currentUserId = req.userId;
    const followingWithStatus = await Promise.all(
      follows.map(async (follow) => {
        const isFollowing = await Follow.exists({
          follower: currentUserId,
          following: follow.following._id,
          status: 'accepted',
        });
        return {
          id: follow.following._id,
          username: follow.following.username,
          displayName: follow.following.displayName,
          avatar: follow.following.avatar,
          bio: follow.following.bio,
          userType: follow.following.userType,
          isFollowing: !!isFollowing,
          followedAt: follow.createdAt,
        };
      })
    );

    return res.status(200).json({
      data: {
        following: followingWithStatus,
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
    console.error('Get following error:', error);
    next(error);
  }
}
