import batch3Service from './batch3Service.js';
import {
  BROADCAST_RECORDING_READY_EVENT,
  clearPendingBroadcastRecording,
  recoverOrphanedLosslessRecording,
  retryBroadcastQualityCompletion,
  uploadCompressedRecoveryMasterToServer,
  uploadRecoveryMasterToServer,
} from './broadcastRecordingService.js';
import {
  prepareAutomaticLocalCopyDestination,
  saveAutomaticLocalCopy,
  saveRecordingToPc,
} from './recordingExportService.js';
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
      return 'Echoo couldn’t finish this recording yet. Your recovery copy is still safe on this device.';
    case 'REPLAY_NOT_READY':
      return 'Echoo is still preparing this recording. Your recovery copy is safe on this device.';
    case 'SERVER_END_PENDING':
      return 'Your recording is ready on this device while Echoo finishes in the background. Save MP3 or WAV now, or retry the Echoo save later.';
    case 'BROADCAST_STILL_LIVE':
      return 'This broadcast still looks live in another session, so Echoo left it untouched. End it there first — the local master stays safe here.';
    case 'RECOVERY_FORBIDDEN':
      return 'This recording belongs to a different creator account. Sign in as that creator to save it.';
    case 'BROADCAST_NOT_FOUND':
      return 'Echoo could not find this broadcast. The local recording is kept safely on this device.';
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

const isLosslessWavRecovery = (recording) => {
  const mime = String(recording?.mimeType || recording?.blob?.type || '').toLowerCase();
  const format = String(recording?.recordingFormat || '').toLowerCase();
  const storageMode = String(recording?.storageMode || '').toLowerCase();
  const filename = String(recording?.filename || '').toLowerCase();

  return Boolean(
    recording?.blob?.size &&
    (
      mime.includes('wav') ||
      recording?.lossless === true ||
      format === 'pcm-wav' ||
      storageMode.startsWith('opfs') ||
      filename.endsWith('.wav')
    )
  );
};

const availableLocalFormats = (recording) => {
  const mime = String(recording?.mimeType || recording?.blob?.type || '').toLowerCase();
  if (isLosslessWavRecovery(recording)) return ['mp3', 'wav'];
  if (mime.includes('opus') || mime.includes('ogg') || mime.includes('webm')) return ['opus'];
  return [];
};


export const prepareEndBroadcastDeviceSave = ({ broadcast } = {}) => {
  const preferences = getRecordingDevicePreferences();
  if (!preferences.decided || !preferences.autoSave) return null;

  // Browser users should see one clear flow: Echoo finishes the server MP3
  // first, then the post-save banner asks whether to download MP3 or WAV.
  // Only the packaged desktop app keeps true background auto-save behavior.
  if (typeof window !== 'undefined' && window.echooDesktop?.isDesktop !== true) {
    return null;
  }

  const { channelName, startedAt } = localContext({
    recording: null,
    broadcast,
  });

  // This function must be called synchronously from the End Broadcast button
  // handler so supported PC browsers can grant the file handle before async
  // LiveKit/server work begins.
  return prepareAutomaticLocalCopyDestination({
    title: broadcast?.title || 'Live broadcast recording',
    format: preferences.format,
    channelName,
    startedAt,
  });
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
  deviceSaveReservation = null,
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
    deviceSaveReservation,
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
  deviceSaveReservation = null,
}) => {
  const title = broadcast?.title || 'Live broadcast recording';
  const { channelName, startedAt } = localContext({ recording, broadcast });
  const preferences = getRecordingDevicePreferences();
  const deferBrowserDeviceChoice =
    typeof window !== 'undefined' && window.echooDesktop?.isDesktop !== true;

  const task = (async () => {
    let localCopy = initialLocalCopy;
    let localCopyAttempted = Boolean(initialLocalCopy);

    try {
      emit({ status: 'started', key, title });

      // Device persistence is intentionally first and server-independent.
      // This happens only after the publisher/local recorder has stopped, so
      // local MP3 encoding can never compete with realtime WebRTC.
      if (
        !deferBrowserDeviceChoice &&
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
          reservation: deviceSaveReservation,
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
          serverEndOutcome?.error?.message || 'Echoo could not finish saving the recording.'
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

      const recoveryMime = String(
        recording.mimeType || recording.blob?.type || ''
      ).toLowerCase();
      const losslessRecoveryAvailable = isLosslessWavRecovery(recording);
      const compressedRecoveryAvailable =
        recoveryMime.includes('webm') ||
        recoveryMime.includes('opus') ||
        recoveryMime.includes('ogg');

      let finalizeResponse = null;
      let replay = {};

      // When server Egress was unavailable from the start there is no chunk
      // session to "complete" yet. Open and upload recovery FIRST; calling the
      // complete endpoint first returns QUALITY_CHUNKING_NOT_STARTED (409) and
      // used to prevent this recovery branch from ever running.
      if (
        !recording.serverRecordingPrimary &&
        !recording.serverFallbackAttempted &&
        recording.blob?.size
      ) {
        emit({ status: 'finalizing', key, title, recovery: true, localCopy });

        if (losslessRecoveryAvailable) {
          await uploadRecoveryMasterToServer(recording, {
            onProgress: ({ loaded, total, percent }) => {
              emit({
                status: 'progress',
                key,
                title,
                loaded,
                total,
                percent,
              });
            },
          });
        } else if (compressedRecoveryAvailable) {
          const recovered = await uploadCompressedRecoveryMasterToServer(recording, broadcast);
          replay = {
            status: recovered?.audioId ? 'ready' : 'failed',
            audioId: recovered?.audioId || null,
          };
          finalizeResponse = { data: { replay } };
        }
      }

      if (!finalizeResponse) {
        finalizeResponse = await batch3Service.finalizeServerReplay(recording.broadcastId, {
          qualityChunkCount: Number(recording.qualityChunkIndex ?? recording.qualityChunkCount) || 0,
          qualityChunkUploadErrors: Array.isArray(recording.qualityChunkErrors) ? recording.qualityChunkErrors.length : 0,
        });
        replay = finalizeResponse?.data?.replay || {};
      }

      // Server Egress may start successfully and still fail before End
      // Broadcast. Keep the local master until the server MP3 is verified and
      // perform one post-live rescue attempt when that happens.
      if (
        replay.status !== 'ready' &&
        !recording.serverFallbackAttempted &&
        recording.blob?.size
      ) {
        emit({ status: 'finalizing', key, title, recovery: true, localCopy });

        if (losslessRecoveryAvailable) {
          await uploadRecoveryMasterToServer(recording, {
            onProgress: ({ loaded, total, percent }) => {
              emit({
                status: 'progress',
                key,
                title,
                loaded,
                total,
                percent,
              });
            },
          });
          finalizeResponse = await batch3Service.finalizeServerReplay(recording.broadcastId, {
            qualityChunkCount: Number(recording.qualityChunkCount) || 0,
            qualityChunkUploadErrors: Array.isArray(recording.qualityChunkErrors)
              ? recording.qualityChunkErrors.length
              : 0,
          });
          replay = finalizeResponse?.data?.replay || {};
        } else if (compressedRecoveryAvailable) {
          const recovered = await uploadCompressedRecoveryMasterToServer(recording, broadcast);
          replay = {
            status: recovered?.audioId ? 'ready' : 'failed',
            audioId: recovered?.audioId || null,
          };
          finalizeResponse = { data: { replay } };
        }
      }

      if (replay.status === 'ready' && replay.audioId) {
        const audioId = String(replay.audioId);

        if (deferBrowserDeviceChoice && recording.blob?.size) {
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
            status: 'device-choice',
            key,
            title,
            audioId,
            channelName,
            startedAt,
            serverFormat: 'mp3',
            recoveryFormats: availableLocalFormats(recording),
            message: 'Echoo finished the server MP3. Choose MP3 or WAV if you also want a copy on this device.',
          });
          notifySaved(`“${title}” saved safely to Echoo as MP3.`);
          return {
            audioId,
            title,
            duplicate: Boolean(replay.duplicate),
            needsDeviceChoice: true,
          };
        }

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
              ? 'Your Echoo recording is safe. This browser needs one tap to save a file to this device — choose MP3 or WAV below.'
              : 'Your Echoo recording is safe, but the device copy did not finish. The recovery copy is still protected — retry MP3 or WAV.',
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
        ? `A ${String(localCopy.format || preferences.format || 'recording').toUpperCase()} copy was saved to this device. Echoo is still finishing the saved recording; you can retry it separately.`
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
      ? 'The device copy is saved. Echoo is still finishing the recording; you can retry that separately.'
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
    .then(async (recovered) => {
      if (!recovered?.recording?.blob?.size) return;

      rememberLocalMaster('recovered', {
        blob: recovered.recording.blob,
        title: recovered.broadcast?.title || 'Echoo live recording',
        mimeType: recovered.recording.mimeType,
        broadcast: recovered.broadcast,
        recording: recovered.recording,
      });

      // A previous tab may have closed after the server MP3 became durable but
      // before the browser cleared its OPFS safety master. Reconcile quietly so
      // users are not shown a false recovery warning on every Studio load.
      const broadcastId = String(
        recovered.recording.broadcastId || recovered.broadcast?.id || ''
      );
      if (broadcastId) {
        try {
          const processing = await batch3Service.getProcessing(broadcastId);
          const serverBroadcast = processing?.data?.broadcast || null;
          const replayReady = Boolean(
            serverBroadcast?.replayAudio ||
            serverBroadcast?.replayAudioId ||
            serverBroadcast?.assetStatus?.audio === 'ready'
          );
          if (replayReady) {
            try { await recovered.recording.dispose?.(); } catch { /* best effort */ }
            clearPendingBroadcastRecording(broadcastId);
            forgetLocalMaster('recovered');
            return;
          }
        } catch {
          // Keep the recovery master. The Recordings page can offer save/retry
          // actions without blocking or cluttering the Broadcast workspace.
        }
      }

      emit({
        status: 'recovered',
        key: 'recovered',
        title: recovered.broadcast?.title || 'Echoo live recording',
        recoveryFormats: availableLocalFormats(recovered.recording),
        preferredFormat: getRecordingDevicePreferences().format,
      });
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
  prepareEndBroadcastDeviceSave,
};
