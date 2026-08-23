import express from 'express';
import multer from 'multer';
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
  pauseBroadcast,
  resumeBroadcast,
  endBroadcast,
  getLiveKitToken,
} from '../controllers/broadcastLifecycleController.js';
import {
  completeBroadcastAudioChunks,
  startBroadcastAudioChunks,
  uploadBroadcastAudioChunk,
} from '../controllers/broadcastChunkController.js';
import {
  beginTranscriptReview,
  discardReplay,
  getProcessingStatus,
  publishReplay,
  publishTranscript,
  updateAssetVisibility,
} from '../controllers/broadcastProcessingController.js';

const router = express.Router();
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const requireCreator = (req, res, next) => {
  const creator =
    req.user?.userType === 'creator' || req.userRoles?.includes('creator');
  if (!creator) {
    return res.status(403).json({
      error: {
        code: 'CREATOR_REQUIRED',
        message: 'Only Echoo creators can manage broadcasts.',
      },
    });
  }
  return next();
};

const chunkUploadFile = (req, res, next) => {
  chunkUpload.single('chunk')(req, res, (error) => {
    if (!error) return next();
    const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      error: {
        code: error.code || 'UPLOAD_REJECTED',
        message: status === 413 ? 'Quality chunks must be 5 MB or smaller.' : error.message || 'This quality chunk could not be accepted.',
      },
    });
  });
};

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
router.get('/mine/all', authenticate, requireCreator, getCreatorBroadcasts);

// Authenticated single-broadcast access is intentionally available to listeners
// when the broadcast itself is public. All writes below require creator status.
router.get('/:broadcastId', authenticate, getBroadcastById);
router.post('/', authenticate, requireCreator, createBroadcast);
router.post('/:broadcastId/recording-chunks/start', authenticate, requireCreator, startBroadcastAudioChunks);
router.post('/:broadcastId/recording-chunks/complete', authenticate, requireCreator, completeBroadcastAudioChunks);
router.post('/:broadcastId/recording-chunks', authenticate, requireCreator, chunkUploadFile, uploadBroadcastAudioChunk);
router.patch('/:broadcastId', authenticate, requireCreator, updateBroadcast);
router.delete('/:broadcastId', authenticate, requireCreator, deleteBroadcast);

// Explicit lifecycle actions. Status is never changed through generic PATCH.
router.post('/:broadcastId/cancel', authenticate, requireCreator, cancelBroadcast);
router.post(
  '/:broadcastId/start',
  authenticate,
  requireCreator,
  enforceSingleLiveCreator,
  requireUsableBroadcastStation,
  startBroadcast
);
router.post('/:broadcastId/confirm-live', authenticate, requireCreator, confirmBroadcastLive);
router.post('/:broadcastId/pause', authenticate, requireCreator, pauseBroadcast);
router.post('/:broadcastId/resume', authenticate, requireCreator, resumeBroadcast);
router.post('/:broadcastId/end', authenticate, requireCreator, endBroadcast);
router.get('/:broadcastId/processing', authenticate, requireCreator, getProcessingStatus);
router.patch('/:broadcastId/asset-visibility', authenticate, requireCreator, updateAssetVisibility);
router.post('/:broadcastId/discard-replay', authenticate, requireCreator, discardReplay);
router.post('/:broadcastId/publish-replay', authenticate, requireCreator, publishReplay);
router.post('/:broadcastId/transcript/review', authenticate, requireCreator, beginTranscriptReview);
router.post('/:broadcastId/transcript/publish', authenticate, requireCreator, publishTranscript);

// LiveKit participant credentials. Token issuance is rate-limited per IP to
// prevent token-spam abuse (spawning cheap listener participants), while
// leaving ample headroom for join retries and reconnects.
router.post(
  '/:broadcastId/livekit-token',
  authenticate,
  requireCreator,
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
