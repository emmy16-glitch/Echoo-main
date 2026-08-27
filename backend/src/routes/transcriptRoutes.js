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
  upsertBroadcastTranscriptSegment,
  updateCaptionSettings,
} from '../controllers/transcriptController.js';
import {
  createGeminiLiveToken,
  createProviderTranscriptSession,
  flushProviderTranscriptSession,
  getTranscriptionProviderReadiness,
} from '../controllers/transcriptionProviderController.js';
import { searchReplayTranscriptsSecure } from '../controllers/transcriptSearchController.js';

const router = express.Router();

const enforcePrivateLiveTranscript = (req, res, next) => {
  req.body = {
    ...(req.body && typeof req.body === 'object' ? req.body : {}),
    showToListeners: false,
  };
  next();
};

router.use(authenticate);
router.get('/readiness', getTranscriptionReadiness);
router.get('/provider-readiness', getTranscriptionProviderReadiness);
router.get('/search', searchReplayTranscriptsSecure);
router.get('/broadcast/:broadcastId', getBroadcastTranscript);
router.get('/broadcast/:broadcastId/moments', getSavedMoments);
router.post('/broadcast/:broadcastId/moments', createSavedMoment);
router.delete('/broadcast/:broadcastId/moments/:momentId', deleteSavedMoment);
router.patch('/broadcast/:broadcastId/settings', enforcePrivateLiveTranscript, updateCaptionSettings);
router.patch('/segments/:segmentId', moderateTranscriptSegment);
router.post('/broadcast/:broadcastId/sessions', createTranscriptSession);
router.post('/broadcast/:broadcastId/provider-sessions', createProviderTranscriptSession);
router.post('/broadcast/:broadcastId/gemini-live-token', createGeminiLiveToken);
router.post('/broadcast/:broadcastId/segments', upsertBroadcastTranscriptSegment);
router.post('/broadcast/:broadcastId/finalize', finalizeBroadcastTranscript);
router.post('/sessions/:sessionId/flush', flushTranscriptSession);
router.post('/provider-sessions/:sessionId/flush', flushProviderTranscriptSession);
router.get('/audio/:audioId', getAudioTranscript);

export default router;
