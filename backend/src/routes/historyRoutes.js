import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getHistory,
  clearHistory,
  removeHistoryItem,
  getHistoryStats,
} from '../controllers/historyController.js';

const router = express.Router();

// All history routes require authentication
router.use(authenticate);

// Get history
router.get('/', getHistory);

// Get history stats
router.get('/stats', getHistoryStats);

// Clear all history
router.delete('/clear', clearHistory);

// Remove single history item
router.delete('/:historyId', removeHistoryItem);

export default router;
