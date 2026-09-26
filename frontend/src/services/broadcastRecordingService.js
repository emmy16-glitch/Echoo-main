import {
  startEchooMasterPcmCapture,
  supportsEchooMasterPcmCapture,
} from './echooMixerService.js';
import { apiFetch } from './api.js';

const RECORDING_EVENT = 'echoo:broadcast-recording-ready';

const WAV_TARGET_SAMPLE_RATE = 48000;
const WAV_CHANNELS = 2;
const WAV_BIT_DEPTH = 24;
const WAV_BYTES_PER_SAMPLE = WAV_BIT_DEPTH / 8;
const WAV_MIME_TYPE = 'audio/wav';
const MAX_WAV_DATA_BYTES = 0xffffffff - 44;
const OPFS_DIRECTORY = 'echoo-live-recordings';
const OPFS_MANIFEST_KEY = 'echoo:recoverable-broadcast-recording:v1';
const OPFS_MANIFESTS_KEY = 'echoo:recoverable-broadcast-recordings:v2';
const OPFS_CHECKPOINT_MS = 15_000;

const OPUS_FALLBACK_BITRATE = 256000;
const QUALITY_CHUNK_SECONDS = 10;
const QUALITY_CHUNK_BIT_DEPTH = 24;
const QUALITY_CHUNK_CHANNELS = 2;
const QUALITY_CHUNK_UPLOAD_RETRIES = 5;
const QUALITY_CHUNK_START_RETRIES = 3;
const QUALITY_CHUNK_COMPLETE_RETRIES = 5;
// Optional transport can never be allowed to accumulate arbitrary PCM on the
// main thread. At 48 kHz stereo this permits 30 seconds of queued float audio;
// exceeding it disables only the quality/archive branch and preserves LiveKit.
const MAX_QUEUED_PCM_SECONDS = 30;

let activeRecording = null;
let pendingRecording = null;

const validRecoveryManifest = (value) => Boolean(
  value &&
  value.storageName &&
  value.broadcastId
);

const sortRecoveryManifests = (items) =>
  [...items].sort(
    (left, right) =>
      Number(right?.updatedAt || right?.endedAt || right?.startedAt || 0) -
      Number(left?.updatedAt || left?.endedAt || left?.startedAt || 0)
  );

const persistRecoveryManifests = (items) => {
  if (typeof localStorage === 'undefined') return;
  const valid = sortRecoveryManifests(
    (Array.isArray(items) ? items : []).filter(validRecoveryManifest)
  );
  try {
    if (valid.length) {
      localStorage.setItem(OPFS_MANIFESTS_KEY, JSON.stringify(valid));
    } else {
      localStorage.removeItem(OPFS_MANIFESTS_KEY);
    }
    // Once v2 has been written, the single-record v1 key must not overwrite it.
    localStorage.removeItem(OPFS_MANIFEST_KEY);
  } catch (error) {
    console.warn(
      '[Echoo Recording] could not persist recovery registry',
      error?.message || error
    );
  }
};

const readRecoveryManifests = () => {
  if (typeof localStorage === 'undefined') return [];

  let manifests = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(OPFS_MANIFESTS_KEY) || '[]');
    if (Array.isArray(parsed)) manifests = parsed.filter(validRecoveryManifest);
  } catch {
    manifests = [];
  }

  // One-time compatibility migration from the old single-manifest design.
  try {
    const legacy = JSON.parse(localStorage.getItem(OPFS_MANIFEST_KEY) || 'null');
    if (
      validRecoveryManifest(legacy) &&
      !manifests.some((item) => item.storageName === legacy.storageName)
    ) {
      manifests.push(legacy);
      persistRecoveryManifests(manifests);
    }
  } catch {
    // Ignore malformed legacy metadata; the v2 registry remains authoritative.
  }

  return sortRecoveryManifests(manifests);
};

const readRecoveryManifest = ({ broadcastId = '', storageName = '' } = {}) => {
  const manifests = readRecoveryManifests();
  return manifests.find((manifest) => (
    (!broadcastId || String(manifest.broadcastId) === String(broadcastId)) &&
    (!storageName || manifest.storageName === storageName)
  )) || null;
};

const writeRecoveryManifest = (recording, status = 'recording') => {
  if (typeof localStorage === 'undefined' || !recording?.storageName) return;

  const manifest = {
    version: 2,
    status,
    broadcastId: recording.broadcastId,
    title: recording.title,
    storageName: recording.storageName,
    startedAt: recording.startedAt,
    endedAt: recording.endedAt || null,
    sampleRate: Number(recording.sampleRate) || WAV_TARGET_SAMPLE_RATE,
    dataBytes: Number(recording.committedDataBytes ?? recording.dataBytes) || 0,
    channels: WAV_CHANNELS,
    bitDepth: WAV_BIT_DEPTH,
    updatedAt: Date.now(),
  };
  const manifests = readRecoveryManifests();
  const next = manifests.filter(
    (item) => item.storageName !== manifest.storageName
  );
  next.push(manifest);
  persistRecoveryManifests(next);
};

const clearRecoveryManifest = (storageName = '') => {
  if (typeof localStorage === 'undefined') return;
  const manifests = readRecoveryManifests();
  const next = storageName
    ? manifests.filter((manifest) => manifest.storageName !== storageName)
    : [];
  persistRecoveryManifests(next);
};

// Compatibility aliases for call sites merged from the background-autosave
// line, which names these helpers differently. One v2 registry implementation
// preserves multiple unfinished takes instead of overwriting the previous one.
const readRecoveryMetadata = () => readRecoveryManifest();
const persistRecoveryMetadata = (recording) =>
  writeRecoveryManifest(recording, 'recording');
const clearRecoveryMetadata = (broadcastId = '') => {
  if (typeof localStorage === 'undefined') return;
  if (!broadcastId) {
    clearRecoveryManifest();
    return;
  }
  const manifests = readRecoveryManifests();
  persistRecoveryManifests(
    manifests.filter(
      (manifest) => String(manifest.broadcastId) !== String(broadcastId)
    )
  );
};

const supportsOpfs = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.storage?.getDirectory === 'function';

const supportsLosslessWavCapture = () =>
  supportsEchooMasterPcmCapture() && supportsOpfs();

const supportedFallbackMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/ogg',
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

const cleanFilenamePart = (value) =>
  String(value || 'echoo-live-recording')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'echoo-live-recording';

const recordingDatePart = (timestamp) =>
  new Date(timestamp)
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);

const floatToPcm24 = (floatSamples) => {
  const output = new Uint8Array(floatSamples.length * WAV_BYTES_PER_SAMPLE);
  let offset = 0;

  for (let index = 0; index < floatSamples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, Number(floatSamples[index]) || 0));
    const signed = sample < 0
      ? Math.round(sample * 0x800000)
      : Math.round(sample * 0x7fffff);
    const value = signed < 0 ? signed + 0x1000000 : signed;

    output[offset] = value & 0xff;
    output[offset + 1] = (value >> 8) & 0xff;
    output[offset + 2] = (value >> 16) & 0xff;
    offset += 3;
  }

  return output;
};

export const createWavHeader = ({
  dataBytes,
  sampleRate,
  channels = WAV_CHANNELS,
  bitDepth = WAV_BIT_DEPTH,
}) => {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeText(36, 'data');
  view.setUint32(40, dataBytes, true);

  return new Uint8Array(buffer);
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const uploadQualityChunk = async ({ recording, samples, startMs, endMs, chunkIndex }) => {
  const pcm = floatToPcm24(samples);
  const header = createWavHeader({
    dataBytes: pcm.byteLength,
    sampleRate: recording.sampleRate,
    channels: QUALITY_CHUNK_CHANNELS,
    bitDepth: QUALITY_CHUNK_BIT_DEPTH,
  });
  const form = new FormData();
  form.append('chunk', new Blob([header, pcm], { type: WAV_MIME_TYPE }), `chunk-${chunkIndex}.wav`);
  form.append('chunkId', `${recording.broadcastId}-${chunkIndex}`);
  form.append('chunkIndex', String(chunkIndex));
  form.append('startMs', String(Math.round(startMs)));
  form.append('endMs', String(Math.round(endMs)));
  form.append('sampleRate', String(recording.sampleRate));
  form.append('channels', String(QUALITY_CHUNK_CHANNELS));
  form.append('bitDepth', String(QUALITY_CHUNK_BIT_DEPTH));

  let lastError = null;
  for (let attempt = 0; attempt < QUALITY_CHUNK_UPLOAD_RETRIES; attempt += 1) {
    if (recording.qualityChunkDisabled) throw new Error('Quality chunk upload was cancelled');
    try {
      const response = await apiFetch(`/broadcasts/${recording.broadcastId}/recording-chunks`, {
        method: 'POST',
        body: form,
        isFormData: true,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message || `Chunk upload failed (${response.status})`);
      console.info('[Echoo Recording] quality chunk uploaded', {
        broadcastId: recording.broadcastId,
        chunkIndex,
        startMs,
        endMs,
      });
      return data?.data || data;
    } catch (error) {
      lastError = error;
      if (recording.qualityChunkDisabled) throw error;
      if (attempt < QUALITY_CHUNK_UPLOAD_RETRIES - 1) await sleep(Math.min(15_000, 500 * (2 ** attempt)));
    }
  }
  throw lastError || new Error('Quality chunk upload failed');
};

const uploadStoredPcmChunk = async ({ recording, pcmBlob, startMs, endMs, chunkIndex }) => {
  const header = createWavHeader({
    dataBytes: pcmBlob.size,
    sampleRate: recording.sampleRate,
    channels: QUALITY_CHUNK_CHANNELS,
    bitDepth: QUALITY_CHUNK_BIT_DEPTH,
  });
  const form = new FormData();
  form.append('chunk', new Blob([header, pcmBlob], { type: WAV_MIME_TYPE }), `chunk-${chunkIndex}.wav`);
  form.append('chunkId', `${recording.broadcastId}-${chunkIndex}`);
  form.append('chunkIndex', String(chunkIndex));
  form.append('startMs', String(Math.round(startMs)));
  form.append('endMs', String(Math.round(endMs)));
  form.append('sampleRate', String(recording.sampleRate));
  form.append('channels', String(QUALITY_CHUNK_CHANNELS));
  form.append('bitDepth', String(QUALITY_CHUNK_BIT_DEPTH));

  let lastError = null;
  for (let attempt = 0; attempt < QUALITY_CHUNK_UPLOAD_RETRIES; attempt += 1) {
    if (recording.qualityChunkDisabled) throw new Error('Quality chunk upload was cancelled');
    try {
      const response = await apiFetch(`/broadcasts/${recording.broadcastId}/recording-chunks`, {
        method: 'POST',
        body: form,
        isFormData: true,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message || `Chunk upload failed (${response.status})`);
      console.info('[Echoo Recording] post-live quality chunk uploaded', {
        broadcastId: recording.broadcastId,
        chunkIndex,
        startMs,
        endMs,
      });
      return data?.data || data;
    } catch (error) {
      lastError = error;
      if (recording.qualityChunkDisabled) throw error;
      if (attempt < QUALITY_CHUNK_UPLOAD_RETRIES - 1) {
        await sleep(Math.min(15_000, 500 * (2 ** attempt)));
      }
    }
  }
  throw lastError || new Error('Quality chunk upload failed');
};

// Realtime audio has first priority. The lossless master is already streaming
// safely into OPFS while LiveKit is on air, so do not compete with WebRTC by
// uploading ~2.3 Mbps of raw PCM at the same time. After LiveKit has stopped,
// read the finished OPFS master in bounded pieces and upload those pieces
// sequentially. This keeps memory bounded and preserves the no-giant-upload
// architecture while protecting the live stream from recording traffic.
const uploadLosslessMasterAfterLive = async (recording, file) => {
  if (!recording?.qualityChunkStarted || recording.qualityChunkDisabled || !file?.size) return;

  const bytesPerSecond =
    recording.sampleRate * QUALITY_CHUNK_CHANNELS * (QUALITY_CHUNK_BIT_DEPTH / 8);
  const targetBytes = Math.max(1, Math.round(bytesPerSecond * QUALITY_CHUNK_SECONDS));
  const totalPcmBytes = Math.max(0, Number(file.size || 0) - 44);
  let offset = 0;
  let chunkIndex = 0;

  while (offset < totalPcmBytes && !recording.qualityChunkDisabled) {
    const take = Math.min(targetBytes, totalPcmBytes - offset);
    const startMs = (offset * 1000) / bytesPerSecond;
    const endMs = ((offset + take) * 1000) / bytesPerSecond;
    const pcmBlob = file.slice(44 + offset, 44 + offset + take);

    try {
      await uploadStoredPcmChunk({ recording, pcmBlob, startMs, endMs, chunkIndex });
    } catch (error) {
      recording.qualityChunkErrors.push({
        chunkIndex,
        message: error?.message || String(error),
      });
      console.error('[Echoo Recording] post-live quality chunk upload failed', {
        broadcastId: recording.broadcastId,
        chunkIndex,
        error: error?.message || error,
      });
    }

    offset += take;
    chunkIndex += 1;
  }

  recording.qualityChunkIndex = chunkIndex;
  recording.qualityCursorMs = (offset * 1000) / bytesPerSecond;
};

const flushQualityChunk = async (recording, { force = false } = {}) => {
  if (!recording.qualityChunkStarted || recording.qualityChunkDisabled) return;
  const targetSamples = Math.max(1, Math.round(recording.sampleRate * QUALITY_CHUNK_SECONDS * QUALITY_CHUNK_CHANNELS));
  while (recording.qualitySampleCount >= targetSamples || (force && recording.qualitySampleCount > 0)) {
    const take = recording.qualitySampleCount >= targetSamples ? targetSamples : recording.qualitySampleCount;
    const samples = new Float32Array(take);
    let written = 0;
    while (written < take && recording.qualityBuffers.length) {
      const current = recording.qualityBuffers[0];
      const needed = take - written;
      const copyCount = Math.min(needed, current.length);
      samples.set(current.subarray(0, copyCount), written);
      written += copyCount;
      recording.qualitySampleCount -= copyCount;
      if (copyCount === current.length) recording.qualityBuffers.shift();
      else recording.qualityBuffers[0] = current.subarray(copyCount);
    }
    const chunkIndex = recording.qualityChunkIndex;
    recording.qualityChunkIndex += 1;
    const startMs = recording.qualityCursorMs;
    const endMs = startMs + (take * 1000) / (recording.sampleRate * QUALITY_CHUNK_CHANNELS);
    recording.qualityCursorMs = endMs;
    recording.qualityChain = recording.qualityChain
      .then(() => uploadQualityChunk({ recording, samples, startMs, endMs, chunkIndex }))
      .catch((error) => {
        if (recording.qualityChunkDisabled) return;
        recording.qualityChunkErrors.push({ chunkIndex, message: error?.message || String(error) });
        console.error('[Echoo Recording] quality chunk upload failed', { broadcastId: recording.broadcastId, chunkIndex, error: error?.message || error });
      });
  }
};

const startQualityChunking = async (recording) => {
  let lastError = null;
  for (let attempt = 0; attempt < QUALITY_CHUNK_START_RETRIES; attempt += 1) {
    try {
      const response = await apiFetch(`/broadcasts/${recording.broadcastId}/recording-chunks/start`, {
        method: 'POST',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const startError = new Error(
          data?.error?.message || `Could not start recording pipeline (${response.status})`
        );
        startError.code = data?.error?.code || 'RECORDING_PIPELINE_START_FAILED';
        startError.status = response.status;
        throw startError;
      }

      if (data?.data?.mode === 'server-egress') {
        recording.serverRecordingPrimary = true;
        recording.qualityChunkStarted = false;
        console.info('[Echoo Recording] LiveKit server recording is primary; browser master is recovery-only', {
          broadcastId: recording.broadcastId,
        });
        return true;
      }

      recording.serverRecordingPrimary = false;

      if (data?.data?.mode === 'browser-fallback') {
        // This mode is valid only for post-live recovery, when the full OPFS
        // master is uploaded in bounded chunks after WebRTC has stopped.
        recording.qualityChunkStarted = true;
        return true;
      }

      // Healthy live audio must never compete with raw PCM/WAV uploads. If
      // server Egress is unavailable, keep OPFS as the only recording path
      // until OFF AIR and recover the server replay afterwards.
      recording.qualityChunkStarted = false;
      recording.serverFallbackDeferred = true;
      console.warn('[Echoo Recording] server recorder unavailable; browser recovery is deferred until off air', {
        broadcastId: recording.broadcastId,
      });
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < QUALITY_CHUNK_START_RETRIES - 1) await sleep(300 + attempt * 700);
    }
  }
  throw lastError || new Error('Could not start quality chunking');
};

const completeQualityChunks = async (
  recording,
  { force = false, uploadErrorsOverride = null } = {}
) => {
  if (!recording?.broadcastId || (!recording.qualityChunkStarted && !force)) return false;

  const uploadErrors = uploadErrorsOverride == null
    ? Number(recording.qualityChunkErrors?.length || 0)
    : Math.max(0, Number(uploadErrorsOverride) || 0);
  let lastError = null;

  for (let attempt = 0; attempt < QUALITY_CHUNK_COMPLETE_RETRIES; attempt += 1) {
    try {
      const response = await apiFetch(`/broadcasts/${recording.broadcastId}/recording-chunks/complete`, {
        method: 'POST',
        body: JSON.stringify({
          qualityChunkCount: Number(recording.qualityChunkIndex ?? recording.qualityChunkCount) || 0,
          qualityChunkUploadErrors: uploadErrors,
        }),
      });
      const data = await response.json().catch(() => null);

      // A force-close is used after a possibly-lost start response. If the start
      // never reached the backend, there is simply no durable session to close.
      if (
        force &&
        response.status === 409 &&
        data?.error?.code === 'QUALITY_CHUNKING_NOT_STARTED'
      ) {
        recording.qualityCompletionPending = false;
        recording.qualityCompletionError = '';
        return false;
      }

      if (!response.ok) {
        throw new Error(data?.error?.message || `Could not close quality chunk uploads (${response.status})`);
      }

      recording.qualityCompletionPending = false;
      recording.qualityCompletionError = '';
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < QUALITY_CHUNK_COMPLETE_RETRIES - 1) {
        await sleep(Math.min(15_000, 500 * (2 ** attempt)));
      }
    }
  }

  recording.qualityCompletionPending = true;
  recording.qualityCompletionError = lastError?.message || 'Could not close quality chunk uploads';
  throw lastError || new Error(recording.qualityCompletionError);
};

const appendQualityPcm = (recording, buffer) => {
  if (!buffer || recording.qualityChunkDisabled || !recording.qualityChunkStarted) return;
  const samples = new Float32Array(buffer);
  if (!samples.length) return;
  const maximumSamples = Math.max(
    1,
    Math.round(recording.sampleRate * QUALITY_CHUNK_CHANNELS * MAX_QUEUED_PCM_SECONDS)
  );
  if (recording.qualitySampleCount + samples.length > maximumSamples) {
    recording.qualityChunkDisabled = true;
    recording.qualityBuffers = [];
    recording.qualitySampleCount = 0;
    recording.qualityChunkErrors.push({
      chunkIndex: recording.qualityChunkIndex,
      message: 'Optional PCM transport fell behind and was stopped to protect realtime audio.',
    });
    console.warn('[Echoo Recording] optional PCM transport exceeded its bounded queue; LiveKit continues.');
    return;
  }
  recording.qualityBuffers.push(samples);
  recording.qualitySampleCount += samples.length;
  if (recording.qualityChunkStarted) void flushQualityChunk(recording);
};

const safeRemoveOpfsEntry = async (directory, name) => {
  if (!directory || !name) return;
  try {
    await directory.removeEntry(name);
  } catch (error) {
    if (error?.name !== 'NotFoundError') {
      console.warn(
        '[Echoo Recording] temporary recording cleanup warning:',
        error?.message || error
      );
    }
  }
};

const openLosslessRecordingFile = async (broadcastId) => {
  if (!supportsOpfs()) {
    throw new Error('Browser-backed recording storage is not available.');
  }

  // Best effort: ask the browser to treat unresolved creator recordings as
  // persistent storage. A denial is not fatal; OPFS capture still proceeds.
  try {
    await navigator.storage.persist?.();
  } catch {
    // Browser persistence permission is optional.
  }

  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(OPFS_DIRECTORY, { create: true });

  const safeId = cleanFilenamePart(broadcastId).slice(0, 50);
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storageName = `echoo-tmp-${safeId}-${randomPart}.wav`;
  const fileHandle = await directory.getFileHandle(storageName, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(new Uint8Array(44));

  return { directory, fileHandle, writable, storageName };
};

const checkpointLosslessRecording = async (recording, status = 'recording') => {
  if (!recording?.writable || recording.writeError) return;
  const committedBytes = Number(recording.committedDataBytes) || 0;
  const header = createWavHeader({
    dataBytes: committedBytes,
    sampleRate: Number(recording.sampleRate) || WAV_TARGET_SAMPLE_RATE,
    channels: WAV_CHANNELS,
    bitDepth: WAV_BIT_DEPTH,
  });
  await recording.writable.seek(0);
  await recording.writable.write(header);
  await recording.writable.close();
  recording.writable = await recording.fileHandle.createWritable({ keepExistingData: true });
  await recording.writable.seek(44 + committedBytes);
  writeRecoveryManifest(recording, status);
};

const queueLosslessCheckpoint = (recording, status = 'recording') => {
  if (!recording || recording.stopping || recording.writeError) return recording?.writeChain;
  recording.writeChain = recording.writeChain
    .then(() => checkpointLosslessRecording(recording, status))
    .catch((error) => {
      recording.writeError = error;
      writeRecoveryManifest(recording, 'recovery_required');
      console.error('[Echoo Recording] durable checkpoint failed:', error?.message || error);
    });
  return recording.writeChain;
};

const stopLosslessRecording = async (recording, { keep = true } = {}) => {
  if (!recording) return null;

  try {
    recording.stopping = true;
    window.clearInterval(recording.checkpointTimer);
    window.removeEventListener('pagehide', recording.onPageHide);
    if (recording.capture) {
      await recording.capture.stop();
      recording.capture = null;
    }

    if (!keep) {
      recording.qualityChunkDisabled = true;
      recording.qualityBuffers = [];
      recording.qualitySampleCount = 0;
    }

    // Drain browser-storage writes first. Network recording transfer happens
    // only after the realtime publisher has already been stopped by the
    // Creator end-broadcast flow.
    await recording.writeChain;

    if (recording.writeError) throw recording.writeError;

    if (!keep || !recording.dataBytes) {
      await recording.writable?.close();
      recording.writable = null;
      await safeRemoveOpfsEntry(recording.directory, recording.storageName);
      clearRecoveryManifest(recording.storageName);
      return null;
    }

    const sampleRate = Number(recording.sampleRate) || WAV_TARGET_SAMPLE_RATE;
    const header = createWavHeader({
      dataBytes: recording.dataBytes,
      sampleRate,
      channels: WAV_CHANNELS,
      bitDepth: WAV_BIT_DEPTH,
    });

    await recording.writable.seek(0);
    await recording.writable.write(header);
    await recording.writable.close();
    recording.writable = null;
    recording.committedDataBytes = recording.dataBytes;
    recording.endedAt = Date.now();
    writeRecoveryManifest(recording, 'pending_upload');

    const file = await recording.fileHandle.getFile();
    // OPFS FileSystemFileHandle.getFile() commonly returns a File whose
    // `type` is empty because OPFS stores bytes, not HTTP MIME metadata.
    // Wrap it as a Blob so downstream local WAV/MP3 export can identify the
    // master without contacting the server. Blob composition is lazy; this
    // does not read the whole long recording into JavaScript memory.
    const wavBlob = String(file.type || '').toLowerCase().includes('wav')
      ? file
      : new Blob([file], { type: WAV_MIME_TYPE });

    if (
      keep &&
      !recording.serverRecordingPrimary &&
      recording.qualityChunkStarted &&
      !recording.qualityChunkDisabled
    ) {
      await uploadLosslessMasterAfterLive(recording, wavBlob);
      try {
        await completeQualityChunks(recording);
      } catch (error) {
        // The OPFS master stays intact. Retry can safely re-run finalization
        // without risking the creator's only copy.
        recording.qualityCompletionPending = true;
        recording.qualityCompletionError = error?.message || String(error);
        console.error('[Echoo Recording] quality chunk completion acknowledgement failed', error?.message || error);
      }
    }

    const durationSeconds = recording.dataBytes /
      (sampleRate * WAV_CHANNELS * WAV_BYTES_PER_SAMPLE);

    // Keep the pending_upload recovery manifest until server-side MP3
    // persistence is confirmed. The autosave success path disposes this OPFS
    // master and clears the manifest; a tab close before then must remain
    // recoverable.
    return {
      broadcastId: recording.broadcastId,
      blob: wavBlob,
      mimeType: WAV_MIME_TYPE,
      durationSeconds: Math.max(1, durationSeconds),
      sampleRate,
      channels: WAV_CHANNELS,
      bitDepth: WAV_BIT_DEPTH,
      lossless: true,
      recordingFormat: 'pcm-wav',
      captureSource: 'echoo-post-master-bus',
      storageMode: 'opfs-stream',
      audioBitsPerSecond: sampleRate * WAV_CHANNELS * WAV_BIT_DEPTH,
      startedAt: new Date(recording.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      filename: `${cleanFilenamePart(recording.title)}-${recordingDatePart(recording.startedAt)}.wav`,
      limitReached: Boolean(recording.limitReached),
      qualityChunkCount: recording.qualityChunkIndex,
      qualityChunkErrors: recording.qualityChunkErrors,
      serverRecordingPrimary: Boolean(recording.serverRecordingPrimary),
      qualityCompletionPending: Boolean(recording.qualityCompletionPending),
      qualityCompletionError: recording.qualityCompletionError || '',
      dispose: async () => {
        await safeRemoveOpfsEntry(recording.directory, recording.storageName);
        clearRecoveryManifest(recording.storageName);
      },
    };
  } catch (error) {
    try {
      await recording.writable?.close();
    } catch {
      // Ignore close failure while unwinding the recorder.
    }
    recording.writable = null;
    if (keep && (recording.committedDataBytes || recording.dataBytes)) {
      writeRecoveryManifest(recording, 'recovery_required');
    } else {
      await safeRemoveOpfsEntry(recording.directory, recording.storageName);
      clearRecoveryManifest(recording.storageName);
    }
    throw error;
  }
};

const startLosslessRecording = async ({ broadcastId, title }) => {
  if (!supportsEchooMasterPcmCapture()) {
    throw new Error('Direct master-bus PCM capture is not supported by this browser.');
  }
  if (!supportsOpfs()) {
    throw new Error(
      'This browser cannot stream a long lossless master to local recording storage.'
    );
  }

  const storage = await openLosslessRecordingFile(broadcastId);
  const recording = {
    mode: 'lossless-wav',
    capture: null,
    dataBytes: 0,
    committedDataBytes: 0,
    broadcastId: String(broadcastId || ''),
    title,
    startedAt: Date.now(),
    sampleRate: null,
    limitReached: false,
    writeError: null,
    writeChain: Promise.resolve(),
    qualityBuffers: [],
    qualitySampleCount: 0,
    qualityChunkIndex: 0,
    qualityCursorMs: 0,
    qualityChain: Promise.resolve(),
    qualityChunkErrors: [],
    qualityChunkDisabled: false,
    qualityChunkStarted: false,
    qualityCompletionPending: false,
    qualityCompletionError: '',
    serverRecordingPrimary: false,
    stopping: false,
    checkpointTimer: null,
    onPageHide: null,
    ...storage,
  };
  persistRecoveryMetadata(recording);

  try {
    const capture = await startEchooMasterPcmCapture({
      onPcm: (buffer) => {
        if (!buffer || recording.limitReached || recording.writeError) return;

        const floats = new Float32Array(buffer);
        const pcm = floatToPcm24(floats);

        if (recording.dataBytes + pcm.byteLength > MAX_WAV_DATA_BYTES) {
          recording.limitReached = true;
          console.error(
            '[Echoo Recording] WAV master reached the classic RIFF/WAV 4 GB data limit.'
          );
          return;
        }

        recording.dataBytes += pcm.byteLength;
        // Keep the lossless master local while on air. Server chunk transfer is
        // deferred until LiveKit has stopped so recording cannot starve WebRTC.
        recording.writeChain = recording.writeChain
          .then(async () => {
            await recording.writable.write(pcm);
            recording.committedDataBytes += pcm.byteLength;
          })
          .catch((error) => {
            recording.writeError = error;
            console.error(
              '[Echoo Recording] browser storage write failed:',
              error?.message || error
            );
          });
      },
    });

    recording.capture = capture;
    recording.sampleRate = capture.sampleRate;
    writeRecoveryManifest(recording, 'recording');
    recording.checkpointTimer = window.setInterval(
      () => { void queueLosslessCheckpoint(recording); },
      OPFS_CHECKPOINT_MS
    );
    recording.onPageHide = () => { void queueLosslessCheckpoint(recording, 'recovery_required'); };
    window.addEventListener('pagehide', recording.onPageHide);
    void navigator.storage?.persist?.().catch(() => false);
  } catch (error) {
    try {
      await recording.writable.close();
    } catch {
      // Ignore close failure while unwinding setup.
    }
    await safeRemoveOpfsEntry(recording.directory, recording.storageName);
    clearRecoveryManifest(recording.storageName);
    throw error;
  }

  console.log('[Echoo Recording] lossless WAV master recording started from the live master bus', {
    broadcastId: recording.broadcastId,
    sampleRate: recording.sampleRate,
    channels: WAV_CHANNELS,
    bitDepth: WAV_BIT_DEPTH,
    source: recording.capture.source,
    storage: 'OPFS stream',
    format: 'PCM WAV',
  });

  return recording;
};

const stopFallbackRecording = (recording, { keep = true } = {}) =>
  new Promise((resolve) => {
    if (!recording?.recorder) {
      resolve(null);
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;

      try {
        recording.track?.stop();
      } catch {
        // The cloned fallback track may already be ended.
      }

      if (!keep) {
        resolve(null);
        return;
      }

      const mimeType =
        recording.recorder.mimeType || recording.mimeType || 'audio/webm';
      const blob = new Blob(recording.chunks, { type: mimeType });
      const durationSeconds = Math.max(
        1,
        (Date.now() - recording.startedAt) / 1000
      );
      const extension = String(mimeType).includes('ogg') ? 'ogg' : 'webm';

      resolve({
        broadcastId: recording.broadcastId,
        blob,
        mimeType,
        durationSeconds,
        sampleRate: null,
        channels: 2,
        bitDepth: null,
        lossless: false,
        recordingFormat: 'opus-fallback',
        captureSource: 'published-media-track-fallback',
        storageMode: 'memory-opus-fallback',
        targetAudioBitsPerSecond: OPUS_FALLBACK_BITRATE,
        audioBitsPerSecond:
          Number(recording.recorder.audioBitsPerSecond) || OPUS_FALLBACK_BITRATE,
        startedAt: new Date(recording.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        filename: `${cleanFilenamePart(recording.title)}-${recordingDatePart(recording.startedAt)}.${extension}`,
        qualityChunkCount: 0,
        qualityChunkErrors: [],
        qualityCompletionPending: false,
        qualityCompletionError: '',
      });
    };

    if (recording.recorder.state === 'inactive') {
      finish();
      return;
    }

    recording.recorder.addEventListener('stop', finish, { once: true });

    try {
      recording.recorder.requestData();
    } catch {
      // Some browsers do not allow requestData immediately before stop.
    }

    try {
      recording.recorder.stop();
    } catch {
      finish();
    }
  });

const startFallbackRecording = ({ broadcastId, mediaTrack, title }) => {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported by this browser.');
  }

  const mimeType = supportedFallbackMimeType();
  const clonedTrack = mediaTrack.clone();
  const stream = new MediaStream([clonedTrack]);
  const options = { audioBitsPerSecond: OPUS_FALLBACK_BITRATE };
  if (mimeType) options.mimeType = mimeType;

  const recorder = new MediaRecorder(stream, options);
  const chunks = [];

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size) chunks.push(event.data);
  });

  recorder.addEventListener('error', (event) => {
    console.error('[Echoo Recording] fallback recorder error', event?.error || event);
  });

  const recording = {
    mode: 'opus-fallback',
    recorder,
    stream,
    track: clonedTrack,
    chunks,
    mimeType,
    broadcastId: String(broadcastId || ''),
    title,
    startedAt: Date.now(),
  };

  recorder.start(1000);
  console.warn(
    '[Echoo Recording] using high-quality Opus fallback because disk-backed lossless capture was unavailable.'
  );
  return recording;
};

const stopRecording = async (recording, options) => {
  if (recording?.mode === 'lossless-wav') {
    return stopLosslessRecording(recording, options);
  }
  return stopFallbackRecording(recording, options);
};

const activeRecordingSnapshot = (recording) => ({
  supported: Boolean(recording),
  recording: Boolean(recording),
  broadcastId: recording?.broadcastId || null,
  startedAt: recording?.startedAt || null,
  recordingFormat: recording?.mode || null,
  captureSource:
    recording?.mode === 'lossless-wav'
      ? 'echoo-post-master-bus'
      : 'published-media-track-fallback',
  storageMode:
    recording?.mode === 'lossless-wav'
      ? 'opfs-stream'
      : 'memory-opus-fallback',
  lossless: recording?.mode === 'lossless-wav',
  sampleRate: recording?.sampleRate || null,
  channels: recording?.mode === 'lossless-wav' ? WAV_CHANNELS : 2,
  bitDepth: recording?.mode === 'lossless-wav' ? WAV_BIT_DEPTH : null,
  qualityChunking: Boolean(recording?.qualityChunkStarted && !recording?.qualityChunkDisabled),
  serverRecordingPrimary: Boolean(recording?.serverRecordingPrimary),
});

export const getBroadcastRecordingState = () => ({
  supported:
    supportsLosslessWavCapture() || typeof MediaRecorder !== 'undefined',
  recording: Boolean(activeRecording),
  broadcastId: activeRecording?.broadcastId || null,
  startedAt: activeRecording?.startedAt || null,
  pending: Boolean(pendingRecording),
  recordingFormat: activeRecording?.mode || null,
  captureSource:
    activeRecording?.mode === 'lossless-wav'
      ? 'echoo-post-master-bus'
      : activeRecording
        ? 'published-media-track-fallback'
        : null,
  storageMode:
    activeRecording?.mode === 'lossless-wav'
      ? 'opfs-stream'
      : activeRecording
        ? 'memory-opus-fallback'
        : null,
  lossless: activeRecording?.mode === 'lossless-wav',
  sampleRate: activeRecording?.sampleRate || null,
  channels: activeRecording?.mode === 'lossless-wav' ? WAV_CHANNELS : null,
  bitDepth: activeRecording?.mode === 'lossless-wav' ? WAV_BIT_DEPTH : null,
  qualityChunking: Boolean(activeRecording?.qualityChunkStarted && !activeRecording?.qualityChunkDisabled),
  serverRecordingPrimary: Boolean(activeRecording?.serverRecordingPrimary),
});

export const ensureBroadcastRecording = async ({
  broadcastId,
  mediaTrack,
  title = 'Echoo live recording',
}) => {
  const id = String(broadcastId || '');

  if (!id || !mediaTrack || mediaTrack.kind !== 'audio') {
    return { supported: false, recording: false };
  }

  if (activeRecording?.broadcastId === id) {
    return activeRecordingSnapshot(activeRecording);
  }

  if (activeRecording) {
    await stopRecording(activeRecording, { keep: false });
    activeRecording = null;
  }

  try {
    activeRecording = await startLosslessRecording({
      broadcastId: id,
      title,
    });
    try {
      await startQualityChunking(activeRecording);
    } catch (error) {
      const startMessage = error?.message || String(error);
      activeRecording.qualityChunkErrors.push({ chunkIndex: -2, message: startMessage });

      if (error?.code === 'FFMPEG_REQUIRED' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('echoo:toast', {
          detail: {
            type: 'error',
            message: 'Server recording is unavailable because FFmpeg/FFprobe is not installed. Your local safety master is still recording, but this broadcast cannot auto-save a server MP3 until the server is fixed.',
          },
        }));
      }

      // The server may have accepted the idempotent start while all responses
      // were lost. Best-effort force-close records that ambiguous session as a
      // failed quality path instead of leaving qualityChunkingStartedAt open
      // forever. A 409 NOT_STARTED is treated as a harmless no-op.
      try {
        await completeQualityChunks(activeRecording, {
          force: true,
          uploadErrorsOverride: Math.max(1, activeRecording.qualityChunkErrors.length),
        });
      } catch (completionError) {
        activeRecording.qualityCompletionPending = true;
        activeRecording.qualityCompletionError = completionError?.message || String(completionError);
      }

      activeRecording.qualityChunkDisabled = true;
      activeRecording.qualityBuffers = [];
      activeRecording.qualitySampleCount = 0;
      console.warn('[Echoo Recording] live quality chunking is disabled for this take:', startMessage);
    }
  } catch (losslessError) {
    console.warn(
      '[Echoo Recording] disk-backed lossless master capture could not start:',
      losslessError?.message || losslessError
    );

    try {
      activeRecording = startFallbackRecording({
        broadcastId: id,
        mediaTrack,
        title,
      });
    } catch (fallbackError) {
      console.error(
        '[Echoo Recording] no local recording path is available:',
        fallbackError?.message || fallbackError
      );
      return { supported: false, recording: false };
    }
  }

  return activeRecordingSnapshot(activeRecording);
};

export const finishBroadcastRecording = async (broadcastId) => {
  const id = String(broadcastId || '');

  if (!activeRecording || activeRecording.broadcastId !== id) {
    return null;
  }

  const recording = activeRecording;
  activeRecording = null;

  const finished = await stopRecording(recording, { keep: true });
  if (!finished?.blob?.size) return null;

  pendingRecording = finished;
  return finished;
};

/**
 * Reopen the last checkpointed OPFS master after a reload/browser crash.
 * Blob composition is lazy: the large audio payload is not decoded or copied
 * onto the main thread.
 */
export const recoverPendingBroadcastRecording = async () => {
  if (pendingRecording?.blob?.size) return pendingRecording;
  if (!supportsOpfs()) return null;
  const manifest = readRecoveryManifest();
  if (!manifest?.storageName) return null;

  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(OPFS_DIRECTORY);
    const fileHandle = await directory.getFileHandle(manifest.storageName);
    const sourceFile = await fileHandle.getFile();
    const dataBytes = Math.max(0, sourceFile.size - 44);
    if (!dataBytes) return null;
    const sampleRate = Number(manifest.sampleRate) || WAV_TARGET_SAMPLE_RATE;
    const header = createWavHeader({
      dataBytes,
      sampleRate,
      channels: WAV_CHANNELS,
      bitDepth: WAV_BIT_DEPTH,
    });
    const blob = new Blob([header, sourceFile.slice(44)], { type: WAV_MIME_TYPE });
    const startedAt = Number(manifest.startedAt) || Number(sourceFile.lastModified) || Date.now();
    const endedAt = Number(manifest.endedAt) || Number(sourceFile.lastModified) || Date.now();
    const recording = {
      broadcastId: String(manifest.broadcastId),
      blob,
      mimeType: WAV_MIME_TYPE,
      durationSeconds: Math.max(1, dataBytes / (sampleRate * WAV_CHANNELS * WAV_BYTES_PER_SAMPLE)),
      sampleRate,
      channels: WAV_CHANNELS,
      bitDepth: WAV_BIT_DEPTH,
      lossless: true,
      recordingFormat: 'pcm-wav',
      captureSource: 'echoo-post-master-bus',
      storageMode: 'opfs-recovered',
      audioBitsPerSecond: sampleRate * WAV_CHANNELS * WAV_BIT_DEPTH,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      filename: `${cleanFilenamePart(manifest.title)}-${recordingDatePart(startedAt)}.wav`,
      recoveredAfterRestart: true,
      qualityChunkCount: 0,
      qualityChunkErrors: [],
      qualityCompletionPending: false,
      qualityCompletionError: '',
      dispose: async () => {
        await safeRemoveOpfsEntry(directory, manifest.storageName);
        clearRecoveryManifest(manifest.storageName);
      },
    };
    pendingRecording = recording;
    return recording;
  } catch (error) {
    if (error?.name === 'NotFoundError') clearRecoveryManifest(manifest.storageName);
    console.warn('[Echoo Recording] could not reopen checkpointed master', error?.message || error);
    return null;
  }
};

export const uploadRecoveryMasterToServer = async (recording) => {
  if (!recording?.broadcastId || !recording?.blob?.size) {
    throw new Error('No local recovery master is available for server rescue.');
  }

  const recovery = {
    broadcastId: String(recording.broadcastId),
    sampleRate: Number(recording.sampleRate) || WAV_TARGET_SAMPLE_RATE,
    qualityBuffers: [],
    qualitySampleCount: 0,
    qualityChunkIndex: 0,
    qualityCursorMs: 0,
    qualityChain: Promise.resolve(),
    qualityChunkErrors: [],
    qualityChunkDisabled: false,
    qualityChunkStarted: false,
    qualityCompletionPending: false,
    qualityCompletionError: '',
    serverRecordingPrimary: false,
  };

  await startQualityChunking(recovery);
  if (recovery.serverRecordingPrimary) {
    return { recovered: false, mode: 'server-egress' };
  }

  await uploadLosslessMasterAfterLive(recovery, recording.blob);
  await completeQualityChunks(recovery);
  recording.qualityChunkCount = recovery.qualityChunkIndex;
  recording.qualityChunkErrors = recovery.qualityChunkErrors;
  recording.qualityCompletionPending = recovery.qualityCompletionPending;
  recording.qualityCompletionError = recovery.qualityCompletionError;
  recording.serverFallbackAttempted = true;

  return {
    recovered: true,
    mode: 'browser-fallback',
    qualityChunkCount: recovery.qualityChunkIndex,
    qualityChunkUploadErrors: recovery.qualityChunkErrors.length,
  };
};

export const retryBroadcastQualityCompletion = async (recording) => {
  if (!recording?.qualityCompletionPending || !recording?.broadcastId) return true;

  const retryState = {
    broadcastId: recording.broadcastId,
    qualityChunkStarted: true,
    qualityChunkIndex: Number(recording.qualityChunkCount) || 0,
    qualityChunkErrors: Array.isArray(recording.qualityChunkErrors) ? recording.qualityChunkErrors : [],
    qualityCompletionPending: true,
    qualityCompletionError: recording.qualityCompletionError || '',
  };

  await completeQualityChunks(retryState, {
    force: true,
    uploadErrorsOverride: retryState.qualityChunkErrors.length,
  });
  recording.qualityCompletionPending = false;
  recording.qualityCompletionError = '';
  return true;
};

export const announceFinishedBroadcastRecording = ({
  recording,
  broadcast,
  serverEndPromise = null,
  deviceSaveReservation = null,
} = {}) => {
  if (!recording?.blob?.size || typeof window === 'undefined') return;

  pendingRecording = recording;
  window.dispatchEvent(
    new CustomEvent(RECORDING_EVENT, {
      detail: {
        recording,
        broadcast: broadcast || null,
        serverEndPromise,
        deviceSaveReservation,
      },
    })
  );
};

export const discardBroadcastRecording = async (broadcastId = '') => {
  const id = String(broadcastId || '');

  if (activeRecording && (!id || activeRecording.broadcastId === id)) {
    const recording = activeRecording;
    activeRecording = null;
    await stopRecording(recording, { keep: false });
  }
  clearRecoveryMetadata(id);

  if (!id || pendingRecording?.broadcastId === id) {
    const recording = pendingRecording;
    pendingRecording = null;
    await recording?.dispose?.();
  }
};

export const clearPendingBroadcastRecording = (broadcastId = '') => {
  const id = String(broadcastId || '');
  if (!id || pendingRecording?.broadcastId === id) {
    const recording = pendingRecording;
    pendingRecording = null;
    void recording?.dispose?.();
  }
  clearRecoveryMetadata(id);
};

// Best-effort flush when the tab is hidden/closed mid-take: close the OPFS
// writer so the file is complete on disk. The WAV header is patched on
// recovery (dataBytes = file size - 44), so a close without header is fine.
export const flushRecordingForPageHide = async () => {
  persistRecoveryMetadata(activeRecording);
  try {
    await activeRecording?.writable?.close();
  } catch {
    // The writer may already be closed or closing.
  }
  if (activeRecording) activeRecording.writable = null;
};

// Recover the newest orphaned OPFS master left by a closed/crashed tab.
// Recovery metadata is not discarded merely because time passed; browser
// storage eviction or an explicit creator discard is the real lifetime bound.
// Additional unfinished takes remain registered and can be recovered later.
// Returns { recording, broadcast } shaped like announceFinishedBroadcastRecording,
// or null when there is nothing recoverable.
export const recoverOrphanedLosslessRecording = async () => {
  if (!supportsOpfs()) return null;
  if (activeRecording || pendingRecording) return null;
  const meta = readRecoveryMetadata();
  if (!meta) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(OPFS_DIRECTORY, { create: false });
    const fileHandle = await directory.getFileHandle(meta.storageName, { create: false });
    const file = await fileHandle.getFile();
    const dataBytes = Math.max(0, Number(file.size || 0) - 44);
    if (!dataBytes) {
      await safeRemoveOpfsEntry(directory, meta.storageName);
      clearRecoveryMetadata(meta.broadcastId);
      return null;
    }
    const sampleRate = Number(meta.sampleRate) || WAV_TARGET_SAMPLE_RATE;
    try {
      // createWritable() truncates by default. Recovery is only patching the
      // 44-byte WAV header, so preserve the PCM body already stored in OPFS.
      const writable = await fileHandle.createWritable({ keepExistingData: true });
      await writable.seek(0);
      await writable.write(createWavHeader({
        dataBytes,
        sampleRate,
        channels: WAV_CHANNELS,
        bitDepth: WAV_BIT_DEPTH,
      }));
      await writable.close();
    } catch {
      // Header patch is best-effort; the raw PCM size is still usable info.
    }
    const patched = await fileHandle.getFile();
    const wavBlob = String(patched.type || '').toLowerCase().includes('wav')
      ? patched
      : new Blob([patched], { type: WAV_MIME_TYPE });
    const durationSeconds = Math.max(1, dataBytes / (sampleRate * WAV_CHANNELS * WAV_BYTES_PER_SAMPLE));
    const recording = {
      broadcastId: String(meta.broadcastId),
      blob: wavBlob,
      mimeType: WAV_MIME_TYPE,
      durationSeconds,
      sampleRate,
      channels: WAV_CHANNELS,
      bitDepth: WAV_BIT_DEPTH,
      lossless: true,
      recordingFormat: 'pcm-wav',
      captureSource: 'echoo-post-master-bus',
      storageMode: 'opfs-stream',
      audioBitsPerSecond: sampleRate * WAV_CHANNELS * WAV_BIT_DEPTH,
      startedAt: new Date(Number(meta.startedAt) || Date.now()).toISOString(),
      endedAt: new Date(Number(file.lastModified || Date.now())).toISOString(),
      filename: `${cleanFilenamePart(meta.title)}-${recordingDatePart(Number(meta.startedAt) || Date.now())}.wav`,
      limitReached: false,
      qualityChunkCount: 0,
      qualityChunkErrors: [],
      qualityCompletionPending: false,
      qualityCompletionError: '',
      recovered: true,
      recoveredAfterRestart: true,
      dispose: async () => {
        await safeRemoveOpfsEntry(directory, meta.storageName);
        clearRecoveryManifest(meta.storageName);
      },
    };
    pendingRecording = recording;
    return { recording, broadcast: { title: String(meta.title || 'Echoo live recording') } };
  } catch {
    return null;
  }
};

export const BROADCAST_RECORDING_READY_EVENT = RECORDING_EVENT;

export const ECHOO_BROADCAST_MASTER_FORMAT = {
  mimeType: WAV_MIME_TYPE,
  sampleRate: WAV_TARGET_SAMPLE_RATE,
  channels: WAV_CHANNELS,
  bitDepth: WAV_BIT_DEPTH,
  lossless: true,
  captureSource: 'echoo-post-master-bus',
  storageMode: 'opfs-stream',
};

export default {
  ensureBroadcastRecording,
  finishBroadcastRecording,
  retryBroadcastQualityCompletion,
  recoverPendingBroadcastRecording,
  announceFinishedBroadcastRecording,
  discardBroadcastRecording,
  clearPendingBroadcastRecording,
  flushRecordingForPageHide,
  recoverOrphanedLosslessRecording,
  getBroadcastRecordingState,
};
