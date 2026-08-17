import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  scheduleBroadcast,
  getScheduledBroadcasts,
  cancelScheduledBroadcast,
  updateScheduledBroadcast,
} from '../controllers/scheduleController.js';

const router = express.Router();

// All scheduling routes require authentication
router.use(authenticate);

// Schedule a broadcast
router.post('/', scheduleBroadcast);

// Get scheduled broadcasts
router.get('/', getScheduledBroadcasts);

// Update scheduled broadcast
router.patch('/:broadcastId', updateScheduledBroadcast);

// Cancel scheduled broadcast
router.delete('/:broadcastId', cancelScheduledBroadcast);

export default router;
