import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { enforceSingleLiveCreator } from '../middleware/enforceSingleLiveCreator.js';
import { requireCreatorAudioPublished } from '../middleware/requireCreatorAudioPublished.js';
import {
  createBroadcast,
  getBroadcasts,
  getCreatorBroadcasts,
  getBroadcastById,
  updateBroadcast,
  deleteBroadcast,
  cancelBroadcast,
  getUpcomingBroadcasts,
  getLiveBroadcast,
  startBroadcast,
  confirmBroadcastLive,
  endBroadcast,
  getLiveKitToken,
  getListenerLiveKitToken,
  getBroadcastPresence,
  getPlaybackInfo,
} from '../controllers/broadcastController.js';

const router = express.Router();

// Public discovery uses only public broadcasts.
router.get('/', getBroadcasts);
router.get('/station/:stationId/upcoming', getUpcomingBroadcasts);
router.get('/station/:stationId/live', getLiveBroadcast);
router.get('/:broadcastId/presence', getBroadcastPresence);
router.get('/:broadcastId/playback', getPlaybackInfo);

// Creator-owned broadcast collection.
router.get('/mine/all', authenticate, getCreatorBroadcasts);

// Authenticated single-broadcast access.
router.get('/:broadcastId', authenticate, getBroadcastById);
router.post('/', authenticate, createBroadcast);
router.patch('/:broadcastId', authenticate, updateBroadcast);
router.delete('/:broadcastId', authenticate, deleteBroadcast);

// Explicit lifecycle actions. Status is never changed through generic PATCH.
router.post('/:broadcastId/cancel', authenticate, cancelBroadcast);
router.post('/:broadcastId/start', authenticate, enforceSingleLiveCreator, startBroadcast);
router.post(
  '/:broadcastId/confirm-live',
  authenticate,
  requireCreatorAudioPublished,
  confirmBroadcastLive
);
router.post('/:broadcastId/end', authenticate, endBroadcast);

// LiveKit participant credentials.
router.post('/:broadcastId/livekit-token', authenticate, getLiveKitToken);
router.post('/:broadcastId/listener-token', authenticate, getListenerLiveKitToken);

export default router;
