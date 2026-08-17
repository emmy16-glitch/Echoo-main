import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  requestDownload,
  getDownloads,
  getDownload,
  updateDownloadProgress,
  deleteDownload,
  getDownloadStats,
} from '../controllers/downloadsController.js';

const router = express.Router();

// All downloads routes require authentication
router.use(authenticate);

// Request download
router.post('/', requestDownload);

// Get all downloads
router.get('/', getDownloads);

// Get download stats
router.get('/stats', getDownloadStats);

// Get single download
router.get('/:downloadId', getDownload);

// Update download progress
router.patch('/:downloadId/progress', updateDownloadProgress);

// Delete download
router.delete('/:downloadId', deleteDownload);

export default router;
