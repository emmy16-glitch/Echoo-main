import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { enforceSingleLiveCreator } from '../middleware/enforceSingleLiveCreator.js';
import {
  validateBroadcastListQuery,
  validateStationIdParam,
} from '../middleware/broadcastQueryValidation.js';
import { getBroadcastPresenceCached } from '../controllers/broadcastPresenceController.js';
import {
  createBroadcast,
  getBroadcasts,
  getCreatorBroadcasts,
  getBroadcastById,
  updateBroadcast,
  deleteBroadcast,
  getUpcomingBroadcasts,
  getLiveBroadcast,
  getListenerLiveKitToken,
  getPlaybackInfo,
} from '../controllers/broadcastController.js';
import {
  cancelBroadcast,
  startBroadcast,
  confirmBroadcastLive,
  endBroadcast,
  getLiveKitToken,
} from '../controllers/broadcastLifecycleController.js';

const router = express.Router();

// Public discovery uses only public broadcasts. Validate IDs/dates and treat
// search as literal text before it reaches MongoDB regex matching.
router.get('/', validateBroadcastListQuery, getBroadcasts);
router.get(
  '/station/:stationId/upcoming',
  validateStationIdParam,
  getUpcomingBroadcasts
);
router.get(
  '/station/:stationId/live',
  validateStationIdParam,
  getLiveBroadcast
);
router.get('/:broadcastId/presence', getBroadcastPresenceCached);
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
router.post('/:broadcastId/confirm-live', authenticate, confirmBroadcastLive);
router.post('/:broadcastId/end', authenticate, endBroadcast);

// LiveKit participant credentials.
router.post('/:broadcastId/livekit-token', authenticate, getLiveKitToken);
router.post('/:broadcastId/listener-token', authenticate, getListenerLiveKitToken);

export default router;
