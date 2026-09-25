import batch3Service from './batch3Service.js';
import {
  BROADCAST_RECORDING_READY_EVENT,
  clearPendingBroadcastRecording,
  recoverOrphanedLosslessRecording,
  retryBroadcastQualityCompletion,
  uploadRecoveryMasterToServer,
} from './broadcastRecordingService.js';
import { saveAutomaticLocalCopy, saveRecordingToPc } from './recordingExportService.js';
import {
  chooseRecordingDeviceFormat,
  getRecordingDevicePreferences,
} from './recordingDevicePreferences.js';

// ---------------------------------------------------------------------------
// Background recording autosave: after End Broadcast Echoo verifies/finalizes
// the server MP3. The local master uploads only as emergency recovery when the
// primary LiveKit server recording failed. Progress/success/failure is broadcast
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
      return 'Couldn’t finish the server MP3. The browser recovery master is still safe on this device.';
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

// Normal live path: LiveKit server egress already delivered the published
// program track to backend FFmpeg, so End Broadcast only finalizes the server
// MP3. Browser PCM upload is reserved for emergency recovery if that primary
// server recording failed.
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

      let finalizeResponse = await batch3Service.finalizeServerReplay(recording.broadcastId, {
        qualityChunkCount: Number(recording.qualityChunkIndex ?? recording.qualityChunkCount) || 0,
        qualityChunkUploadErrors: Array.isArray(recording.qualityChunkErrors) ? recording.qualityChunkErrors.length : 0,
      });
      let replay = finalizeResponse?.data?.replay || {};

      // Server egress is primary, but the local OPFS master is deliberately
      // retained until the server MP3 is verified. If egress failed, recover
      // automatically from that master using bounded chunks. This expensive
      // upload is an emergency path only and never runs during the live show.
      if (
        replay.status !== 'ready' &&
        !recording.serverFallbackAttempted &&
        recording.blob?.size &&
        String(recording.mimeType || recording.blob?.type || '').toLowerCase().includes('wav')
      ) {
        emit({ status: 'finalizing', key, title, recovery: true });
        await uploadRecoveryMasterToServer(recording);
        finalizeResponse = await batch3Service.finalizeServerReplay(recording.broadcastId, {
          qualityChunkCount: Number(recording.qualityChunkCount) || 0,
          qualityChunkUploadErrors: Array.isArray(recording.qualityChunkErrors)
            ? recording.qualityChunkErrors.length
            : 0,
        });
        replay = finalizeResponse?.data?.replay || {};
      }

      if (replay.status === 'ready' && replay.audioId) {
        const audioId = String(replay.audioId);
        const channelName =
          broadcast?.station?.name ||
          broadcast?.channel?.name ||
          broadcast?.stationName ||
          broadcast?.channelName ||
          '';
        const startedAt = recording.startedAt || broadcast?.startedAt || broadcast?.startTime || null;
        const preferences = getRecordingDevicePreferences();

        // The server MP3 is already durable. On the first completed recording
        // for this device, ask once how future local copies should be kept.
        // Hold the local WAV master until that choice is made so WAV remains a
        // truthful lossless option rather than a renamed/transcoded fake.
        if (!preferences.decided) {
          rememberLocalMaster(`device-choice:${key}`, {
            blob: recording.blob,
            title,
            mimeType: recording.mimeType || recording.blob?.type,
            broadcast,
            recording,
            audioId,
            channelName,
            startedAt,
          });
          window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
          window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
          emit({
            status: 'device-choice',
            key,
            title,
            audioId,
            channelName,
            startedAt,
            serverFormat: 'mp3',
          });
          notifySaved(`“${title}” saved safely to Echoo as MP3. Choose how this device should keep future copies.`);
          return { audioId, title, duplicate: Boolean(replay.duplicate), needsDeviceChoice: true };
        }

        let localCopy = null;
        if (preferences.autoSave && !automaticLocalCopies.has(key)) {
          localCopy = await saveAutomaticLocalCopy({
            blob: recording.blob,
            title,
            audioId,
            format: preferences.format,
            channelName,
            startedAt,
          }).catch((error) => ({ saved: false, error: error?.message || String(error), format: preferences.format }));
          if (localCopy?.saved) automaticLocalCopies.add(key);
        } else if (!preferences.autoSave) {
          localCopy = { saved: false, skipped: 'device-copy-disabled' };
        }

        if (preferences.autoSave && !localCopy?.saved) {
          // The server MP3 is safe, but the creator explicitly asked for a
          // device copy. Keep the OPFS master until that device save succeeds
          // (or they later switch to server-only) instead of silently deleting
          // the only local recovery source.
          rememberLocalMaster(`pending:${key}`, {
            blob: recording.blob,
            title,
            mimeType: recording.mimeType || recording.blob?.type,
            broadcast,
            recording,
            audioId,
            channelName,
            startedAt,
          });
          window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
          window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
          emit({
            status: 'error',
            key,
            title,
            audioId,
            code: 'DEVICE_COPY_FAILED',
            message: 'The server MP3 is saved, but the automatic device copy did not finish. Your local recovery master is still safe — retry the device copy.',
            retryable: true,
            hasRecovery: Boolean(recording.blob?.size),
            localCopy,
          });
          notifySaved(`“${title}” is safe in Echoo Recordings. The device copy still needs attention.`);
          return {
            audioId,
            title,
            duplicate: Boolean(replay.duplicate),
            deviceCopyPending: true,
            localCopy,
          };
        }

        // Server persistence is confirmed and the remembered device policy
        // either succeeded or is server-only, so the temporary OPFS master can
        // now be removed.
        try { await recording.dispose?.(); } catch { /* already disposed */ }
        clearPendingBroadcastRecording(recording.broadcastId);
        forgetLocalMaster(`pending:${key}`);
        window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
        window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
        emit({ status: 'done', key, title, audioId, localCopy, format: 'mp3' });
        notifySaved(localCopy?.saved ? `“${title}” saved to Echoo and this device.` : `“${title}” saved to Echoo Recordings.`);
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
      // Keep the master for Retry and device recovery before doing anything
      // else. Never delete the creator's only copy until canonical server
      // persistence is confirmed.
      let recoveryCopy = null;
      if (recording?.blob?.size) {
        rememberLocalMaster(`pending:${key}`, {
          blob: recording.blob,
          title,
          mimeType: recording.mimeType || recording.blob.type,
          broadcast,
          recording,
        });

        const recoveryKey = `recovery:${key}`;
        const preferences = getRecordingDevicePreferences();
        const recoveryMime = String(recording.mimeType || recording.blob.type || '').toLowerCase();
        if (
          preferences.autoSave &&
          recoveryMime.includes('wav') &&
          !automaticLocalCopies.has(recoveryKey)
        ) {
          const channelName =
            broadcast?.station?.name ||
            broadcast?.channel?.name ||
            broadcast?.stationName ||
            broadcast?.channelName ||
            '';
          recoveryCopy = await saveAutomaticLocalCopy({
            blob: recording.blob,
            title,
            format: 'wav',
            channelName,
            startedAt: recording.startedAt || broadcast?.startedAt || broadcast?.startTime || null,
          }).catch((copyError) => ({
            saved: false,
            error: copyError?.message || String(copyError),
            format: 'wav',
          }));
          if (recoveryCopy?.saved) automaticLocalCopies.add(recoveryKey);
        }
      }

      emit({
        status: 'error',
        key,
        title,
        code: error?.code || '',
        message: recoveryCopy?.saved
          ? 'The server MP3 could not be finished, but a recovery WAV was saved to this device. Echoo also kept the browser recovery master so you can Retry.'
          : friendlyRecoveryMessage(error),
        retryable: true,
        recoveryCopy,
        hasRecovery: Boolean(recording?.blob?.size),
      });
      throw error;
    } finally {
      activeUploads.delete(key);
    }
  })();

  activeUploads.set(key, task);
  task.catch(() => {});
  return task;
};

export const completeDeviceCopyChoice = async (key, format = 'mp3') => {
  const pending = peekLocalMaster(`device-choice:${key}`);
  if (!pending?.recording || !pending?.audioId) return null;

  const preferences = chooseRecordingDeviceFormat(format);
  let localCopy = { saved: false, skipped: 'device-copy-disabled' };

  if (preferences.autoSave) {
    localCopy = await saveAutomaticLocalCopy({
      blob: pending.blob,
      title: pending.title,
      audioId: pending.audioId,
      format: preferences.format,
      channelName: pending.channelName,
      startedAt: pending.startedAt,
    }).catch((error) => ({
      saved: false,
      error: error?.message || String(error),
      format: preferences.format,
    }));
    if (localCopy?.saved) automaticLocalCopies.add(String(key));

    if (!localCopy?.saved) {
      // Keep the device-choice master and let the same button retry. The
      // server copy is already durable, so this failure is local-only.
      const error = new Error(
        localCopy?.cancelled
          ? 'The device copy was cancelled. Your local master is still safe; choose a format again when ready.'
          : localCopy?.error || 'The device copy could not be saved. Your local master is still safe; try again.'
      );
      error.code = 'DEVICE_COPY_FAILED';
      throw error;
    }
  }

  try { await pending.recording.dispose?.(); } catch { /* already disposed */ }
  clearPendingBroadcastRecording(pending.recording.broadcastId);
  forgetLocalMaster(`device-choice:${key}`);
  forgetLocalMaster(`pending:${key}`);
  emit({
    status: 'done',
    key,
    title: pending.title,
    audioId: pending.audioId,
    localCopy,
    format: 'mp3',
  });
  notifySaved(localCopy?.saved
    ? `“${pending.title}” saved to Echoo and this device.`
    : `“${pending.title}” saved to Echoo Recordings.`);
  return { audioId: pending.audioId, localCopy, preferences };
};

export const saveRecoveryCopy = async (key) => {
  const lookupKey = key === 'recovered' ? 'recovered' : `pending:${key}`;
  const pending = peekLocalMaster(lookupKey);
  const blob = pending?.recording?.blob || pending?.blob || null;
  if (!blob?.size) throw new Error('No browser recovery copy is available.');

  const mimeType = String(
    pending?.recording?.mimeType ||
    pending?.mimeType ||
    blob.type ||
    ''
  ).toLowerCase();
  const format = mimeType.includes('wav') ? 'wav' : 'opus';
  const broadcast = pending?.broadcast || {};
  return saveRecordingToPc({
    blob,
    title: pending?.title || broadcast?.title || 'Echoo live recording',
    format,
    channelName:
      broadcast?.station?.name ||
      broadcast?.channel?.name ||
      broadcast?.stationName ||
      broadcast?.channelName ||
      '',
    startedAt:
      pending?.recording?.startedAt ||
      broadcast?.startedAt ||
      broadcast?.startTime ||
      null,
  });
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
  saveRecoveryCopy,
  completeDeviceCopyChoice,
  uploadRecoveredTake,
  rememberLocalMaster,
  peekLocalMaster,
  forgetLocalMaster,
};
