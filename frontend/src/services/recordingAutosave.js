import studioService from './studioService.js';
import batch3Service from './batch3Service.js';
import {
  BROADCAST_RECORDING_READY_EVENT,
  clearPendingBroadcastRecording,
  recoverOrphanedLosslessRecording,
  retryBroadcastQualityCompletion,
} from './broadcastRecordingService.js';
import { saveAutomaticLocalCopy } from './recordingExportService.js';

// ---------------------------------------------------------------------------
// Background recording autosave: after End Broadcast the full master uploads
// by itself — no modal, no blocking. Progress/success/failure is broadcast
// as `echoo:recording-upload` window events consumed by RecordingSaveBanner.
// The local master blob is kept in a tiny in-memory store keyed by audio id
// so the Recordings detail can offer instant Trim + Opus/WAV device saves.
// ---------------------------------------------------------------------------

export const RECORDING_UPLOAD_EVENT = 'echoo:recording-upload';

const emit = (detail) => {
  window.dispatchEvent(new CustomEvent(RECORDING_UPLOAD_EVENT, { detail }));
};

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

// Local masters for just-saved takes: { blob, title, mimeType } by audio id
// and by broadcast id. Memory-only; server copy is the source of truth.
const localMasters = new Map();

export const rememberLocalMaster = (key, master) => {
  if (!key || !master?.blob?.size) return;
  localMasters.set(String(key), master);
};

export const peekLocalMaster = (key) => {
  if (!key) return null;
  return localMasters.get(String(key)) || null;
};

export const forgetLocalMaster = (key) => {
  if (!key) return;
  localMasters.delete(String(key));
};

const activeUploads = new Map();
const automaticLocalCopies = new Set();

const notifySaved = (message) => {
  window.dispatchEvent(new CustomEvent('echoo:toast', { detail: { message, type: 'success' } }));
};

// Server error codes mapped to creator-safe language. Raw backend text is
// never surfaced; every recovery code gets plain language.
const friendlyRecoveryMessage = (error) => {
  switch (error?.code) {
    case 'RECORDING_WAITING_FOR_NETWORK':
      return 'Recording is safe on this device. Echoo will continue saving when your connection returns.';
    case 'BROADCAST_STILL_LIVE':
      return 'This broadcast still looks live in another session, so Echoo left it untouched. End it there first — the local master stays safe here.';
    case 'RECOVERY_FORBIDDEN':
      return 'This recording belongs to a different creator account. Sign in as that creator to save it.';
    case 'BROADCAST_NOT_FOUND':
      return 'Echoo could not find this broadcast on the server. The local master is kept.';
    case 'BROADCAST_NOT_RECOVERABLE':
      return 'This broadcast never went live, so the recording cannot be linked to it. The local master is kept.';
    default:
      return error?.message || 'Could not save this recording yet. Your local master is kept — retry.';
  }
};

export const startAutosave = async ({ recording, broadcast } = {}) => {
  if (!recording?.blob?.size) return null;
  const key = String(recording.broadcastId || broadcast?.id || `${Date.now()}`);
  if (activeUploads.has(key)) return activeUploads.get(key);

  const title = broadcast?.title || 'Live broadcast recording';
  const task = (async () => {
    let localCopy = null;
    try {
      emit({ status: 'started', key, title, total: recording.blob.size });

      // Protect the creator's take on their own PC before depending on the
      // network. Browsers use the configured Downloads folder; native desktop
      // builds use their Echoo Recordings bridge. Retry never duplicates it.
      if (!automaticLocalCopies.has(key)) {
        localCopy = await saveAutomaticLocalCopy({
          blob: recording.blob,
          title,
        }).catch((error) => ({ saved: false, error: error?.message || String(error) }));
        if (localCopy?.saved) automaticLocalCopies.add(key);
      }

      // Offline is detected before any request so no failing requests are
      // issued in a loop. The banner retries on reconnect.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const offline = new Error('Waiting for network');
        offline.code = 'RECORDING_WAITING_FOR_NETWORK';
        throw offline;
      }

      if (recording.qualityCompletionPending) {
        await retryBroadcastQualityCompletion(recording);
      }

      const uploadMime = recording.mimeType || recording.blob.type || 'audio/wav';
      const file = new File([recording.blob], safeFilename(title, recording), { type: uploadMime });

      const uploadOnce = async () => await studioService.uploadAudioWithProgress({
        file,
        title,
        description:
          broadcast?.description ||
          `Recorded live on Echoo. Broadcast recording from ${new Date(recording.startedAt).toLocaleString()}.`,
        genre: 'Other',
        tags: [
          'live-recording',
          'broadcast',
          recording.lossless ? 'lossless-master' : 'recording-fallback',
        ],
        isPublic: false,
        broadcastId: recording.broadcastId,
        timeoutMs: 120000,
        onProgress: ({ loaded, total, percent }) => {
          emit({ status: 'progress', key, title, loaded, total, percent });
        },
      });

      let uploadResponse;
      try {
        uploadResponse = await uploadOnce();
      } catch (uploadError) {
        // Interrupted End Broadcast leaves the broadcast un-linkable. Reconcile
        // the lifecycle exactly once, then retry the upload exactly once.
        if (uploadError?.code !== 'BROADCAST_NOT_READY_FOR_REPLAY' || !recording.broadcastId) throw uploadError;
        const recovery = await batch3Service.recoverBroadcast(recording.broadcastId);
        if (!recovery?.data?.readyForUpload) throw uploadError;
        uploadResponse = await uploadOnce();
      }

      const audioId = String(uploadResponse?.data?.id || uploadResponse?.data?._id || '');
      if (!automaticLocalCopies.has(key)) {
        localCopy = await saveAutomaticLocalCopy({
          blob: recording.blob,
          title,
          audioId,
        }).catch((error) => ({ saved: false, error: error?.message || String(error) }));
        if (localCopy?.saved) automaticLocalCopies.add(key);
      }
      rememberLocalMaster(audioId, { blob: recording.blob, title, mimeType: uploadMime });
      if (recording.broadcastId) {
        rememberLocalMaster(`broadcast:${recording.broadcastId}`, { blob: recording.blob, title, mimeType: uploadMime, audioId });
      }
      clearPendingBroadcastRecording(recording.broadcastId);
      window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
      emit({ status: 'done', key, title, audioId, localCopy });
      notifySaved(`“${title}” saved to Recordings as MP3.`);
      return { audioId, title };
    } catch (error) {
      if (error?.code === 'REPLAY_ALREADY_EXISTS') {
        clearPendingBroadcastRecording(recording.broadcastId);
        window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
        window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
        emit({ status: 'done', key, title, audioId: '', duplicate: true });
        notifySaved(`“${title}” is already in Recordings.`);
        return { audioId: '', title, duplicate: true };
      }
      emit({
        status: 'error',
        key,
        title,
        code: error?.code || '',
        message: friendlyRecoveryMessage(error),
      });
      // Keep the master for Retry (banner) and for trim-later.
      rememberLocalMaster(`pending:${key}`, { blob: recording.blob, title, mimeType: recording.mimeType || recording.blob.type, broadcast, recording });
      throw error;
    } finally {
      activeUploads.delete(key);
    }
  })();

  activeUploads.set(key, task);
  task.catch(() => {});
  return task;
};

export const retryAutosave = async (key) => {
  const pending = peekLocalMaster(`pending:${key}`);
  if (!pending?.recording?.blob?.size) return null;
  forgetLocalMaster(`pending:${key}`);
  return startAutosave({ recording: pending.recording, broadcast: pending.broadcast });
};

export const uploadRecoveredTake = async ({ recording, broadcast } = {}) => {
  if (!recording?.blob?.size) return null;
  forgetLocalMaster('recovered');
  return startAutosave({ recording, broadcast });
};

// Headless mount: listens for finished broadcasts + offers boot recovery.
export const installRecordingAutosave = () => {
  const onReady = (event) => {
    const detail = event?.detail || null;
    if (detail?.recording?.blob?.size) {
      startAutosave(detail).catch(() => {});
    }
  };
  window.addEventListener(BROADCAST_RECORDING_READY_EVENT, onReady);

  // Offer any orphaned take from a closed/crashed tab.
  recoverOrphanedLosslessRecording()
    .then((recovered) => {
      if (recovered?.recording?.blob?.size) {
        rememberLocalMaster('recovered', {
          blob: recovered.recording.blob,
          title: recovered.broadcast?.title || 'Echoo live recording',
          mimeType: recovered.recording.mimeType,
          broadcast: recovered.broadcast,
          recording: recovered.recording,
        });
        emit({
          status: 'recovered',
          key: 'recovered',
          title: recovered.broadcast?.title || 'Echoo live recording',
        });
      }
    })
    .catch(() => {});

  return () => window.removeEventListener(BROADCAST_RECORDING_READY_EVENT, onReady);
};

export default {
  RECORDING_UPLOAD_EVENT,
  installRecordingAutosave,
  startAutosave,
  retryAutosave,
  uploadRecoveredTake,
  rememberLocalMaster,
  peekLocalMaster,
  forgetLocalMaster,
};
