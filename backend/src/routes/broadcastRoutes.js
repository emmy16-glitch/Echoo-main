import express from 'express';
import {
  livekitTokenLimiter,
} from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';
import {
  enforceSingleLiveCreator,
  requireUsableBroadcastStation,
} from '../middleware/enforceSingleLiveCreator.js';
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
router.post(
  '/:broadcastId/start',
  authenticate,
  enforceSingleLiveCreator,
  requireUsableBroadcastStation,
  startBroadcast
);
router.post('/:broadcastId/confirm-live', authenticate, confirmBroadcastLive);
router.post('/:broadcastId/end', authenticate, endBroadcast);

// LiveKit participant credentials. Token issuance is rate-limited per IP to
// prevent token-spam abuse (spawning cheap listener participants), while
// leaving ample headroom for join retries and reconnects.
router.post(
  '/:broadcastId/livekit-token',
  authenticate,
  livekitTokenLimiter,
  getLiveKitToken
);
router.post(
  '/:broadcastId/listener-token',
  authenticate,
  livekitTokenLimiter,
  getListenerLiveKitToken
);

export default router;
