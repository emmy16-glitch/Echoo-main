import studioService from './studioService.js';
import { retryBroadcastQualityCompletion } from './broadcastRecordingService.js';

const safeFilename = (title, recording) => {
  const fallback = String(recording?.filename || '').toLowerCase();
  const mimeType = String(recording?.mimeType || '').toLowerCase();
  const extension =
    fallback.endsWith('.wav') || mimeType === 'audio/wav'
      ? 'wav'
      : fallback.endsWith('.ogg') || mimeType.includes('ogg')
        ? 'ogg'
        : 'webm';
  const clean = String(title || 'Echoo live recording')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'Echoo-live-recording';
  return `${clean}.${extension}`;
};

/**
 * Idempotent from the client's perspective: source broadcast ID is sent as
 * the server reconciliation key, so retrying after a lost response returns
 * the already-created replay rather than creating a second Audio record.
 */
export const autosaveFinishedRecording = async ({ recording, broadcast }) => {
  if (!recording?.blob?.size || !recording?.broadcastId) {
    throw new Error('The finished recording is unavailable.');
  }
  if (recording.qualityCompletionPending) {
    await retryBroadcastQualityCompletion(recording);
  }
  const title = broadcast?.title || 'Live broadcast recording';
  const description = broadcast?.description || '';
  const file = new File(
    [recording.blob],
    safeFilename(title, recording),
    { type: recording.mimeType || recording.blob.type || 'audio/wav' }
  );
  return studioService.uploadAudio({
    file,
    title,
    description: description || `Recorded live on Echoo. Broadcast recording from ${new Date(recording.startedAt).toLocaleString()}.`,
    genre: 'Other',
    tags: [
      'live-recording',
      'broadcast',
      recording.lossless ? 'lossless-master' : 'recording-fallback',
    ],
    isPublic: false,
    broadcastId: recording.broadcastId,
  });
};

export default { autosaveFinishedRecording };
