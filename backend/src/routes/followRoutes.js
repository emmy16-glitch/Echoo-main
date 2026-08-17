import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  checkFollowStatus,
  getFollowerCount,
  getMutualFollowers,
} from '../controllers/followController.js';

const router = express.Router();

// All follow routes require authentication
router.use(authenticate);

// Follow/Unfollow
router.post('/:userId/follow', followUser);
router.delete('/:userId/follow', unfollowUser);

// Get followers/following
router.get('/:userId/followers', getFollowers);
router.get('/:userId/following', getFollowing);

// Check follow status
router.get('/:userId/status', checkFollowStatus);

// Get follower count
router.get('/:userId/count', getFollowerCount);

// Get mutual followers
router.get('/:userId/mutual', getMutualFollowers);

export default router;
