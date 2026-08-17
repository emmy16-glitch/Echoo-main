import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createPlaylist,
  getPlaylists,
  getPlaylistById,
  updatePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  reorderTracks,
} from '../controllers/playlistController.js';

const router = express.Router();

// Public routes (with optional auth)
router.get('/', getPlaylists);
router.get('/:id', authenticate, getPlaylistById);

// Protected routes
router.post('/', authenticate, createPlaylist);
router.patch('/:id', authenticate, updatePlaylist);
router.delete('/:id', authenticate, deletePlaylist);
router.post('/:id/tracks', authenticate, addTrackToPlaylist);
router.delete('/:id/tracks', authenticate, removeTrackFromPlaylist);
router.patch('/:id/reorder', authenticate, reorderTracks);

export default router;
