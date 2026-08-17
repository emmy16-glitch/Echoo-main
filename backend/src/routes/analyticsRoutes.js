import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAnalyticsOverview,
  getAudienceAnalytics,
  getContentAnalytics,
} from '../controllers/analyticsController.js';

const router = express.Router();

// All analytics routes require authentication
router.use(authenticate);

// Get analytics overview
router.get('/overview', getAnalyticsOverview);

// Get audience analytics
router.get('/audience', getAudienceAnalytics);

// Get content analytics
router.get('/content', getContentAnalytics);

export default router;
