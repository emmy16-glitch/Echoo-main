import mongoose from 'mongoose';
import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Follow from '../models/Follow.js';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';

async function buildCreatorData(user, includePrivate = false) {
  const audioFilter = {
    artist: user._id,
    isDeleted: false,
    ...(includePrivate ? {} : { isPublic: true }),
  };

  const stationFilter = {
    owner: user._id,
    isDeleted: false,
    ...(includePrivate ? {} : { isPublic: true }),
  };

  const [
    tracks,
    totalTracks,
    playsResult,
    stations,
    liveBroadcast,
    recentBroadcasts,
  ] = await Promise.all([
    Audio.find(audioFilter)
      .sort({ createdAt: -1 })
      .limit(20)
      .select(
        'title description duration playCount likeCount createdAt isPublic fileUrl coverArt genre'
      ),
    Audio.countDocuments(audioFilter),
    Audio.aggregate([
      { $match: audioFilter },
      { $group: { _id: null, total: { $sum: '$playCount' } } },
    ]),
    Station.find(stationFilter)
      .sort({ isLive: -1, createdAt: -1 })
      .limit(20)
      .select(
        'name slug description coverArt category isLive listenerCount followerCount isPublic'
      ),
    Broadcast.findOne({
      creator: user._id,
      isDeleted: false,
      isPublic: true,
      status: 'live',
    })
      .populate('station', 'name slug coverArt category')
      .sort({ startedAt: -1 }),
    Broadcast.find({
      creator: user._id,
      isDeleted: false,
      isPublic: true,
      status: 'completed',
    })
      .populate('station', 'name slug coverArt category')
      .sort({ startedAt: -1, startTime: -1 })
      .limit(10),
  ]);

  return {
    content: tracks,
    stations,
    liveBroadcast,
    recentBroadcasts,
    totalTracks,
    totalPlays: playsResult[0]?.total || 0,
  };
}

async function followerStats(userId) {
  const [followers, following] = await Promise.all([
    Follow.countDocuments({ following: userId, status: 'accepted' }),
    Follow.countDocuments({ follower: userId, status: 'accepted' }),
  ]);

  return { followers, following };
}

export async function getProfile(req, res, next) {
  try {
    const { identifier } = req.params;

    const lookup = mongoose.isValidObjectId(identifier)
      ? { _id: identifier }
      : { username: identifier };

    const user = await User.findOne({
      ...lookup,
      isActive: true,
    }).select(
      'username displayName bio avatar userType creatorProfile createdAt'
    );

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const stats = await followerStats(user._id);
    const creatorData =
      user.userType === 'creator'
        ? await buildCreatorData(user, false)
        : {
            content: [],
            stations: [],
            liveBroadcast: null,
            recentBroadcasts: [],
            totalTracks: 0,
            totalPlays: 0,
          };

    return res.status(200).json({
      data: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        avatar: user.avatar,
        userType: user.userType,
        createdAt: user.createdAt,
        creatorProfile:
          user.userType === 'creator'
            ? {
                artistName: user.creatorProfile?.artistName,
                organizationName: user.creatorProfile?.organizationName,
                organizationLogo: user.creatorProfile?.organizationLogo,
                category: user.creatorProfile?.category,
                isVerified: Boolean(user.creatorProfile?.isVerified),
                joinedDate: user.creatorProfile?.joinedDate || user.createdAt,
              }
            : null,
        stats: {
          ...stats,
          totalTracks: creatorData.totalTracks,
          totalPlays: creatorData.totalPlays,
        },
        content: creatorData.content,
        stations: creatorData.stations,
        liveBroadcast: creatorData.liveBroadcast,
        recentBroadcasts: creatorData.recentBroadcasts,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get profile error:', error);
    next(error);
  }
}

export async function getMyProfile(req, res, next) {
  try {
    const user = await User.findById(req.userId).select(
      '-passwordHash -refreshTokenVersion'
    );

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const stats = await followerStats(user._id);
    const creatorData =
      user.userType === 'creator'
        ? await buildCreatorData(user, true)
        : {
            content: [],
            stations: [],
            liveBroadcast: null,
            recentBroadcasts: [],
            totalTracks: 0,
            totalPlays: 0,
          };

    return res.status(200).json({
      data: {
        ...user.toJSON(),
        stats: {
          ...stats,
          totalTracks: creatorData.totalTracks,
          totalPlays: creatorData.totalPlays,
        },
        content: creatorData.content,
        stations: creatorData.stations,
        liveBroadcast: creatorData.liveBroadcast,
        recentBroadcasts: creatorData.recentBroadcasts,
        listeningHistory:
          user.userType === 'listener' ? user.listeningHistory || [] : [],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get my profile error:', error);
    next(error);
  }
}
