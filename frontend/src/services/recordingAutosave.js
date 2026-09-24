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
    case 'REPLAY_FINALIZE_RETRY':
      return 'Couldn’t finish saving this recording. Your recovery copy is still safe on this device.';
    case 'REPLAY_NOT_READY':
      return 'The server has no recording for this broadcast yet. Your recovery copy is still safe on this device.';
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
  if (!recording?.blob?.size && !recording?.broadcastId) return null;
  const broadcastId = String(recording.broadcastId || broadcast?.id || '');
  // Without a broadcast link there are no server chunks to finalize. Keep the
  // orphaned take in recovery instead of building a giant one-shot upload.
  if (!broadcastId) {
    const error = new Error('This take is not linked to a broadcast.');
    error.code = 'REPLAY_NOT_READY';
    emit({ status: 'error', key: `orphan-${Date.now()}`, title: broadcast?.title || 'Live broadcast recording', code: error.code, message: friendlyRecoveryMessage(error), retryable: false });
    throw error;
  }
  const key = String(recording.broadcastId || broadcast?.id || `${Date.now()}`);
  if (activeUploads.has(key)) return activeUploads.get(key);

  return startAutosaveLive({ recording: { ...recording, broadcastId }, broadcast, key });
};

// Live broadcast path: the bounded chunks already streamed during the show
// become the canonical server MP3. There is deliberately NO giant WAV upload
// here — End Broadcast finalizes server-side.
const startAutosaveLive = async ({ recording, broadcast, key }) => {
  const title = broadcast?.title || 'Live broadcast recording';
  const task = (async () => {
    try {
      emit({ status: 'started', key, title });
      emit({ status: 'finalizing', key, title });

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const offline = new Error('Waiting for network');
        offline.code = 'RECORDING_WAITING_FOR_NETWORK';
        throw offline;
      }

      if (recording.qualityCompletionPending) {
        await retryBroadcastQualityCompletion(recording).catch(() => null);
      }

      const finalizeResponse = await batch3Service.finalizeServerReplay(recording.broadcastId, {
        qualityChunkCount: Number(recording.qualityChunkIndex ?? recording.qualityChunkCount) || 0,
        qualityChunkUploadErrors: Array.isArray(recording.qualityChunkErrors) ? recording.qualityChunkErrors.length : 0,
      });
      const replay = finalizeResponse?.data?.replay || {};

      if (replay.status === 'ready' && replay.audioId) {
        const audioId = String(replay.audioId);
        // Normal automatic PC copy is the server MP3 — never the giant local
        // WAV just because the temporary recovery master is WAV.
        let localCopy = null;
        if (!automaticLocalCopies.has(key)) {
          localCopy = await saveAutomaticLocalCopy({ title, audioId })
            .catch((error) => ({ saved: false, error: error?.message || String(error) }));
          if (localCopy?.saved) automaticLocalCopies.add(key);
        }
        // Canonical persistence confirmed: drop the temporary OPFS WAV master.
        try { await recording.dispose?.(); } catch { /* already disposed */ }
        clearPendingBroadcastRecording(recording.broadcastId);
        forgetLocalMaster(`pending:${key}`);
        window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
        window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
        emit({ status: 'done', key, title, audioId, localCopy, format: 'mp3' });
        notifySaved(localCopy?.saved ? `“${title}” saved to Recordings and your device.` : `“${title}” saved to Recordings.`);
        return { audioId, title, duplicate: Boolean(replay.duplicate) };
      }

      if (replay.status === 'incomplete' || replay.status === 'failed') {
        const error = new Error('Server finalization needs another attempt.');
        error.code = 'REPLAY_FINALIZE_RETRY';
        error.replay = replay;
        throw error;
      }

      // 'empty' (or unknown): no durable server audio yet. Keep the local
      // recovery master and let the creator retry explicitly.
      const error = new Error('No server recording was produced yet.');
      error.code = 'REPLAY_NOT_READY';
      error.replay = replay;
      throw error;
    } catch (error) {
      emit({
        status: 'error',
        key,
        title,
        code: error?.code || '',
        message: friendlyRecoveryMessage(error),
        retryable: true,
      });
      // Keep the master for Retry (banner) and for trim-later. Never delete
      // the creator's only copy until canonical persistence is confirmed.
      if (recording?.blob?.size) {
        rememberLocalMaster(`pending:${key}`, { blob: recording.blob, title, mimeType: recording.mimeType || recording.blob.type, broadcast, recording });
      }
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
  const broadcastId = String(recording.broadcastId || broadcast?.id || '');
  return startAutosave({ recording: { ...recording, broadcastId }, broadcast });
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
