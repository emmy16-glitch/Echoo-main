import mongoose from 'mongoose';
import Follow from '../models/Follow.js';
import StationFollow from '../models/StationFollow.js';
import Station from '../models/Station.js';
import User from '../models/User.js';

const userSummary = '_id username displayName avatar bio userType creatorProfile.category creatorProfile.isVerified';
const stationSummary = '_id name slug description coverArt category isLive listenerCount followerCount owner isPublic isDeleted';

function validId(value) {
  return mongoose.isValidObjectId(value);
}

function invalidId(res, resource = 'resource') {
  return res.status(400).json({
    error: {
      code: 'INVALID_ID',
      message: `Invalid ${resource} ID`,
    },
  });
}

export async function followUser(req, res, next) {
  try {
    const { userId } = req.params;
    const followerId = req.userId;

    if (!validId(userId)) return invalidId(res, 'user');
    if (String(userId) === String(followerId)) {
      return res.status(400).json({
        error: { code: 'SELF_FOLLOW', message: 'You cannot follow yourself' },
      });
    }

    const user = await User.findOne({ _id: userId, isActive: true }).select(userSummary);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const existing = await Follow.findOne({
      follower: followerId,
      following: userId,
    });

    if (existing?.status === 'blocked') {
      return res.status(403).json({
        error: { code: 'BLOCKED', message: 'This follow relationship is blocked' },
      });
    }

    if (existing) {
      if (existing.status !== 'accepted') {
        existing.status = 'accepted';
        await existing.save();
      }

      await User.findByIdAndUpdate(userId, {
        $addToSet: { 'creatorProfile.followers': followerId },
      });

      return res.status(200).json({
        data: {
          following: true,
          user,
          relationship: existing,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const relationship = await Follow.create({
      follower: followerId,
      following: userId,
      status: 'accepted',
    });

    await User.findByIdAndUpdate(userId, {
      $addToSet: { 'creatorProfile.followers': followerId },
    });

    return res.status(201).json({
      data: {
        following: true,
        user,
        relationship,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({
        data: { following: true },
        timestamp: new Date().toISOString(),
      });
    }
    next(error);
  }
}

export async function unfollowUser(req, res, next) {
  try {
    const { userId } = req.params;
    const followerId = req.userId;

    if (!validId(userId)) return invalidId(res, 'user');

    const relationship = await Follow.findOneAndDelete({
      follower: followerId,
      following: userId,
    });

    await User.findByIdAndUpdate(userId, {
      $pull: { 'creatorProfile.followers': followerId },
    });

    return res.status(200).json({
      data: {
        following: false,
        removed: Boolean(relationship),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getFollowers(req, res, next) {
  try {
    const { userId } = req.params;
    if (!validId(userId)) return invalidId(res, 'user');

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { following: userId, status: 'accepted' };
    const [rows, total] = await Promise.all([
      Follow.find(filter)
        .populate({ path: 'follower', match: { isActive: true }, select: userSummary })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Follow.countDocuments(filter),
    ]);

    const followers = rows.map((row) => row.follower).filter(Boolean);
    return res.status(200).json({
      data: {
        followers,
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

export async function getFollowing(req, res, next) {
  try {
    const { userId } = req.params;
    if (!validId(userId)) return invalidId(res, 'user');

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { follower: userId, status: 'accepted' };
    const [rows, total] = await Promise.all([
      Follow.find(filter)
        .populate({ path: 'following', match: { isActive: true }, select: userSummary })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Follow.countDocuments(filter),
    ]);

    const following = rows.map((row) => row.following).filter(Boolean);
    return res.status(200).json({
      data: {
        following,
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

export async function getMyFollowing(req, res, next) {
  req.params.userId = String(req.userId);
  return getFollowing(req, res, next);
}

export async function checkFollowStatus(req, res, next) {
  try {
    const { userId } = req.params;
    if (!validId(userId)) return invalidId(res, 'user');

    const targetExists = await User.exists({ _id: userId, isActive: true });
    if (!targetExists) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const currentUserId = req.userId;
    const [isFollowing, isFollowedBy] = await Promise.all([
      Follow.exists({
        follower: currentUserId,
        following: userId,
        status: 'accepted',
      }),
      Follow.exists({
        follower: userId,
        following: currentUserId,
        status: 'accepted',
      }),
    ]);

    return res.status(200).json({
      data: {
        isFollowing: Boolean(isFollowing),
        isFollowedBy: Boolean(isFollowedBy),
        relationship:
          isFollowing && isFollowedBy
            ? 'mutual'
            : isFollowing
              ? 'following'
              : isFollowedBy
                ? 'follower'
                : 'none',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getFollowerCount(req, res, next) {
  try {
    const { userId } = req.params;
    if (!validId(userId)) return invalidId(res, 'user');

    const user = await User.exists({ _id: userId, isActive: true });
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const [followerCount, followingCount] = await Promise.all([
      Follow.countDocuments({ following: userId, status: 'accepted' }),
      Follow.countDocuments({ follower: userId, status: 'accepted' }),
    ]);

    return res.status(200).json({
      data: { userId, followerCount, followingCount },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMutualFollowers(req, res, next) {
  try {
    const { userId } = req.params;
    if (!validId(userId)) return invalidId(res, 'user');

    const targetExists = await User.exists({ _id: userId, isActive: true });
    if (!targetExists) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const currentFollowing = await Follow.find({
      follower: req.userId,
      status: 'accepted',
    }).select('following');

    const targetFollowers = await Follow.find({
      following: userId,
      status: 'accepted',
    }).select('follower');

    const followingIds = new Set(
      currentFollowing.map((item) => String(item.following))
    );
    const mutualIds = targetFollowers
      .map((item) => String(item.follower))
      .filter((id) => followingIds.has(id));

    const mutual = await User.find({
      _id: { $in: mutualIds },
      isActive: true,
    }).select(userSummary);

    return res.status(200).json({
      data: { mutual, count: mutual.length },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function followStation(req, res, next) {
  try {
    const { stationId } = req.params;
    if (!validId(stationId)) return invalidId(res, 'station');

    const station = await Station.findOne({
      _id: stationId,
      isDeleted: false,
      isPublic: true,
    }).select(stationSummary);

    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' },
      });
    }

    const relationship = await StationFollow.findOneAndUpdate(
      { follower: req.userId, station: stationId },
      { $setOnInsert: { follower: req.userId, station: stationId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const followerCount = await StationFollow.countDocuments({ station: stationId });
    await Station.findByIdAndUpdate(stationId, { followerCount });

    return res.status(200).json({
      data: {
        following: true,
        station: { ...station.toJSON(), followerCount },
        relationship,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function unfollowStation(req, res, next) {
  try {
    const { stationId } = req.params;
    if (!validId(stationId)) return invalidId(res, 'station');

    const relationship = await StationFollow.findOneAndDelete({
      follower: req.userId,
      station: stationId,
    });

    const followerCount = await StationFollow.countDocuments({ station: stationId });
    await Station.findOneAndUpdate(
      { _id: stationId, isDeleted: false },
      { followerCount }
    );

    return res.status(200).json({
      data: {
        following: false,
        removed: Boolean(relationship),
        followerCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function checkStationFollowStatus(req, res, next) {
  try {
    const { stationId } = req.params;
    if (!validId(stationId)) return invalidId(res, 'station');

    const station = await Station.exists({
      _id: stationId,
      isDeleted: false,
      isPublic: true,
    });
    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' },
      });
    }

    const [relationship, followerCount] = await Promise.all([
      StationFollow.exists({ follower: req.userId, station: stationId }),
      StationFollow.countDocuments({ station: stationId }),
    ]);

    return res.status(200).json({
      data: {
        isFollowing: Boolean(relationship),
        followerCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyFollowedStations(req, res, next) {
  try {
    const rows = await StationFollow.find({ follower: req.userId })
      .populate({
        path: 'station',
        match: { isDeleted: false, isPublic: true },
        select: stationSummary,
        populate: {
          path: 'owner',
          match: { isActive: true },
          select: userSummary,
        },
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      data: {
        stations: rows
          .map((row) => row.station)
          .filter((station) => station && station.owner),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
