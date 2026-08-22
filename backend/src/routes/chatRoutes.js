import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  sendMessage,
  getMessages,
  deleteMessage,
  addReaction,
  pinMessage,
  getPinnedMessages,
  getChatStats,
  muteChatUser,
} from '../controllers/chatController.js';

const router = express.Router();

// All chat routes require authentication
router.use(authenticate);

// Send message
router.post('/broadcast/:broadcastId/messages', sendMessage);

// Get messages
router.get('/broadcast/:broadcastId/messages', getMessages);

// Get pinned messages
router.get('/broadcast/:broadcastId/pinned', getPinnedMessages);

// Get chat stats
router.get('/broadcast/:broadcastId/stats', getChatStats);
router.post('/broadcast/:broadcastId/users/:userId/mute', muteChatUser);

// Delete message
router.delete('/messages/:messageId', deleteMessage);

// Add reaction
router.post('/messages/:messageId/reactions', addReaction);

// Pin message
router.post('/messages/:messageId/pin', pinMessage);

export default router;
