import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  saveTrack,
  unsaveTrack,
  getSavedTracks,
  checkSaved,
  getLibraryStats,
} from '../controllers/libraryController.js';

const router = express.Router();

// All library routes require authentication
router.use(authenticate);

// Save/Unsave track
router.post('/tracks/:trackId/save', saveTrack);
router.delete('/tracks/:trackId/save', unsaveTrack);

// Get saved tracks
router.get('/tracks', getSavedTracks);

// Check if track is saved
router.get('/tracks/:trackId/check', checkSaved);

// Get library stats
router.get('/stats', getLibraryStats);

export default router;
