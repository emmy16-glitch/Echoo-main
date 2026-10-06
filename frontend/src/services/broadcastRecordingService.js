import {
  startEchooMasterPcmCapture,
  supportsEchooMasterPcmCapture,
} from './echooMixerService.js';
import { apiFetch, getCurrentAccessToken } from './api.js';

const RECORDING_EVENT = 'echoo:broadcast-recording-ready';

const WAV_TARGET_SAMPLE_RATE = 48000;
const WAV_CHANNELS = 2;
const WAV_BIT_DEPTH = 24;
const WAV_BYTES_PER_SAMPLE = WAV_BIT_DEPTH / 8;
const WAV_MIME_TYPE = 'audio/wav';
const RIFF_HEADER_BYTES = 44;
const RF64_HEADER_BYTES = 80;
const MASTER_HEADER_BYTES = RF64_HEADER_BYTES;
const OPFS_DIRECTORY = 'echoo-live-recordings';
const OPFS_MANIFEST_KEY = 'echoo:recoverable-broadcast-recording:v1';
const OPFS_MANIFESTS_KEY = 'echoo:recoverable-broadcast-recordings:v2';
const OPFS_CHECKPOINT_MS = 15_000;
const LONG_SESSION_TARGET_SECONDS = 8 * 60 * 60;
const LOSSLESS_STORAGE_RESERVE_BYTES = 512 * 1024 * 1024;
const LOSSLESS_LONG_SESSION_TARGET_BYTES =
  WAV_TARGET_SAMPLE_RATE *
  WAV_CHANNELS *
  WAV_BYTES_PER_SAMPLE *
  LONG_SESSION_TARGET_SECONDS;

const OPUS_FALLBACK_BITRATE = 256000;
const OPUS_MIN_LONG_SESSION_BITRATE = 64000;
const COMPRESSED_STORAGE_RESERVE_BYTES = 256 * 1024 * 1024;
const OPUS_FALLBACK_MAX_BYTES = 128 * 1024 * 1024;
const QUALITY_CHUNK_SECONDS = 10;
const QUALITY_CHUNK_BIT_DEPTH = 24;
const QUALITY_CHUNK_CHANNELS = 2;
const QUALITY_CHUNK_UPLOAD_RETRIES = 5;
const QUALITY_CHUNK_START_RETRIES = 3;
const QUALITY_CHUNK_COMPLETE_RETRIES = 5;
const QUALITY_CHUNK_UPLOAD_TIMEOUT_MS = 120_000;
const QUALITY_CHUNK_START_TIMEOUT_MS = 30_000;
const QUALITY_CHUNK_COMPLETE_TIMEOUT_MS = 30_000;
const MEDIA_RECORDER_STOP_TIMEOUT_MS = 8_000;
const RECORDING_START_FINALIZE_TIMEOUT_MS = 8_000;
const COMPRESSED_RECOVERY_UPLOAD_TIMEOUT_MS = 5 * 60_000;
// Optional transport can never be allowed to accumulate arbitrary PCM on the
// main thread. At 48 kHz stereo this permits 30 seconds of queued float audio;
// exceeding it disables only the quality/archive branch and preserves LiveKit.
const MAX_QUEUED_PCM_SECONDS = 30;

let activeRecording = null;
let pendingRecording = null;
const recordingStarts = new Map();

const currentSessionUserId = () => {
  try {
    const token = String(getCurrentAccessToken?.() || '');
    const encoded = token.split('.')[1] || '';
    if (!encoded || typeof atob !== 'function') return '';
    const normalized = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const payload = JSON.parse(atob(normalized));
    return String(payload?.sub || payload?.userId || '');
  } catch {
    return '';
  }
};

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

  const lossless = recording.mode === 'lossless-wav';
  const mimeType = String(
    recording.mimeType || (lossless ? WAV_MIME_TYPE : '')
  );
  const compressedContainer = compressedExtensionForMime(mimeType);

  const manifest = {
    version: 4,
    status,
    broadcastId: recording.broadcastId,
    ownerUserId: String(recording.ownerUserId || currentSessionUserId() || ''),
    title: recording.title,
    storageName: recording.storageName,
    startedAt: recording.startedAt,
    endedAt: recording.endedAt || null,
    sampleRate: lossless
      ? (Number(recording.sampleRate) || WAV_TARGET_SAMPLE_RATE)
      : null,
    dataBytes: Number(recording.committedDataBytes ?? recording.dataBytes) || 0,
    channels: lossless ? WAV_CHANNELS : 2,
    bitDepth: lossless ? WAV_BIT_DEPTH : null,
    headerBytes: lossless
      ? (Number(recording.headerBytes) || RIFF_HEADER_BYTES)
      : 0,
    container: recording.container || (
      lossless
        ? (Number(recording.headerBytes) === RF64_HEADER_BYTES ? 'rf64' : 'riff')
        : compressedContainer
    ),
    mimeType,
    recordingFormat: recording.mode || (lossless ? 'lossless-wav' : 'opus-opfs'),
    storageMode: recording.storageMode || (lossless ? 'opfs-stream' : 'opfs-opus-stream'),
    audioBitsPerSecond: lossless
      ? (Number(recording.sampleRate) || WAV_TARGET_SAMPLE_RATE) * WAV_CHANNELS * WAV_BIT_DEPTH
      : (Number(recording.audioBitsPerSecond) || Number(recording.targetAudioBitsPerSecond) || OPUS_FALLBACK_BITRATE),
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
const readRecoveryMetadata = () => {
  const manifests = readRecoveryManifests();
  const currentUserId = currentSessionUserId();

  // New manifests are creator-scoped. Never hydrate another signed-in
  // creator's local safety master into the current Studio session.
  if (currentUserId) {
    const owned = manifests.find(
      (manifest) => String(manifest.ownerUserId || '') === currentUserId
    );
    if (owned) return owned;

    // Old v1/v2 manifests predate owner tagging. They are allowed through only
    // for one backend ownership check in recordingAutosave before any banner
    // or resume action is exposed.
    return manifests.find((manifest) => !manifest.ownerUserId) || null;
  }

  return manifests.find((manifest) => !manifest.ownerUserId) || null;
};
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

const storageHeadroom = async () => {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
    return null;
  }
  try {
    const estimate = await navigator.storage.estimate();
    const quota = Math.max(0, Number(estimate?.quota) || 0);
    const usage = Math.max(0, Number(estimate?.usage) || 0);
    return {
      quota,
      usage,
      available: Math.max(0, quota - usage),
    };
  } catch {
    return null;
  }
};

const hasLongSessionLosslessHeadroom = async () => {
  const estimate = await storageHeadroom();
  if (!estimate) return false;
  return estimate.available >=
    LOSSLESS_LONG_SESSION_TARGET_BYTES + LOSSLESS_STORAGE_RESERVE_BYTES;
};

const resolveLongSessionCompressedBitrate = async () => {
  const estimate = await storageHeadroom();
  if (!estimate) {
    return {
      bitrate: OPUS_FALLBACK_BITRATE,
      estimatedAvailableBytes: null,
      fullTargetExpected: null,
    };
  }

  const availableForRecording = Math.max(
    0,
    estimate.available - COMPRESSED_STORAGE_RESERVE_BYTES
  );
  // Leave ~8% container/implementation overhead instead of assuming every
  // quota byte becomes encoded audio payload.
  const maxSustainableBitrate = Math.floor(
    ((availableForRecording * 8) / LONG_SESSION_TARGET_SECONDS) / 1.08
  );
  const candidates = [256000, 224000, 192000, 160000, 128000, 96000, 64000];
  const selected =
    candidates.find((candidate) => candidate <= maxSustainableBitrate) ||
    OPUS_MIN_LONG_SESSION_BITRATE;

  return {
    bitrate: selected,
    estimatedAvailableBytes: estimate.available,
    fullTargetExpected: maxSustainableBitrate >= OPUS_MIN_LONG_SESSION_BITRATE,
  };
};

const compressedExtensionForMime = (mimeType = '') => {
  const mime = String(mimeType).toLowerCase();
  // Codec and container are not interchangeable. In particular,
  // audio/webm;codecs=opus is WebM bytes and must never be labeled .ogg.
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('opus')) return 'ogg';
  return 'webm';
};

const isCompressedRecoveryManifest = (manifest) => {
  const format = String(manifest?.recordingFormat || '').toLowerCase();
  const container = String(manifest?.container || '').toLowerCase();
  const mime = String(manifest?.mimeType || '').toLowerCase();
  return (
    format === 'compressed-opfs' ||
    format === 'opus-opfs' ||
    ['webm', 'ogg', 'm4a', 'mp4'].includes(container) ||
    mime.includes('webm') ||
    mime.includes('ogg') ||
    mime.includes('opus') ||
    mime.includes('mp4') ||
    mime.includes('aac') ||
    mime.includes('m4a')
  );
};

const supportedFallbackMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
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

const setUint64Le = (view, offset, value) => {
  const safe = Math.max(0, Math.floor(Number(value) || 0));
  const low = safe % 0x100000000;
  const high = Math.floor(safe / 0x100000000);
  view.setUint32(offset, low, true);
  view.setUint32(offset + 4, high, true);
};

export const createRf64Header = ({
  dataBytes,
  sampleRate,
  channels = WAV_CHANNELS,
  bitDepth = WAV_BIT_DEPTH,
}) => {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const safeDataBytes = Math.max(0, Math.floor(Number(dataBytes) || 0));
  const sampleCount = Math.floor(safeDataBytes / blockAlign);
  const buffer = new ArrayBuffer(RF64_HEADER_BYTES);
  const view = new DataView(buffer);

  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, 'RF64');
  view.setUint32(4, 0xffffffff, true);
  writeText(8, 'WAVE');
  writeText(12, 'ds64');
  view.setUint32(16, 28, true);
  setUint64Le(view, 20, (RF64_HEADER_BYTES - 8) + safeDataBytes);
  setUint64Le(view, 28, safeDataBytes);
  setUint64Le(view, 36, sampleCount);
  view.setUint32(44, 0, true);
  writeText(48, 'fmt ');
  view.setUint32(52, 16, true);
  view.setUint16(56, 1, true);
  view.setUint16(58, channels, true);
  view.setUint32(60, sampleRate, true);
  view.setUint32(64, byteRate, true);
  view.setUint16(68, blockAlign, true);
  view.setUint16(70, bitDepth, true);
  writeText(72, 'data');
  view.setUint32(76, 0xffffffff, true);

  return new Uint8Array(buffer);
};

const masterHeader = ({
  dataBytes,
  sampleRate,
  headerBytes = MASTER_HEADER_BYTES,
}) => (
  Number(headerBytes) === RF64_HEADER_BYTES
    ? createRf64Header({
        dataBytes,
        sampleRate,
        channels: WAV_CHANNELS,
        bitDepth: WAV_BIT_DEPTH,
      })
    : createWavHeader({
        dataBytes,
        sampleRate,
        channels: WAV_CHANNELS,
        bitDepth: WAV_BIT_DEPTH,
      })
);

const detectMasterHeaderBytes = async (file, manifest = null) => {
  const manifestBytes = Number(manifest?.headerBytes);
  if ([RIFF_HEADER_BYTES, RF64_HEADER_BYTES].includes(manifestBytes)) {
    return manifestBytes;
  }
  try {
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const text = String.fromCharCode(...signature);
    if (text === 'RF64') return RF64_HEADER_BYTES;
    if (text === 'RIFF') return RIFF_HEADER_BYTES;
  } catch {
    // Legacy manifests may have been checkpointed before the header write.
  }
  return RIFF_HEADER_BYTES;
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
        timeoutMs: QUALITY_CHUNK_UPLOAD_TIMEOUT_MS,
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
        timeoutMs: QUALITY_CHUNK_UPLOAD_TIMEOUT_MS,
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
const uploadLosslessMasterAfterLive = async (
  recording,
  file,
  { onProgress = null } = {}
) => {
  if (!recording?.qualityChunkStarted || recording.qualityChunkDisabled || !file?.size) return;

  const bytesPerSecond =
    recording.sampleRate * QUALITY_CHUNK_CHANNELS * (QUALITY_CHUNK_BIT_DEPTH / 8);
  const targetBytes = Math.max(1, Math.round(bytesPerSecond * QUALITY_CHUNK_SECONDS));
  const dataOffset = Math.max(
    RIFF_HEADER_BYTES,
    Number(recording.dataOffset || recording.headerBytes) || RIFF_HEADER_BYTES
  );
  const availablePcmBytes = Math.max(0, Number(file.size || 0) - dataOffset);
  const declaredPcmBytes = Math.max(0, Number(recording.dataBytes) || 0);
  const totalPcmBytes = declaredPcmBytes > 0
    ? Math.min(availablePcmBytes, declaredPcmBytes)
    : availablePcmBytes;
  let offset = 0;
  let uploadedBytes = 0;
  let chunkIndex = 0;

  const reportProgress = () => {
    if (typeof onProgress !== 'function') return;
    try {
      onProgress({
        loaded: uploadedBytes,
        total: totalPcmBytes,
        percent: totalPcmBytes > 0
          ? Math.max(0, Math.min(100, Math.round((uploadedBytes / totalPcmBytes) * 100)))
          : 100,
      });
    } catch {
      // Progress UI must never be able to interrupt recovery persistence.
    }
  };

  reportProgress();

  while (offset < totalPcmBytes && !recording.qualityChunkDisabled) {
    const take = Math.min(targetBytes, totalPcmBytes - offset);
    const startMs = (offset * 1000) / bytesPerSecond;
    const endMs = ((offset + take) * 1000) / bytesPerSecond;
    const pcmBlob = file.slice(dataOffset + offset, dataOffset + offset + take);
    const alreadyUploaded = Boolean(recording.existingChunkIndices?.has?.(chunkIndex));

    let uploaded = alreadyUploaded;
    try {
      if (!alreadyUploaded) {
        await uploadStoredPcmChunk({ recording, pcmBlob, startMs, endMs, chunkIndex });
        recording.existingChunkIndices?.add?.(chunkIndex);
        uploaded = true;
      }
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
    if (uploaded) uploadedBytes += take;
    chunkIndex += 1;
    reportProgress();
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
        timeoutMs: QUALITY_CHUNK_START_TIMEOUT_MS,
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
        // Preserve the server's durable chunk map so a retry after a network
        // failure resumes from the missing chunks instead of retransmitting
        // hundreds of MB that Echoo already has.
        recording.existingChunkIndices = new Set(
          (Array.isArray(data?.data?.existingChunkIndices)
            ? data.data.existingChunkIndices
            : [])
            .map((index) => Number(index))
            .filter((index) => Number.isInteger(index) && index >= 0)
        );
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
        timeoutMs: QUALITY_CHUNK_COMPLETE_TIMEOUT_MS,
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

// eslint-disable-next-line no-unused-vars
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

const openCompressedRecordingFile = async (broadcastId, mimeType) => {
  if (!supportsOpfs()) return null;

  try {
    await navigator.storage.persist?.();
  } catch {
    // Persistence permission is best effort.
  }

  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(OPFS_DIRECTORY, { create: true });
  const safeId = cleanFilenamePart(broadcastId).slice(0, 50);
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const extension = compressedExtensionForMime(mimeType);
  const storageName = `echoo-tmp-${safeId}-${randomPart}.${extension}`;
  const fileHandle = await directory.getFileHandle(storageName, { create: true });
  const writable = await fileHandle.createWritable();

  return {
    directory,
    fileHandle,
    writable,
    storageName,
    headerBytes: 0,
    container: extension,
    storageMode: 'opfs-opus-stream',
  };
};

const checkpointCompressedRecording = async (recording, status = 'recording') => {
  if (!recording?.writable || recording.writeError) return;
  await recording.writable.close();
  recording.writable = await recording.fileHandle.createWritable({ keepExistingData: true });
  await recording.writable.seek(Number(recording.committedDataBytes) || 0);
  writeRecoveryManifest(recording, status);
};

const queueCompressedCheckpoint = (recording, status = 'recording') => {
  if (!recording || recording.stopping || recording.writeError || !recording.writable) {
    return recording?.writeChain;
  }
  recording.writeChain = recording.writeChain
    .then(() => checkpointCompressedRecording(recording, status))
    .catch((error) => {
      recording.writeError = error;
      writeRecoveryManifest(recording, 'recovery_required');
      console.error('[Echoo Recording] compressed durable checkpoint failed:', error?.message || error);
    });
  return recording.writeChain;
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

  await writable.write(createRf64Header({
    dataBytes: 0,
    sampleRate: WAV_TARGET_SAMPLE_RATE,
    channels: WAV_CHANNELS,
    bitDepth: WAV_BIT_DEPTH,
  }));

  return {
    directory,
    fileHandle,
    writable,
    storageName,
    headerBytes: MASTER_HEADER_BYTES,
    container: 'rf64',
  };
};

const checkpointLosslessRecording = async (recording, status = 'recording') => {
  if (!recording?.writable || recording.writeError) return;
  const committedBytes = Number(recording.committedDataBytes) || 0;
  const header = masterHeader({
    dataBytes: committedBytes,
    sampleRate: Number(recording.sampleRate) || WAV_TARGET_SAMPLE_RATE,
    headerBytes: recording.headerBytes,
  });
  await recording.writable.seek(0);
  await recording.writable.write(header);
  await recording.writable.close();
  recording.writable = await recording.fileHandle.createWritable({ keepExistingData: true });
  await recording.writable.seek(
    (Number(recording.headerBytes) || RIFF_HEADER_BYTES) + committedBytes
  );
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
    const header = masterHeader({
      dataBytes: recording.dataBytes,
      sampleRate,
      headerBytes: recording.headerBytes,
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
      container: recording.container || 'rf64',
      headerBytes: Number(recording.headerBytes) || MASTER_HEADER_BYTES,
      dataOffset: Number(recording.headerBytes) || MASTER_HEADER_BYTES,
      dataBytes: recording.dataBytes,
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

  if (!(await hasLongSessionLosslessHeadroom())) {
    const error = new Error(
      'Local storage headroom is too small for an eight-hour lossless safety master; using disk-backed Opus recovery instead.'
    );
    error.code = 'LOSSLESS_STORAGE_HEADROOM_LOW';
    throw error;
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
    serverHandshakePromise: null,
    stopping: false,
    checkpointTimer: null,
    onPageHide: null,
    ...storage,
  };
  persistRecoveryMetadata(recording);

  try {
    const capture = await startEchooMasterPcmCapture({
      onPcm: (buffer) => {
        if (!buffer || recording.writeError) return;

        const floats = new Float32Array(buffer);
        const pcm = floatToPcm24(floats);

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
    format: 'PCM RF64/WAV',
  });

  return recording;
};

const stopFallbackRecording = (recording, { keep = true } = {}) =>
  new Promise((resolve, reject) => {
    if (!recording?.recorder) {
      resolve(null);
      return;
    }

    let finished = false;
    let stopDeadlineTimer = null;
    const onRecorderStop = () => { void finish(); };
    const onRecorderError = () => { void finish(); };
    const finish = async () => {
      if (finished) return;
      finished = true;
      recording.stopping = true;
      if (stopDeadlineTimer) window.clearTimeout(stopDeadlineTimer);
      stopDeadlineTimer = null;
      recording.recorder.removeEventListener?.('stop', onRecorderStop);
      recording.recorder.removeEventListener?.('error', onRecorderError);
      window.clearInterval(recording.checkpointTimer);
      window.removeEventListener('pagehide', recording.onPageHide);

      try {
        recording.track?.stop();
      } catch {
        // The cloned fallback track may already be ended.
      }

      try {
        await recording.writeChain;

        if (recording.writeError) throw recording.writeError;

        if (!keep || recording.overflowed) {
          await recording.writable?.close();
          recording.writable = null;
          if (recording.directory && recording.storageName) {
            await safeRemoveOpfsEntry(recording.directory, recording.storageName);
            clearRecoveryManifest(recording.storageName);
          }
          resolve(null);
          return;
        }

        const mimeType =
          recording.recorder.mimeType || recording.mimeType || 'audio/webm';
        const durationSeconds = Math.max(
          1,
          (Date.now() - recording.startedAt) / 1000
        );
        const extension = compressedExtensionForMime(mimeType);

        let blob;
        let storageMode = 'memory-opus-fallback';
        if (recording.fileHandle) {
          await recording.writable?.close();
          recording.writable = null;
          recording.endedAt = Date.now();
          writeRecoveryManifest(recording, 'pending_upload');
          const file = await recording.fileHandle.getFile();
          blob = new Blob([file], { type: mimeType });
          storageMode = 'opfs-opus-stream';
        } else {
          blob = new Blob(recording.chunks, { type: mimeType });
        }

        resolve({
          broadcastId: recording.broadcastId,
          ownerUserId: String(recording.ownerUserId || ''),
          recoveryStorageName: recording.storageName || '',
          blob,
          mimeType,
          durationSeconds,
          sampleRate: null,
          channels: 2,
          bitDepth: null,
          lossless: false,
          recordingFormat: recording.fileHandle ? 'compressed-opfs' : 'compressed-fallback',
          container: extension,
          headerBytes: 0,
          dataOffset: 0,
          dataBytes: Number(recording.committedDataBytes || recording.dataBytes || blob.size) || 0,
          captureSource: 'published-media-track-fallback',
          storageMode,
          targetAudioBitsPerSecond:
            Number(recording.targetAudioBitsPerSecond) || OPUS_FALLBACK_BITRATE,
          audioBitsPerSecond:
            Number(recording.recorder.audioBitsPerSecond) ||
            Number(recording.audioBitsPerSecond) ||
            Number(recording.targetAudioBitsPerSecond) ||
            OPUS_FALLBACK_BITRATE,
          startedAt: new Date(recording.startedAt).toISOString(),
          endedAt: new Date().toISOString(),
          filename: `${cleanFilenamePart(recording.title)}-${recordingDatePart(recording.startedAt)}.${extension}`,
          qualityChunkCount: 0,
          qualityChunkErrors: [],
          qualityCompletionPending: false,
          qualityCompletionError: '',
          dispose: recording.fileHandle
            ? async () => {
                await safeRemoveOpfsEntry(recording.directory, recording.storageName);
                clearRecoveryManifest(recording.storageName);
              }
            : undefined,
        });
      } catch (error) {
        // OPFS commits a createWritable() transaction on close. If a write or
        // checkpoint failed, close whatever writer is still open before
        // advertising the file as recoverable so the last successfully
        // buffered bytes are not stranded in an uncommitted transaction.
        try {
          await recording.writable?.close();
        } catch {
          // The checkpoint may already have closed/replaced this writer.
        }
        recording.writable = null;
        if (recording.storageName) {
          recording.endedAt = Date.now();
          writeRecoveryManifest(recording, 'recovery_required');
        }
        reject(error);
      }
    };

    if (recording.recorder.state === 'inactive') {
      void finish();
      return;
    }

    recording.recorder.addEventListener('stop', onRecorderStop, { once: true });
    recording.recorder.addEventListener('error', onRecorderError, { once: true });

    try {
      recording.recorder.requestData();
    } catch {
      // Some browsers do not allow requestData immediately before stop.
    }

    try {
      recording.recorder.stop();
    } catch {
      void finish();
      return;
    }

    // Safari/WebView/device failures can accept stop() but never dispatch the
    // final stop event. Never let End Broadcast wait forever for that browser
    // event. The durable OPFS/checkpoint data already written is finalized and
    // remains recoverable even if the last in-memory recorder slice is missing.
    stopDeadlineTimer = window.setTimeout(() => {
      console.warn('[Echoo Recording] MediaRecorder stop event timed out; finalizing the protected recording from committed data.');
      void finish();
    }, MEDIA_RECORDER_STOP_TIMEOUT_MS);
  });

const startFallbackRecording = async ({ broadcastId, mediaTrack, title }) => {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported by this browser.');
  }

  const mimeType = supportedFallbackMimeType();
  const storagePolicy = await resolveLongSessionCompressedBitrate();
  const clonedTrack = mediaTrack.clone();
  const stream = new MediaStream([clonedTrack]);
  const options = { audioBitsPerSecond: storagePolicy.bitrate };
  if (mimeType) options.mimeType = mimeType;

  const recorder = new MediaRecorder(stream, options);
  const chunks = [];
  let fallbackBytes = 0;
  let fallbackOverflowed = false;
  let storage = null;

  if (supportsOpfs()) {
    try {
      storage = await openCompressedRecordingFile(broadcastId, recorder.mimeType || mimeType);
    } catch (error) {
      console.warn(
        '[Echoo Recording] compressed OPFS safety file could not start; falling back to bounded memory:',
        error?.message || error
      );
    }
  }

  const recording = {
    mode: storage ? 'compressed-opfs' : 'compressed-fallback',
    recorder,
    stream,
    track: clonedTrack,
    chunks,
    mimeType: recorder.mimeType || mimeType || 'audio/webm',
    targetAudioBitsPerSecond: storagePolicy.bitrate,
    audioBitsPerSecond: Number(recorder.audioBitsPerSecond) || storagePolicy.bitrate,
    longSessionStorageExpected: storagePolicy.fullTargetExpected,
    broadcastId: String(broadcastId || ''),
    title,
    startedAt: Date.now(),
    dataBytes: 0,
    committedDataBytes: 0,
    writeError: null,
    writeChain: Promise.resolve(),
    stopping: false,
    checkpointTimer: null,
    onPageHide: null,
    storageMode: storage ? 'opfs-opus-stream' : 'memory-opus-fallback',
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
    serverHandshakePromise: null,
    ...storage,
    get overflowed() { return fallbackOverflowed; },
  };

  if (storage) writeRecoveryManifest(recording, 'recording');

  recorder.addEventListener('dataavailable', (event) => {
    if (!event.data?.size || fallbackOverflowed || recording.writeError) return;

    if (recording.fileHandle) {
      recording.dataBytes += event.data.size;
      recording.writeChain = recording.writeChain
        .then(async () => {
          await recording.writable.write(event.data);
          recording.committedDataBytes += event.data.size;
        })
        .catch((error) => {
          recording.writeError = error;
          writeRecoveryManifest(recording, 'recovery_required');
          console.error(
            '[Echoo Recording] compressed browser storage write failed:',
            error?.message || error
          );
        });
      return;
    }

    if (fallbackBytes + event.data.size > OPUS_FALLBACK_MAX_BYTES) {
      fallbackOverflowed = true;
      chunks.length = 0;
      fallbackBytes = 0;
      try { clonedTrack.stop(); } catch { /* clone may already be stopped */ }
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // Stopping the safety recorder must never affect the LiveKit track.
      }
      window.dispatchEvent(new CustomEvent('echoo:toast', {
        detail: {
          type: 'warning',
          message: 'This browser cannot keep a very long local safety recording in memory. Your live stream continues normally; use a browser with disk-backed recording for long broadcasts.',
        },
      }));
      console.warn('[Echoo Recording] bounded Opus fallback stopped to protect live-stream memory.');
      return;
    }
    chunks.push(event.data);
    fallbackBytes += event.data.size;
  });

  recorder.addEventListener('error', (event) => {
    console.error('[Echoo Recording] fallback recorder error', event?.error || event);
  });

  if (storage) {
    recording.checkpointTimer = window.setInterval(
      () => { void queueCompressedCheckpoint(recording); },
      OPFS_CHECKPOINT_MS
    );
    recording.onPageHide = () => {
      try { recorder.requestData(); } catch { /* best effort */ }
      void queueCompressedCheckpoint(recording, 'recovery_required');
    };
    window.addEventListener('pagehide', recording.onPageHide);
  }

  recorder.start(1000);

  if (storage && storagePolicy.fullTargetExpected === false) {
    window.dispatchEvent(new CustomEvent('echoo:toast', {
      detail: {
        type: 'warning',
        message: 'Local storage is very low for an 8-hour recovery recording. Echoo reduced the safety-recording bitrate and will keep the live stream running; free device storage before a very long broadcast for stronger local recovery.',
      },
    }));
  }

  console.warn(
    storage
      ? `[Echoo Recording] using disk-backed compressed safety recording at ${storagePolicy.bitrate} bps for long-session storage efficiency.`
      : '[Echoo Recording] using bounded in-memory Opus fallback because disk-backed recording was unavailable.'
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
      : recording?.mode === 'compressed-opfs'
        ? 'opfs-opus-stream'
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
      : activeRecording?.mode === 'compressed-opfs'
        ? 'opfs-opus-stream'
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

const handleServerRecordingHandshakeFailure = async (recording, error) => {
  if (!recording) return;
  const startMessage = error?.message || String(error);
  recording.qualityChunkErrors ||= [];
  recording.qualityChunkErrors.push({ chunkIndex: -2, message: startMessage });

  if (error?.code === 'FFMPEG_REQUIRED' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('echoo:toast', {
      detail: {
        type: 'error',
        message: 'Echoo could not start its saved recording. Your local recording is still protected and you can continue broadcasting.',
      },
    }));
  }

  try {
    await completeQualityChunks(recording, {
      force: true,
      uploadErrorsOverride: Math.max(1, recording.qualityChunkErrors.length),
    });
  } catch (completionError) {
    recording.qualityCompletionPending = true;
    recording.qualityCompletionError = completionError?.message || String(completionError);
  }

  recording.qualityChunkDisabled = true;
  recording.qualityBuffers = [];
  recording.qualitySampleCount = 0;
  console.warn('[Echoo Recording] live server recording handshake is disabled for this take:', startMessage);
};

export const armBroadcastServerRecording = async (broadcastId) => {
  const id = String(broadcastId || '');
  const recording = activeRecording;
  if (!recording || recording.broadcastId !== id) {
    return { supported: false, recording: false };
  }
  if (recording.serverHandshakePromise) return recording.serverHandshakePromise;

  recording.serverHandshakePromise = (async () => {
    try {
      await startQualityChunking(recording);
    } catch (error) {
      await handleServerRecordingHandshakeFailure(recording, error);
    }
    return activeRecordingSnapshot(recording);
  })();

  try {
    return await recording.serverHandshakePromise;
  } finally {
    recording.serverHandshakePromise = null;
  }
};

export const ensureBroadcastRecording = async ({
  broadcastId,
  mediaTrack,
  title = 'Echoo live recording',
  armServer = true,
}) => {
  const id = String(broadcastId || '');

  if (!id || !mediaTrack || mediaTrack.kind !== 'audio') {
    return { supported: false, recording: false };
  }

  if (activeRecording?.broadcastId === id) {
    return activeRecordingSnapshot(activeRecording);
  }

  const existingStart = recordingStarts.get(id);
  if (existingStart?.promise) return existingStart.promise;

  const startState = {
    broadcastId: id,
    title,
    finishRequested: false,
    lateAnnouncementRequired: false,
    promise: null,
  };

  const task = (async () => {
    if (activeRecording) {
      await stopRecording(activeRecording, { keep: false });
      activeRecording = null;
    }

    try {
      activeRecording = await startLosslessRecording({
        broadcastId: id,
        title,
      });
    } catch (losslessError) {
      console.warn(
        '[Echoo Recording] disk-backed lossless master capture could not start:',
        losslessError?.message || losslessError
      );

      try {
        activeRecording = await startFallbackRecording({
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

    // End Broadcast may arrive while OPFS/device initialization is still in
    // progress. Never let a recorder become active after the show is already
    // off-air. Finalize it immediately and preserve/announce the result.
    if (startState.finishRequested && activeRecording?.broadcastId === id) {
      const recording = activeRecording;
      activeRecording = null;
      const finished = await stopRecording(recording, { keep: true }).catch(async (error) => {
        const recovered = await recoverPendingBroadcastRecording(id).catch(() => null);
        if (recovered?.blob?.size) {
          recovered.recoveredDuringFinalize = true;
          recovered.finalizationError = error?.message || String(error);
          return recovered;
        }
        throw error;
      });

      if (finished?.blob?.size) {
        pendingRecording = finished;
        if (startState.lateAnnouncementRequired) {
          announceFinishedBroadcastRecording({
            recording: finished,
            broadcast: { id, title },
          });
        }
        return {
          supported: true,
          recording: false,
          finalizedAfterLateStart: true,
        };
      }
      return { supported: false, recording: false };
    }

    if (armServer && activeRecording) {
      await armBroadcastServerRecording(id);
    }

    return activeRecordingSnapshot(activeRecording);
  })();

  startState.promise = task;
  recordingStarts.set(id, startState);

  try {
    return await task;
  } finally {
    if (recordingStarts.get(id) === startState) recordingStarts.delete(id);
  }
};

export const finishBroadcastRecording = async (broadcastId) => {
  const id = String(broadcastId || '');
  const starting = recordingStarts.get(id);

  if ((!activeRecording || activeRecording.broadcastId !== id) && starting?.promise) {
    starting.finishRequested = true;
    let timedOut = false;
    let timer = null;
    try {
      await Promise.race([
        starting.promise,
        new Promise((resolve) => {
          timer = window.setTimeout(() => {
            timedOut = true;
            resolve();
          }, RECORDING_START_FINALIZE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }

    if (timedOut) {
      // The start task owns eventual cleanup. Ask it to announce the protected
      // recording if it finally becomes available after this End flow returned.
      starting.lateAnnouncementRequired = true;
      return null;
    }
  }

  if (pendingRecording?.broadcastId === id && pendingRecording?.blob?.size) {
    return pendingRecording;
  }

  if (!activeRecording || activeRecording.broadcastId !== id) {
    return null;
  }

  const recording = activeRecording;
  activeRecording = null;

  try {
    const finished = await stopRecording(recording, { keep: true });
    if (!finished?.blob?.size) return null;

    pendingRecording = finished;
    return finished;
  } catch (error) {
    // A disk/checkpoint failure may still leave a valid partial protected
    // master. Reopen this broadcast's durable manifest immediately so Creator
    // Studio can offer recovery without requiring a reload.
    const recovered = await recoverPendingBroadcastRecording(id).catch(() => null);
    if (recovered?.blob?.size) {
      recovered.recoveredDuringFinalize = true;
      recovered.finalizationError = error?.message || String(error);
      return recovered;
    }
    throw error;
  }
};

/**
 * Reopen the last checkpointed OPFS master after a reload/browser crash.
 * Blob composition is lazy: the large audio payload is not decoded or copied
 * onto the main thread.
 */
export const recoverPendingBroadcastRecording = async (broadcastId = '') => {
  const id = String(broadcastId || '');
  if (
    pendingRecording?.blob?.size &&
    (!id || String(pendingRecording.broadcastId || '') === id)
  ) {
    return pendingRecording;
  }
  if (!supportsOpfs()) return null;
  const manifest = readRecoveryManifest(id ? { broadcastId: id } : undefined);
  if (!manifest?.storageName) return null;

  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(OPFS_DIRECTORY);
    const fileHandle = await directory.getFileHandle(manifest.storageName);
    const sourceFile = await fileHandle.getFile();

    if (isCompressedRecoveryManifest(manifest)) {
      if (!sourceFile.size) return null;
      const mimeType = String(
        manifest.mimeType ||
        (String(manifest.container).toLowerCase() === 'ogg'
          ? 'audio/ogg;codecs=opus'
          : ['m4a', 'mp4'].includes(String(manifest.container).toLowerCase())
            ? 'audio/mp4'
            : 'audio/webm;codecs=opus')
      );
      const startedAt = Number(manifest.startedAt) || Number(sourceFile.lastModified) || Date.now();
      const endedAt = Number(manifest.endedAt) || Number(sourceFile.lastModified) || Date.now();
      const extension = compressedExtensionForMime(mimeType);
      const recording = {
        broadcastId: String(manifest.broadcastId),
        ownerUserId: String(manifest.ownerUserId || ''),
        recoveryStorageName: String(manifest.storageName || ''),
        blob: new Blob([sourceFile], { type: mimeType }),
        mimeType,
        durationSeconds: Math.max(1, (endedAt - startedAt) / 1000),
        sampleRate: null,
        channels: 2,
        bitDepth: null,
        lossless: false,
        recordingFormat: 'compressed-opfs',
        container: extension,
        headerBytes: 0,
        dataOffset: 0,
        dataBytes: sourceFile.size,
        captureSource: 'published-media-track-fallback',
        storageMode: 'opfs-opus-recovered',
        audioBitsPerSecond:
          Number(manifest.audioBitsPerSecond) || OPUS_FALLBACK_BITRATE,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        filename: `${cleanFilenamePart(manifest.title)}-${recordingDatePart(startedAt)}.${extension}`,
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
    }

    const headerBytes = await detectMasterHeaderBytes(sourceFile, manifest);
    const dataBytes = Math.max(0, sourceFile.size - headerBytes);
    if (!dataBytes) return null;
    const sampleRate = Number(manifest.sampleRate) || WAV_TARGET_SAMPLE_RATE;
    const header = masterHeader({ dataBytes, sampleRate, headerBytes });
    const blob = new Blob(
      [header, sourceFile.slice(headerBytes)],
      { type: WAV_MIME_TYPE }
    );
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
      container: headerBytes === RF64_HEADER_BYTES ? 'rf64' : 'riff',
      headerBytes,
      dataOffset: headerBytes,
      dataBytes,
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

export const uploadRecoveryMasterToServer = async (
  recording,
  { onProgress = null } = {}
) => {
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
    existingChunkIndices: new Set(),
    dataOffset: Math.max(
      RIFF_HEADER_BYTES,
      Number(recording.dataOffset || recording.headerBytes) || RIFF_HEADER_BYTES
    ),
    dataBytes: Math.max(0, Number(recording.dataBytes) || 0),
  };

  await startQualityChunking(recovery);
  if (recovery.serverRecordingPrimary) {
    return { recovered: false, mode: 'server-egress' };
  }

  await uploadLosslessMasterAfterLive(recovery, recording.blob, { onProgress });
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

export const uploadCompressedRecoveryMasterToServer = async (recording, broadcast = null) => {
  if (!recording?.broadcastId || !recording?.blob?.size) {
    throw new Error('No local compressed recovery master is available for server rescue.');
  }

  const mimeType = String(recording.mimeType || recording.blob.type || '').toLowerCase();
  const compressedRecovery =
    mimeType.includes('webm') ||
    mimeType.includes('opus') ||
    mimeType.includes('ogg') ||
    mimeType.includes('mp4') ||
    mimeType.includes('aac') ||
    mimeType.includes('m4a');

  if (!compressedRecovery) {
    const error = new Error('This browser recovery master is not a supported compressed audio format.');
    error.code = 'RECOVERY_FORMAT_UNSUPPORTED';
    throw error;
  }

  const extension = compressedExtensionForMime(mimeType);
  const form = new FormData();
  form.append(
    'audio',
    recording.blob,
    recording.filename || `echoo-recovery-${cleanFilenamePart(recording.broadcastId)}.${extension}`
  );
  form.append('title', String(broadcast?.title || recording.title || 'Echoo live recording'));
  form.append('description', String(broadcast?.description || ''));
  form.append(
    'genre',
    String(broadcast?.category || broadcast?.station?.category || 'Other')
  );
  form.append('tags', JSON.stringify(['live-recording', 'broadcast', 'browser-recovery']));
  form.append('isPublic', 'false');
  form.append('duration', String(Math.max(0, Number(recording.durationSeconds) || 0)));
  form.append('broadcastId', String(recording.broadcastId));

  const response = await apiFetch('/audio/upload', {
    method: 'POST',
    body: form,
    isFormData: true,
    timeoutMs: COMPRESSED_RECOVERY_UPLOAD_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      data?.error?.message ||
      `Could not upload compressed recording recovery (${response.status})`
    );
    error.code = data?.error?.code || 'COMPRESSED_RECOVERY_UPLOAD_FAILED';
    error.status = response.status;
    throw error;
  }

  const audioId = String(data?.data?.id || data?.data?._id || '');
  if (!audioId) {
    const error = new Error('Echoo accepted the recovery file but did not return a replay id.');
    error.code = 'RECOVERY_REPLAY_ID_MISSING';
    throw error;
  }

  recording.serverFallbackAttempted = true;
  return {
    recovered: true,
    mode: 'compressed-upload',
    audioId,
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

// Detach a recovered take from the current in-memory session without deleting
// its OPFS file or manifest. Used when a different account signs in on the
// same browser: the previous creator's safety master stays preserved, but it
// must not block or appear inside the new creator's Studio.
export const releaseRecoveredBroadcastRecording = (broadcastId = '') => {
  const id = String(broadcastId || '');
  if (
    pendingRecording?.recovered === true &&
    (!id || String(pendingRecording.broadcastId || '') === id)
  ) {
    pendingRecording = null;
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
// writer so the file is complete on disk. The RF64/WAV header is patched on
// recovery from the durable manifest and file size, so a close mid-take is safe.
export const flushRecordingForPageHide = async () => {
  const recording = activeRecording;
  if (!recording) return;

  persistRecoveryMetadata(recording);
  if (recording.mode === 'lossless-wav') {
    await queueLosslessCheckpoint(recording, 'recovery_required');
    return;
  }
  if (recording.mode === 'compressed-opfs') {
    try { recording.recorder?.requestData?.(); } catch { /* best effort */ }
    await queueCompressedCheckpoint(recording, 'recovery_required');
  }
};

// Recover the newest orphaned OPFS master (RF64 or disk-backed Opus) left by a closed/crashed tab.
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

    if (isCompressedRecoveryManifest(meta)) {
      if (!file.size) {
        await safeRemoveOpfsEntry(directory, meta.storageName);
        clearRecoveryMetadata(meta.broadcastId);
        return null;
      }
      const mimeType = String(
        meta.mimeType ||
        (String(meta.container).toLowerCase() === 'ogg'
          ? 'audio/ogg;codecs=opus'
          : ['m4a', 'mp4'].includes(String(meta.container).toLowerCase())
            ? 'audio/mp4'
            : 'audio/webm;codecs=opus')
      );
      const extension = compressedExtensionForMime(mimeType);
      const startedAt = Number(meta.startedAt) || Date.now();
      const endedAt = Number(meta.endedAt) || Number(file.lastModified) || Date.now();
      const recording = {
        broadcastId: String(meta.broadcastId),
        ownerUserId: String(meta.ownerUserId || ''),
        recoveryStorageName: String(meta.storageName || ''),
        blob: new Blob([file], { type: mimeType }),
        mimeType,
        durationSeconds: Math.max(1, (endedAt - startedAt) / 1000),
        sampleRate: null,
        channels: 2,
        bitDepth: null,
        lossless: false,
        recordingFormat: 'compressed-opfs',
        container: extension,
        headerBytes: 0,
        dataOffset: 0,
        dataBytes: file.size,
        captureSource: 'published-media-track-fallback',
        storageMode: 'opfs-opus-recovered',
        audioBitsPerSecond:
          Number(meta.audioBitsPerSecond) || OPUS_FALLBACK_BITRATE,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        filename: `${cleanFilenamePart(meta.title)}-${recordingDatePart(startedAt)}.${extension}`,
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
    }

    const headerBytes = await detectMasterHeaderBytes(file, meta);
    const dataBytes = Math.max(0, Number(file.size || 0) - headerBytes);
    if (!dataBytes) {
      await safeRemoveOpfsEntry(directory, meta.storageName);
      clearRecoveryMetadata(meta.broadcastId);
      return null;
    }
    const sampleRate = Number(meta.sampleRate) || WAV_TARGET_SAMPLE_RATE;
    try {
      // createWritable() truncates by default. Recovery only patches the
      // container header, so preserve the PCM body already stored in OPFS.
      const writable = await fileHandle.createWritable({ keepExistingData: true });
      await writable.seek(0);
      await writable.write(masterHeader({
        dataBytes,
        sampleRate,
        headerBytes,
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
      ownerUserId: String(meta.ownerUserId || ''),
      recoveryStorageName: String(meta.storageName || ''),
      blob: wavBlob,
      mimeType: WAV_MIME_TYPE,
      durationSeconds,
      sampleRate,
      channels: WAV_CHANNELS,
      bitDepth: WAV_BIT_DEPTH,
      lossless: true,
      recordingFormat: 'pcm-wav',
      container: headerBytes === RF64_HEADER_BYTES ? 'rf64' : 'riff',
      headerBytes,
      dataOffset: headerBytes,
      dataBytes,
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
  container: 'rf64',
  headerBytes: RF64_HEADER_BYTES,
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
  releaseRecoveredBroadcastRecording,
  flushRecordingForPageHide,
  recoverOrphanedLosslessRecording,
  getBroadcastRecordingState,
};
