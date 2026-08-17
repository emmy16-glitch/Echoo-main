import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getProfile,
  getMyProfile,
  getFollowers,
  getFollowing,
} from '../controllers/profileController.js';

const router = express.Router();

// Get own profile (requires auth)
router.get('/me', authenticate, getMyProfile);

// Get user profile by username (public)
router.get('/:username', getProfile);

// Get followers/following (public)
router.get('/:userId/followers', getFollowers);
router.get('/:userId/following', getFollowing);

export default router;
