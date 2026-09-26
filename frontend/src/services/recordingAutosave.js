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
// Background recording autosave has two independent outcomes after End Broadcast:
// 1) save the creator's chosen MP3/WAV device copy from the local master, and
// 2) reconcile/finalize the canonical server MP3.
// Device saving runs first and never requires the Echoo API. The local master
// uploads only as emergency server recovery if LiveKit Egress/FFmpeg failed.
// Progress/success/failure is broadcast as `echoo:recording-upload` events.
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

const localContext = ({ recording, broadcast } = {}) => ({
  channelName:
    broadcast?.station?.name ||
    broadcast?.channel?.name ||
    broadcast?.stationName ||
    broadcast?.channelName ||
    '',
  startedAt:
    recording?.startedAt ||
    broadcast?.startedAt ||
    broadcast?.startTime ||
    null,
});

const availableLocalFormats = (recording) => {
  const mime = String(recording?.mimeType || recording?.blob?.type || '').toLowerCase();
  if (mime.includes('wav')) return ['mp3', 'wav'];
  if (mime.includes('opus') || mime.includes('ogg') || mime.includes('webm')) return ['opus'];
  return [];
};

const rememberPendingMaster = ({
  key,
  recording,
  broadcast,
  title,
  audioId = null,
  serverReady = false,
  localCopy = null,
} = {}) => {
  if (!recording?.blob?.size) return;
  const { channelName, startedAt } = localContext({ recording, broadcast });
  rememberLocalMaster(`pending:${key}`, {
    blob: recording.blob,
    title,
    mimeType: recording.mimeType || recording.blob.type,
    broadcast,
    recording,
    audioId,
    channelName,
    startedAt,
    serverReady,
    localCopy,
  });
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
  const { channelName, startedAt } = localContext({ recording, broadcast });
  const preferences = getRecordingDevicePreferences();

  const task = (async () => {
    let localCopy = null;
    let localCopyAttempted = false;

    try {
      emit({ status: 'started', key, title });

      // Device persistence is intentionally first and server-independent.
      // This happens only after the publisher/local recorder has stopped, so
      // local MP3 encoding can never compete with realtime WebRTC.
      if (
        preferences.decided &&
        preferences.autoSave &&
        !automaticLocalCopies.has(key)
      ) {
        localCopyAttempted = true;
        emit({
          status: 'device-saving',
          key,
          title,
          format: preferences.format,
        });
        localCopy = await saveAutomaticLocalCopy({
          blob: recording.blob,
          title,
          format: preferences.format,
          channelName,
          startedAt,
          onProgress: ({ percent }) => {
            emit({
              status: 'device-progress',
              key,
              title,
              format: preferences.format,
              percent,
            });
          },
        }).catch((error) => ({
          saved: false,
          error: error?.message || String(error),
          format: preferences.format,
        }));
        if (localCopy?.saved) automaticLocalCopies.add(key);
      } else if (!preferences.autoSave) {
        localCopy = { saved: false, skipped: 'device-copy-disabled' };
      }

      emit({ status: 'finalizing', key, title, localCopy });

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
        emit({ status: 'finalizing', key, title, recovery: true, localCopy });
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

        // First-time device policy is still asked once, but the choice itself
        // uses the local master and therefore does not depend on this audioId.
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
            serverReady: true,
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

        // A preference could have changed after this task began. If no local
        // attempt happened yet, honor the current preference now.
        const currentPreferences = getRecordingDevicePreferences();
        if (
          currentPreferences.autoSave &&
          !localCopyAttempted &&
          !automaticLocalCopies.has(key)
        ) {
          localCopyAttempted = true;
          localCopy = await saveAutomaticLocalCopy({
            blob: recording.blob,
            title,
            format: currentPreferences.format,
            channelName,
            startedAt,
          }).catch((error) => ({
            saved: false,
            error: error?.message || String(error),
            format: currentPreferences.format,
          }));
          if (localCopy?.saved) automaticLocalCopies.add(key);
        }

        if (currentPreferences.autoSave && !localCopy?.saved) {
          rememberPendingMaster({
            key,
            recording,
            broadcast,
            title,
            audioId,
            serverReady: true,
            localCopy,
          });
          window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
          window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
          emit({
            status: 'error',
            key,
            title,
            audioId,
            code: 'DEVICE_COPY_FAILED',
            message: 'The server MP3 is safe, but the device copy did not finish. Your local master is still safe — retry the device copy as MP3 or WAV.',
            retryable: true,
            hasRecovery: Boolean(recording.blob?.size),
            recoveryFormats: availableLocalFormats(recording),
            preferredFormat: currentPreferences.format,
            localCopy,
            serverReady: true,
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

        // Both durable-server requirements and the requested device policy are
        // now satisfied (or this device is server-only), so OPFS can be cleared.
        try { await recording.dispose?.(); } catch { /* already disposed */ }
        clearPendingBroadcastRecording(recording.broadcastId);
        forgetLocalMaster(`pending:${key}`);
        window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
        window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
        emit({ status: 'done', key, title, audioId, localCopy, format: 'mp3' });
        notifySaved(localCopy?.saved
          ? `“${title}” saved to this device and Echoo Recordings.`
          : `“${title}” saved to Echoo Recordings.`);
        return { audioId, title, duplicate: Boolean(replay.duplicate), localCopy };
      }

      if (replay.status === 'incomplete' || replay.status === 'failed') {
        const error = new Error('Server finalization needs another attempt.');
        error.code = 'REPLAY_FINALIZE_RETRY';
        error.replay = replay;
        throw error;
      }

      const error = new Error('No server recording was produced yet.');
      error.code = 'REPLAY_NOT_READY';
      error.replay = replay;
      throw error;
    } catch (error) {
      // The local master is authoritative recovery whenever the server is not
      // ready. A successful device copy stays successful; server retry is a
      // separate concern and never deletes that local file/master.
      rememberPendingMaster({
        key,
        recording,
        broadcast,
        title,
        serverReady: false,
        localCopy,
      });

      const localSaved = Boolean(localCopy?.saved);
      const message = localSaved
        ? `A local ${String(localCopy.format || preferences.format || 'recording').toUpperCase()} copy was saved to this device. Echoo's server copy is still pending; you can retry it separately.`
        : friendlyRecoveryMessage(error);

      emit({
        status: 'error',
        key,
        title,
        code: error?.code || '',
        message,
        retryable: true,
        localCopy,
        localSaved,
        hasRecovery: Boolean(recording?.blob?.size),
        recoveryFormats: availableLocalFormats(recording),
        preferredFormat: preferences.format,
        serverReady: false,
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
  if (!pending?.recording?.blob?.size) return null;

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

export const saveRecoveryCopy = async (key, requestedFormat = '') => {
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
  const defaultFormat = mimeType.includes('wav')
    ? 'wav'
    : mimeType.includes('opus') || mimeType.includes('ogg') || mimeType.includes('webm')
      ? 'opus'
      : '';
  const format =
    requestedFormat === 'mp3' || requestedFormat === 'wav' || requestedFormat === 'opus'
      ? requestedFormat
      : defaultFormat;
  if (!format) throw new Error('This local recording format cannot be exported.');

  const broadcast = pending?.broadcast || {};
  return saveRecordingToPc({
    blob,
    audioId: pending?.audioId || null,
    title: pending?.title || broadcast?.title || 'Echoo live recording',
    format,
    channelName:
      pending?.channelName ||
      broadcast?.station?.name ||
      broadcast?.channel?.name ||
      broadcast?.stationName ||
      broadcast?.channelName ||
      '',
    startedAt:
      pending?.startedAt ||
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
