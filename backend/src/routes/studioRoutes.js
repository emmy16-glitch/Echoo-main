import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getDashboardOverview,
  getStudioAnalytics,
  getContentList,
  getAudienceAnalytics,
} from '../controllers/studioController.js';

const router = express.Router();

// All studio routes require authentication
router.use(authenticate);

// Dashboard overview
router.get('/dashboard', getDashboardOverview);

// Analytics
router.get('/analytics', getStudioAnalytics);

// Content list
router.get('/content', getContentList);

// Audience analytics
router.get('/audience', getAudienceAnalytics);

export default router;
