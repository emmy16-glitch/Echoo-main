import express from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { searchLimiter } from '../middleware/rateLimiter.js';
import {
  globalSearch,
  searchTracks,
  searchCreators,
  getPopularSearches,
  getTrendingSearches,
} from '../controllers/searchController.js';

const router = express.Router();

router.use(searchLimiter);

// Global search (public with optional auth for personalization)
router.get('/', optionalAuth, globalSearch);

// Search tracks only
router.get('/tracks', searchTracks);

// Search creators only
router.get('/creators', searchCreators);

// Get popular searches (public)
router.get('/popular', getPopularSearches);

// Get trending searches (public)
router.get('/trending', getTrendingSearches);

export default router;
