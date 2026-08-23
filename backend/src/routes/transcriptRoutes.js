import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createTranscriptSession,
  createSavedMoment,
  deleteSavedMoment,
  finalizeBroadcastTranscript,
  flushTranscriptSession,
  getAudioTranscript,
  getBroadcastTranscript,
  getSavedMoments,
  getTranscriptionReadiness,
  moderateTranscriptSegment,
  searchReplayTranscripts,
  upsertBroadcastTranscriptSegment,
  updateCaptionSettings,
} from '../controllers/transcriptController.js';

const router = express.Router();

// Echoo live transcription is creator-private by product contract. Keep this
// invariant at the API boundary so a stale/legacy client cannot re-enable live
// listener captions even if it still sends showToListeners=true.
const enforcePrivateLiveTranscript = (req, res, next) => {
  req.body = {
    ...(req.body && typeof req.body === 'object' ? req.body : {}),
    showToListeners: false,
  };
  next();
};

router.use(authenticate);
router.get('/readiness', getTranscriptionReadiness);
router.get('/search', searchReplayTranscripts);
router.get('/broadcast/:broadcastId', getBroadcastTranscript);
router.get('/broadcast/:broadcastId/moments', getSavedMoments);
router.post('/broadcast/:broadcastId/moments', createSavedMoment);
router.delete('/broadcast/:broadcastId/moments/:momentId', deleteSavedMoment);
router.patch('/broadcast/:broadcastId/settings', enforcePrivateLiveTranscript, updateCaptionSettings);
router.patch('/segments/:segmentId', moderateTranscriptSegment);
router.post('/broadcast/:broadcastId/sessions', createTranscriptSession);
router.post('/broadcast/:broadcastId/segments', upsertBroadcastTranscriptSegment);
router.post('/broadcast/:broadcastId/finalize', finalizeBroadcastTranscript);
router.post('/sessions/:sessionId/flush', flushTranscriptSession);
router.get('/audio/:audioId', getAudioTranscript);

export default router;
