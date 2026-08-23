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
const STALE_OPFS_FILE_MS = 24 * 60 * 60 * 1000;

const OPUS_FALLBACK_BITRATE = 256000;
const QUALITY_CHUNK_SECONDS = 10;
const QUALITY_CHUNK_BIT_DEPTH = 24;
const QUALITY_CHUNK_CHANNELS = 2;
const QUALITY_CHUNK_UPLOAD_RETRIES = 5;

let activeRecording = null;
let pendingRecording = null;

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
      if (attempt < QUALITY_CHUNK_UPLOAD_RETRIES - 1) await sleep(Math.min(15_000, 500 * (2 ** attempt)));
    }
  }
  throw lastError || new Error('Quality chunk upload failed');
};

const flushQualityChunk = async (recording, { force = false } = {}) => {
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
        recording.qualityChunkErrors.push({ chunkIndex, message: error?.message || String(error) });
        console.error('[Echoo Recording] quality chunk upload failed', { broadcastId: recording.broadcastId, chunkIndex, error: error?.message || error });
      });
  }
};

const startQualityChunking = async (recording) => {
  const response = await apiFetch(`/broadcasts/${recording.broadcastId}/recording-chunks/start`, {
    method: 'POST',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || `Could not start quality chunking (${response.status})`);
  }
};

const completeQualityChunks = async (recording) => {
  if (!recording?.broadcastId || !recording.qualityChunkIndex) return;
  const response = await apiFetch(`/broadcasts/${recording.broadcastId}/recording-chunks/complete`, {
    method: 'POST',
    body: JSON.stringify({
      qualityChunkCount: recording.qualityChunkIndex,
      qualityChunkUploadErrors: recording.qualityChunkErrors.length,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || `Could not close quality chunk uploads (${response.status})`);
  }
};

const appendQualityPcm = (recording, buffer) => {
  if (!buffer || recording.qualityChunkDisabled) return;
  const samples = new Float32Array(buffer);
  if (!samples.length) return;
  recording.qualityBuffers.push(samples);
  recording.qualitySampleCount += samples.length;
  void flushQualityChunk(recording);
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

const cleanupStaleOpfsRecordings = async (directory) => {
  if (!directory?.entries) return;

  try {
    for await (const [name, handle] of directory.entries()) {
      if (handle?.kind !== 'file' || !name.startsWith('echoo-tmp-')) continue;
      try {
        const file = await handle.getFile();
        if (Date.now() - Number(file.lastModified || 0) > STALE_OPFS_FILE_MS) {
          await safeRemoveOpfsEntry(directory, name);
        }
      } catch {
        // Ignore one unreadable stale entry; it should never block a new take.
      }
    }
  } catch {
    // Directory enumeration is an optional cleanup only.
  }
};

const openLosslessRecordingFile = async (broadcastId) => {
  if (!supportsOpfs()) {
    throw new Error('Browser-backed recording storage is not available.');
  }

  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(OPFS_DIRECTORY, { create: true });
  void cleanupStaleOpfsRecordings(directory);

  const safeId = cleanFilenamePart(broadcastId).slice(0, 50);
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storageName = `echoo-tmp-${safeId}-${randomPart}.wav`;
  const fileHandle = await directory.getFileHandle(storageName, { create: true });
  const writable = await fileHandle.createWritable();

  // Reserve the RIFF header. The real sizes are patched after the final PCM
  // worklet chunk has been flushed.
  await writable.write(new Uint8Array(44));

  return { directory, fileHandle, writable, storageName };
};

const stopLosslessRecording = async (recording, { keep = true } = {}) => {
  if (!recording) return null;

  try {
    if (recording.capture) {
      // stop() flushes the AudioWorklet's final PCM chunk before disconnecting
      // the recorder branch from the SAME master bus used by LiveKit.
      await recording.capture.stop();
      recording.capture = null;
    }

    await flushQualityChunk(recording, { force: true });
    await recording.qualityChain;
    try {
      await completeQualityChunks(recording);
    } catch (error) {
      recording.qualityChunkErrors.push({ chunkIndex: -1, message: error?.message || String(error) });
      console.error('[Echoo Recording] quality chunk completion acknowledgement failed', error?.message || error);
    }
    await recording.writeChain;

    if (recording.writeError) throw recording.writeError;

    if (!keep || !recording.dataBytes) {
      await recording.writable?.close();
      recording.writable = null;
      await safeRemoveOpfsEntry(recording.directory, recording.storageName);
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

    const file = await recording.fileHandle.getFile();
    const durationSeconds = recording.dataBytes /
      (sampleRate * WAV_CHANNELS * WAV_BYTES_PER_SAMPLE);

    return {
      broadcastId: recording.broadcastId,
      blob: file,
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
      dispose: () =>
        safeRemoveOpfsEntry(recording.directory, recording.storageName),
    };
  } catch (error) {
    try {
      await recording.writable?.close();
    } catch {
      // Ignore close failure while unwinding the recorder.
    }
    recording.writable = null;
    await safeRemoveOpfsEntry(recording.directory, recording.storageName);
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
    ...storage,
  };

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
        appendQualityPcm(recording, buffer);
        recording.writeChain = recording.writeChain
          .then(() => recording.writable.write(pcm))
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
  } catch (error) {
    try {
      await recording.writable.close();
    } catch {
      // Ignore close failure while unwinding setup.
    }
    await safeRemoveOpfsEntry(recording.directory, recording.storageName);
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
    // Primary path: capture PCM directly from Echoo's post-limiter master bus
    // and stream it to Origin Private File System. Long broadcasts therefore do
    // not accumulate raw 24-bit PCM in the JavaScript heap.
    activeRecording = await startLosslessRecording({
      broadcastId: id,
      title,
    });
    try {
      await startQualityChunking(activeRecording);
    } catch (error) {
      activeRecording.qualityChunkDisabled = true;
      console.warn('[Echoo Recording] live quality chunking is disabled for this take:', error?.message || error);
    }
  } catch (losslessError) {
    console.warn(
      '[Echoo Recording] disk-backed lossless master capture could not start:',
      losslessError?.message || losslessError
    );

    try {
      // Compatibility path: if AudioWorklet or browser-backed file storage is
      // unavailable, keep a 256 kbps Opus take rather than risking an enormous
      // in-memory PCM buffer or losing the recording entirely.
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

export const announceFinishedBroadcastRecording = ({ recording, broadcast }) => {
  if (!recording?.blob?.size || typeof window === 'undefined') return;

  pendingRecording = recording;
  window.dispatchEvent(
    new CustomEvent(RECORDING_EVENT, {
      detail: {
        recording,
        broadcast: broadcast || null,
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
    // The caller only clears a pending recording after upload or explicit
    // discard, so remove its OPFS temporary file without blocking UI cleanup.
    void recording?.dispose?.();
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
  announceFinishedBroadcastRecording,
  discardBroadcastRecording,
  clearPendingBroadcastRecording,
  getBroadcastRecordingState,
};
