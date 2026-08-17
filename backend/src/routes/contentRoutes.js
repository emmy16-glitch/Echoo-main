import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getContent,
  getContentItem,
  updateContent,
  deleteContent,
  publishContent,
  unpublishContent,
  getContentStats,
} from '../controllers/contentController.js';

const router = express.Router();

// All content routes require authentication
router.use(authenticate);

// Get content stats
router.get('/stats', getContentStats);

// Get all content
router.get('/', getContent);

// Get single content
router.get('/:contentId', getContentItem);

// Update content
router.patch('/:contentId', updateContent);

// Delete content
router.delete('/:contentId', deleteContent);

// Publish/Unpublish content
router.post('/:contentId/publish', publishContent);
router.post('/:contentId/unpublish', unpublishContent);

export default router;
