import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createPlaylist,
  getPlaylists,
  getMyPlaylists,
  getPlaylistById,
  updatePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  reorderTracks,
} from '../controllers/playlistController.js';

const router = express.Router();

router.get('/', getPlaylists);
router.get('/mine/all', authenticate, getMyPlaylists);
router.get('/:id', authenticate, getPlaylistById);
router.post('/', authenticate, createPlaylist);
router.patch('/:id', authenticate, updatePlaylist);
router.delete('/:id', authenticate, deletePlaylist);
router.post('/:id/tracks', authenticate, addTrackToPlaylist);
router.delete('/:id/tracks', authenticate, removeTrackFromPlaylist);
router.patch('/:id/reorder', authenticate, reorderTracks);

export default router;
