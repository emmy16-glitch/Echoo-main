import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getMyFollowing,
  checkFollowStatus,
  getFollowerCount,
  getMutualFollowers,
  followStation,
  unfollowStation,
  checkStationFollowStatus,
  getMyFollowedStations,
} from '../controllers/followController.js';

const router = express.Router();
router.use(authenticate);

// Current listener's relationship collections.
router.get('/me/creators', getMyFollowing);
router.get('/me/stations', getMyFollowedStations);

// Creator/user relationships.
router.post('/users/:userId', followUser);
router.delete('/users/:userId', unfollowUser);
router.get('/users/:userId/status', checkFollowStatus);
router.get('/users/:userId/count', getFollowerCount);
router.get('/users/:userId/followers', getFollowers);
router.get('/users/:userId/following', getFollowing);
router.get('/users/:userId/mutual', getMutualFollowers);

// Station relationships are separate from creator relationships.
router.post('/stations/:stationId', followStation);
router.delete('/stations/:stationId', unfollowStation);
router.get('/stations/:stationId/status', checkStationFollowStatus);

export default router;
