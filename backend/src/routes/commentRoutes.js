import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  addComment,
  getComments,
  getCommentReplies,
  updateComment,
  deleteComment,
  likeComment,
} from '../controllers/commentController.js';

const router = express.Router();

// Get comments for audio (public)
router.get('/audio/:audioId', getComments);

// Add comment (authenticated)
router.post('/audio/:audioId', authenticate, addComment);

// Page the complete direct-reply list for a root comment.
router.get('/:commentId/replies', getCommentReplies);

// Update comment (authenticated)
router.patch('/:commentId', authenticate, updateComment);

// Delete comment (authenticated)
router.delete('/:commentId', authenticate, deleteComment);

// Like comment (authenticated)
router.post('/:commentId/like', authenticate, likeComment);

export default router;
