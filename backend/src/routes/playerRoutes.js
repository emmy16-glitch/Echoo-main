import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getPlaybackState,
  updatePlaybackProgress,
  addToContinueListening,
  removeFromContinueListening,
  getContinueListening,
  getListeningHistory,
  updatePlayerPreferences,
} from '../controllers/playerController.js';

const router = express.Router();

// All player routes require authentication
router.use(authenticate);

// Get playback state
router.get('/state', getPlaybackState);

// Get continue listening
router.get('/continue-listening', getContinueListening);

// Get listening history
router.get('/history', getListeningHistory);

// Update playback progress
router.post('/progress', updatePlaybackProgress);

// Add to continue listening
router.post('/continue-listening', addToContinueListening);

// Remove from continue listening
router.delete('/continue-listening/:trackId', removeFromContinueListening);

// Update player preferences
router.patch('/preferences', updatePlayerPreferences);

export default router;
