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

router.use(authenticate);
router.get('/readiness', getTranscriptionReadiness);
router.get('/search', searchReplayTranscripts);
router.get('/broadcast/:broadcastId', getBroadcastTranscript);
router.get('/broadcast/:broadcastId/moments', getSavedMoments);
router.post('/broadcast/:broadcastId/moments', createSavedMoment);
router.delete('/broadcast/:broadcastId/moments/:momentId', deleteSavedMoment);
router.patch('/broadcast/:broadcastId/settings', updateCaptionSettings);
router.patch('/segments/:segmentId', moderateTranscriptSegment);
router.post('/broadcast/:broadcastId/sessions', createTranscriptSession);
router.post('/broadcast/:broadcastId/segments', upsertBroadcastTranscriptSegment);
router.post('/broadcast/:broadcastId/finalize', finalizeBroadcastTranscript);
router.post('/sessions/:sessionId/flush', flushTranscriptSession);
router.get('/audio/:audioId', getAudioTranscript);

export default router;
