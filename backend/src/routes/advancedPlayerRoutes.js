import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  playNext,
  playPrevious,
  clearQueue,
  updatePlayerSettings,
} from '../controllers/advancedPlayerController.js';

const router = express.Router();

// All player routes require authentication
router.use(authenticate);

// Queue management
router.get('/queue', getQueue);
router.post('/queue/add', addToQueue);
router.delete('/queue/:trackIndex', removeFromQueue);
router.patch('/queue/reorder', reorderQueue);
router.delete('/queue/clear', clearQueue);

// Playback control
router.post('/queue/next', playNext);
router.post('/queue/previous', playPrevious);

// Player settings
router.patch('/settings', updatePlayerSettings);

export default router;
