import studioService from './studioService.js';
import batch3Service from './batch3Service.js';
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
 *
 * Recovery flow: if the broadcast never reached `completed` (browser or
 * network died during End Broadcast), the upload is rejected with
 * BROADCAST_NOT_READY_FOR_REPLAY. In that case reconcile the lifecycle
 * through POST /broadcasts/:id/recover exactly once, then retry the upload
 * exactly once. Offline is detected before any request so no failing
 * requests are issued in a loop.
 */
const uploadWithRecovery = async ({ recording, file, title, description, broadcastId }) => {
  const tags = [
    'live-recording',
    'broadcast',
    recording?.lossless ? 'lossless-master' : 'recording-fallback',
  ];
  const uploadOnce = () => studioService.uploadAudio({
    file,
    title,
    description,
    genre: 'Other',
    tags,
    isPublic: false,
    broadcastId,
  });
  try {
    return await uploadOnce();
  } catch (uploadError) {
    if (uploadError?.code !== 'BROADCAST_NOT_READY_FOR_REPLAY') throw uploadError;
    const recovery = await batch3Service.recoverBroadcast(broadcastId);
    if (!recovery?.data?.readyForUpload) throw uploadError;
    return uploadOnce();
  }
};

export const autosaveFinishedRecording = async ({ recording, broadcast }) => {
  if (!recording?.blob?.size || !recording?.broadcastId) {
    throw new Error('The finished recording is unavailable.');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const offline = new Error('OFFLINE_SENTINEL');
    offline.code = 'RECORDING_WAITING_FOR_NETWORK';
    throw offline;
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
  return uploadWithRecovery({
    recording,
    file,
    title,
    description: description || `Recorded live on Echoo. Broadcast recording from ${new Date(recording.startedAt).toLocaleString()}.`,
    broadcastId: recording.broadcastId,
  });
};

export default { autosaveFinishedRecording };
