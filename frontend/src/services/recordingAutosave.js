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
    case 'SERVER_END_PENDING':
      return 'Your local recording is ready on this device, but Echoo server cleanup is still pending. Save MP3 or WAV now and retry the server later.';
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
  const storageKey = `pending:${key}`;
  const existing = peekLocalMaster(storageKey) || {};
  rememberLocalMaster(storageKey, {
    ...existing,
    blob: recording.blob,
    title,
    mimeType: recording.mimeType || recording.blob.type,
    broadcast,
    recording,
    audioId: audioId || existing.audioId || null,
    channelName,
    startedAt,
    serverReady,
    localCopy: localCopy || existing.localCopy || null,
  });
};

const waitForServerEndOutcome = async (serverEndPromise) => {
  if (!serverEndPromise) return { ok: true, response: null };
  return serverEndPromise;
};

export const startAutosave = async ({
  recording,
  broadcast,
  serverEndPromise = null,
  skipDeviceSave = false,
  initialLocalCopy = null,
} = {}) => {
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

  return startAutosaveLive({
    recording: { ...recording, broadcastId },
    broadcast,
    key,
    serverEndPromise,
    skipDeviceSave,
    initialLocalCopy,
  });
};

// Normal live path: LiveKit server egress already delivered the published
// program track to backend FFmpeg, so End Broadcast only finalizes the server
// MP3. Browser PCM upload is reserved for emergency recovery if that primary
// server recording failed.
const startAutosaveLive = async ({
  recording,
  broadcast,
  key,
  serverEndPromise = null,
  skipDeviceSave = false,
  initialLocalCopy = null,
}) => {
  const title = broadcast?.title || 'Live broadcast recording';
  const { channelName, startedAt } = localContext({ recording, broadcast });
  const preferences = getRecordingDevicePreferences();

  const task = (async () => {
    let localCopy = initialLocalCopy;
    let localCopyAttempted = Boolean(initialLocalCopy);

    try {
      emit({ status: 'started', key, title });

      // Device persistence is intentionally first and server-independent.
      // This happens only after the publisher/local recorder has stopped, so
      // local MP3 encoding can never compete with realtime WebRTC.
      if (
        !skipDeviceSave &&
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

      // Persist access to the local master before any server wait. Even if the
      // End Broadcast request hangs, the banner can immediately save MP3/WAV.
      rememberPendingMaster({
        key,
        recording,
        broadcast,
        title,
        serverReady: false,
        localCopy,
      });
      emit({
        status: 'finalizing',
        key,
        title,
        localCopy,
        localSaved: Boolean(localCopy?.saved),
        hasRecovery: Boolean(recording.blob?.size),
        recoveryFormats: availableLocalFormats(recording),
        preferredFormat: preferences.format,
        serverReady: false,
      });

      const serverEndOutcome = await waitForServerEndOutcome(serverEndPromise);
      if (!serverEndOutcome?.ok) {
        const pendingEnd = new Error(
          serverEndOutcome?.error?.message || 'Echoo server cleanup failed.'
        );
        pendingEnd.code = 'SERVER_END_PENDING';
        throw pendingEnd;
      }

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
          !skipDeviceSave &&
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

        const deviceSatisfied =
          !currentPreferences.autoSave ||
          localCopy?.saved ||
          automaticLocalCopies.has(key);

        if (!deviceSatisfied) {
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
          const deviceNeedsTap = localCopy?.requiresUserGesture === true;
          emit({
            status: 'error',
            key,
            title,
            audioId,
            code: deviceNeedsTap ? 'DEVICE_COPY_ACTION_REQUIRED' : 'DEVICE_COPY_FAILED',
            message: deviceNeedsTap
              ? 'The Echoo server MP3 is safe. Your browser requires one tap to save a file to this phone/computer — choose MP3 or WAV below.'
              : 'The server MP3 is safe, but the device copy did not finish. Your local master is still safe — retry the device copy as MP3 or WAV.',
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
    try {
      localCopy = await saveRecordingToPc({
        blob: pending.blob,
        title: pending.title,
        audioId: pending.audioId || null,
        format: preferences.format,
        channelName: pending.channelName,
        startedAt: pending.startedAt,
        preparedMp3Blob: pending.preparedMp3Blob || null,
        preparedMp3Dispose: pending.preparedMp3Dispose || null,
      });
    } catch (error) {
      const choiceError = new Error(
        error?.message || 'The device copy could not be saved. Your local master is still safe; try again.'
      );
      choiceError.code = 'DEVICE_COPY_FAILED';
      throw choiceError;
    }

    if (localCopy?.prepared && localCopy?.preparedBlob?.size) {
      pending.preparedMp3Blob = localCopy.preparedBlob;
      pending.preparedMp3Dispose = localCopy.preparedDispose || null;
      rememberLocalMaster(`device-choice:${key}`, pending);
      emit({
        status: 'device-choice',
        key,
        title: pending.title,
        audioId: pending.audioId || null,
        channelName: pending.channelName || '',
        preparedFormat: 'mp3',
        message: 'MP3 encoding is finished. Tap MP3 again to open your phone save/share sheet.',
      });
      return {
        audioId: pending.audioId || null,
        localCopy,
        preferences,
        prepared: true,
      };
    }

    if (localCopy?.downloadStarted) {
      rememberLocalMaster(`device-choice:${key}`, pending);
      emit({
        status: 'device-choice',
        key,
        title: pending.title,
        audioId: pending.audioId || null,
        channelName: pending.channelName || '',
        downloadStarted: true,
        message: 'The browser download was started. Echoo kept the local master because a web page cannot verify that the file reached your Downloads folder.',
      });
      return {
        audioId: pending.audioId || null,
        localCopy,
        preferences,
        downloadStarted: true,
      };
    }

    if (!localCopy?.saved) {
      const error = new Error(
        localCopy?.cancelled
          ? 'The device copy was cancelled. Your local master is still safe; choose a format again when ready.'
          : 'The device copy could not be saved. Your local master is still safe; try again.'
      );
      error.code = 'DEVICE_COPY_FAILED';
      throw error;
    }
    automaticLocalCopies.add(String(key));
  }

  // Device choice is normally shown after server persistence is confirmed.
  // If this helper is ever used earlier, keep OPFS until the server is also
  // durable; local save success must not destroy the server recovery source.
  if (pending.serverReady !== false) {
    try { await pending.recording.dispose?.(); } catch { /* already disposed */ }
    clearPendingBroadcastRecording(pending.recording.broadcastId);
    forgetLocalMaster(`pending:${key}`);
  } else {
    rememberPendingMaster({
      key,
      recording: pending.recording,
      broadcast: pending.broadcast,
      title: pending.title,
      audioId: pending.audioId || null,
      serverReady: false,
      localCopy,
    });
  }

  forgetLocalMaster(`device-choice:${key}`);
  emit({
    status: pending.serverReady === false ? 'error' : 'done',
    key,
    title: pending.title,
    audioId: pending.audioId || null,
    localCopy,
    localSaved: Boolean(localCopy?.saved),
    serverReady: pending.serverReady !== false,
    code: pending.serverReady === false ? 'REPLAY_NOT_READY' : '',
    message: pending.serverReady === false
      ? 'The device copy is saved. Echoo server storage is still pending; retry it separately.'
      : '',
    hasRecovery: pending.serverReady === false,
    recoveryFormats: availableLocalFormats(pending.recording),
    preferredFormat: preferences.format,
    format: preferences.format,
  });
  notifySaved(localCopy?.saved
    ? `“${pending.title}” saved to this device.`
    : `“${pending.title}” will stay on Echoo only.`);
  return { audioId: pending.audioId || null, localCopy, preferences };
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
  const result = await saveRecordingToPc({
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
    preparedMp3Blob: pending?.preparedMp3Blob || null,
    preparedMp3Dispose: pending?.preparedMp3Dispose || null,
  });

  if (result?.prepared && result?.preparedBlob?.size) {
    pending.preparedMp3Blob = result.preparedBlob;
    pending.preparedMp3Dispose = result.preparedDispose || null;
    rememberLocalMaster(lookupKey, pending);
  }

  if (result?.saved && key !== 'recovered') {
    pending.localCopy = { ...result, format };
    automaticLocalCopies.add(String(key));

    if (pending.serverReady === true) {
      // Both outcomes are now durable: the server replay was already ready and
      // this explicit user gesture successfully saved the requested device
      // file. Release the OPFS master and move the banner to Done.
      try { await pending.recording?.dispose?.(); } catch { /* already disposed */ }
      clearPendingBroadcastRecording(pending.recording?.broadcastId || '');
      forgetLocalMaster(lookupKey);
      emit({
        status: 'done',
        key,
        title: pending.title || broadcast?.title || 'Echoo live recording',
        audioId: pending.audioId || null,
        localCopy: pending.localCopy,
        format: 'mp3',
      });
      notifySaved(`“${pending.title || broadcast?.title || 'Recording'}” saved to Echoo and this device.`);
    } else {
      // Server is still pending. Keep OPFS for server recovery while recording
      // that the creator's device-save requirement has already been satisfied.
      rememberLocalMaster(lookupKey, pending);
    }
  }
  return result;
};

export const retryAutosave = async (key) => {
  const pending = peekLocalMaster(`pending:${key}`);
  if (!pending?.recording?.blob?.size) return null;

  // A failed/lost End Broadcast response can leave the backend lifecycle in
  // starting/live/ending. Reconcile that state before asking replay
  // finalization to run; this endpoint is creator-gated and idempotent.
  await batch3Service.recoverBroadcast(pending.recording.broadcastId);

  return startAutosave({
    recording: pending.recording,
    broadcast: pending.broadcast,
    skipDeviceSave: true,
    initialLocalCopy: pending.localCopy || null,
  });
};

export const uploadRecoveredTake = async ({ recording, broadcast } = {}) => {
  if (!recording?.blob?.size) return null;
  const broadcastId = String(recording.broadcastId || broadcast?.id || '');
  if (!broadcastId) return null;

  // Keep the recovered card/master until server reconciliation has actually
  // succeeded. A failed recovery must remain locally saveable.
  await batch3Service.recoverBroadcast(broadcastId);
  forgetLocalMaster('recovered');

  return startAutosave({
    recording: { ...recording, broadcastId },
    broadcast,
    skipDeviceSave: true,
  });
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
          recoveryFormats: availableLocalFormats(recovered.recording),
          preferredFormat: getRecordingDevicePreferences().format,
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
