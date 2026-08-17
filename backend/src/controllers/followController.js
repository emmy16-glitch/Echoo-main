import Follow from '../models/Follow.js';
import User from '../models/User.js';

// Follow a user
export async function followUser(req, res, next) {
  try {
    const { userId } = req.params; // User to follow
    const followerId = req.userId; // Current user

    if (userId === followerId) {
      return res.status(400).json({
        error: { code: 'SELF_FOLLOW', message: 'You cannot follow yourself' }
      });
    }

    // Check if user exists
    const userToFollow = await User.findById(userId);
    if (!userToFollow) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      follower: followerId,
      following: userId,
    });

    if (existingFollow) {
      if (existingFollow.status === 'blocked') {
        return res.status(400).json({
          error: { code: 'BLOCKED', message: 'You have been blocked by this user' }
        });
      }
      return res.status(400).json({
        error: { code: 'ALREADY_FOLLOWING', message: 'Already following this user' }
      });
    }

    // Create follow
    const follow = new Follow({
      follower: followerId,
      following: userId,
    });

    await follow.save();

    // Update follower/following counts
    await User.findByIdAndUpdate(followerId, {
      $addToSet: { 'creatorProfile.followers': userId }
    });

    await User.findByIdAndUpdate(userId, {
      $addToSet: { 'creatorProfile.followers': followerId }
    });

    // Increment follower count
    const userToUpdate = await User.findById(userId);
    if (userToUpdate.creatorProfile) {
      userToUpdate.creatorProfile.totalListeners = (userToUpdate.creatorProfile.totalListeners || 0) + 1;
      await userToUpdate.save();
    }

    return res.status(201).json({
      data: {
        follow: follow.toJSON(),
        message: 'Successfully followed user',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Unfollow a user
export async function unfollowUser(req, res, next) {
  try {
    const { userId } = req.params;
    const followerId = req.userId;

    const follow = await Follow.findOne({
      follower: followerId,
      following: userId,
    });

    if (!follow) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Not following this user' }
      });
    }

    await follow.deleteOne();

    // Remove from followers lists
    await User.findByIdAndUpdate(followerId, {
      $pull: { 'creatorProfile.followers': userId }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: { 'creatorProfile.followers': followerId }
    });

    // Decrement follower count
    const userToUpdate = await User.findById(userId);
    if (userToUpdate.creatorProfile) {
      userToUpdate.creatorProfile.totalListeners = Math.max(0, (userToUpdate.creatorProfile.totalListeners || 0) - 1);
      await userToUpdate.save();
    }

    return res.status(200).json({
      data: {
        message: 'Successfully unfollowed user',
        following: false,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get followers list
export async function getFollowers(req, res, next) {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const follows = await Follow.find({ following: userId, status: 'accepted' })
      .populate('follower', 'username displayName avatar bio isActive')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Follow.countDocuments({ following: userId, status: 'accepted' });

    // Check if current user follows any of these users
    const currentUserId = req.userId;
    const followersWithFollowStatus = await Promise.all(
      follows.map(async (follow) => {
        const isFollowing = await Follow.exists({
          follower: currentUserId,
          following: follow.follower._id,
        });
        return {
          ...follow.toJSON(),
          follower: {
            ...follow.follower.toJSON(),
            isFollowing: !!isFollowing,
          },
        };
      })
    );

    return res.status(200).json({
      data: {
        followers: followersWithFollowStatus,
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

// Get following list
export async function getFollowing(req, res, next) {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const follows = await Follow.find({ follower: userId, status: 'accepted' })
      .populate('following', 'username displayName avatar bio isActive creatorProfile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Follow.countDocuments({ follower: userId, status: 'accepted' });

    // Check if current user follows any of these users
    const currentUserId = req.userId;
    const followingWithFollowStatus = await Promise.all(
      follows.map(async (follow) => {
        const isFollowing = await Follow.exists({
          follower: currentUserId,
          following: follow.following._id,
        });
        return {
          ...follow.toJSON(),
          following: {
            ...follow.following.toJSON(),
            isFollowing: !!isFollowing,
            isCreator: follow.following.userType === 'creator',
          },
        };
      })
    );

    return res.status(200).json({
      data: {
        following: followingWithFollowStatus,
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

// Check follow status
export async function checkFollowStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;

    const isFollowing = await Follow.exists({
      follower: currentUserId,
      following: userId,
      status: 'accepted',
    });

    const isFollowedBy = await Follow.exists({
      follower: userId,
      following: currentUserId,
      status: 'accepted',
    });

    return res.status(200).json({
      data: {
        isFollowing: !!isFollowing,
        isFollowedBy: !!isFollowedBy,
        relationship: isFollowing && isFollowedBy ? 'mutual' 
          : isFollowing ? 'following' 
          : isFollowedBy ? 'follower' 
          : 'none',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get follower count
export async function getFollowerCount(req, res, next) {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const followerCount = await Follow.countDocuments({
      following: userId,
      status: 'accepted',
    });

    const followingCount = await Follow.countDocuments({
      follower: userId,
      status: 'accepted',
    });

    return res.status(200).json({
      data: {
        userId,
        followerCount,
        followingCount,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get mutual followers
export async function getMutualFollowers(req, res, next) {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;

    // Get users that current user follows
    const currentUserFollowing = await Follow.find({
      follower: currentUserId,
      status: 'accepted',
    }).select('following');

    const followingIds = currentUserFollowing.map(f => f.following.toString());

    // Get users that follow the target user
    const targetFollowers = await Follow.find({
      following: userId,
      status: 'accepted',
    }).select('follower');

    const targetFollowerIds = targetFollowers.map(f => f.follower.toString());

    // Find mutual follows
    const mutualIds = followingIds.filter(id => targetFollowerIds.includes(id));

    const mutualUsers = await User.find({
      _id: { $in: mutualIds },
    }).select('username displayName avatar bio');

    return res.status(200).json({
      data: {
        mutual: mutualUsers,
        count: mutualUsers.length,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
