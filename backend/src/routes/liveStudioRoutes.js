import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getLiveStudioState,
  getBroadcastStats,
  updateStreamSettings,
  generateStreamKey,
  getLiveChat,
  getListenerHistory,
} from '../controllers/liveStudioController.js';

const router = express.Router();

// All live studio routes require authentication
router.use(authenticate);

// Get live studio state
router.get('/:broadcastId/state', getLiveStudioState);

// Get broadcast stats
router.get('/:broadcastId/stats', getBroadcastStats);

// Update stream settings
router.patch('/:broadcastId/settings', updateStreamSettings);

// Generate stream key
router.post('/:broadcastId/generate-key', generateStreamKey);

// Get live chat
router.get('/:broadcastId/chat', getLiveChat);

// Get listener history
router.get('/:broadcastId/listeners', getListenerHistory);

export default router;
