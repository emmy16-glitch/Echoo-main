import { apiRequest } from './api.js';

export const validateAudioTrimRange = ({ startSeconds, endSeconds, duration = 0 }) => {
  const start = Number(startSeconds);
  const end = Number(endSeconds);
  const knownDuration = Number(duration) || 0;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new Error('Choose a trim end that is later than the trim start.');
  }
  if (knownDuration > 0 && end > knownDuration + 0.25) {
    throw new Error('The trim end is beyond this recording.');
  }
  return { startSeconds: start, endSeconds: end };
};

export const trimSavedAudio = async (audioId, range) => {
  if (!audioId) throw new Error('Audio ID is missing.');
  const validated = validateAudioTrimRange(range);
  return apiRequest(`/audio/${encodeURIComponent(audioId)}/trim`, {
    method: 'POST',
    body: JSON.stringify(validated),
  });
};

export const MAX_TRIM_BYTES = 350 * 1024 * 1024;
export const TRIM_PEAK_COUNT = 120;

export const canTrimRecording = (blob) =>
  Boolean(blob?.size) && blob.size <= MAX_TRIM_BYTES;

let sharedContext = null;
const getAudioContext = () => {
  const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) throw new Error('Audio trimming is not supported by this browser.');
  if (!sharedContext || sharedContext.state === 'closed') {
    sharedContext = new Ctor();
  }
  if (sharedContext.state === 'suspended') void sharedContext.resume().catch(() => {});
  return sharedContext;
};

export const DECODE_TIMEOUT_MS = 15000;

export const decodeRecordingBlob = async (blob, onProgress) => {
  if (!canTrimRecording(blob)) {
    throw new Error('This recording is too long to trim in the browser. Save the full recording instead.');
  }
  const emit = (value) => {
    try { onProgress?.(Math.max(0, Math.min(100, Math.round(value)))); } catch { /* noop */ }
  };
  emit(5);
  const context = getAudioContext();
  emit(15);
  const raw = await blob.arrayBuffer();
  emit(45);
  // decodeAudioData detaches the buffer — copy first so the blob stays usable.
  const copy = raw.slice(0);
  emit(55);
  // Mobile browsers can leave decodeAudioData unsettled forever (suspended
  // context, throttled tab, OOM). Race a timeout so the trim UI can never
  // deadlock — callers fall back to saving the full recording.
  const buffer = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutError = new Error('decode-timeout');
      timeoutError.code = 'DECODE_TIMEOUT';
      reject(timeoutError);
    }, DECODE_TIMEOUT_MS);
    if (timer?.unref) timer.unref();
    const settle = (fn) => (value) => {
      clearTimeout(timer);
      fn(value);
    };
    try {
      // Modern browsers ALSO return a promise from decodeAudioData even when
      // callbacks are given — and it rejects on decode failure. Swallow that
      // floating rejection: the callbacks below already settle this promise.
      const floating = context.decodeAudioData(copy, settle(resolve), settle(reject));
      if (floating && typeof floating.catch === 'function') floating.catch(() => {});
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
  emit(85);
  if (!buffer?.duration) throw new Error('Could not read this recording for trimming.');
  emit(100);
  return buffer;
};

// Peak per bucket (mono mix) normalised 0..1 for the waveform.
// Chunked with yields so a 20-min master never locks the UI thread.
export const computePeaks = (buffer, count = TRIM_PEAK_COUNT) => {
  const channels = buffer.numberOfChannels || 1;
  const length = buffer.length || 1;
  const buckets = Math.max(16, Math.min(400, Math.floor(count) || TRIM_PEAK_COUNT));
  const peaks = new Array(buckets).fill(0);
  const data = [];
  for (let c = 0; c < channels; c += 1) {
    try {
      data.push(buffer.getChannelData(c));
    } catch {
      // Ignore unreadable channels.
    }
  }
  if (!data.length) return peaks;
  const perBucket = Math.max(1, Math.floor(length / buckets));
  for (let b = 0; b < buckets; b += 1) {
    const start = b * perBucket;
    const end = Math.min(length, start + perBucket);
    let max = 0;
    const step = Math.max(1, Math.floor((end - start) / 200));
    for (let i = start; i < end; i += step) {
      let sum = 0;
      for (let c = 0; c < data.length; c += 1) sum += Math.abs(data[c][i] || 0);
      const mean = sum / data.length;
      if (mean > max) max = mean;
    }
    peaks[b] = Math.max(0, Math.min(1, max));
  }
  return peaks;
};

export const computePeaksAsync = async (buffer, count = TRIM_PEAK_COUNT, onProgress) => {
  const channels = buffer.numberOfChannels || 1;
  const length = buffer.length || 1;
  const buckets = Math.max(16, Math.min(400, Math.floor(count) || TRIM_PEAK_COUNT));
  const peaks = new Array(buckets).fill(0);
  const data = [];
  for (let c = 0; c < channels; c += 1) {
    try {
      data.push(buffer.getChannelData(c));
    } catch {
      // Ignore unreadable channels.
    }
  }
  if (!data.length) return peaks;
  const perBucket = Math.max(1, Math.floor(length / buckets));
  for (let b = 0; b < buckets; b += 1) {
    const start = b * perBucket;
    const end = Math.min(length, start + perBucket);
    let max = 0;
    const step = Math.max(1, Math.floor((end - start) / 200));
    for (let i = start; i < end; i += step) {
      let sum = 0;
      for (let c = 0; c < data.length; c += 1) sum += Math.abs(data[c][i] || 0);
      const mean = sum / data.length;
      if (mean > max) max = mean;
    }
    peaks[b] = Math.max(0, Math.min(1, max));
    if (b % 12 === 0) {
      try { onProgress?.(Math.round((b / buckets) * 100)); } catch { /* noop */ }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  try { onProgress?.(100); } catch { /* noop */ }
  return peaks;
};

const clampRange = (startSec, endSec, duration) => {
  const total = Math.max(0.1, Number(duration) || 0.1);
  let start = Math.max(0, Math.min(total, Number(startSec) || 0));
  let end = Math.max(0, Math.min(total, Number(endSec) || total));
  if (end - start < 1) {
    // Keep at least 1s so the server never receives an empty file.
    if (start + 1 <= total) end = start + 1;
    else start = Math.max(0, end - 1);
  }
  return { start, end };
};

// Re-encode [startSec, endSec) as a 24-bit PCM WAV Blob — same depth as the
// lossless master, so trimming never reduces clarity (bit-transparent cut).
export const trimBufferToWavBlob = (buffer, startSec, endSec) => {
  const sampleRate = buffer.sampleRate || 48000;
  const channels = Math.max(1, buffer.numberOfChannels || 2);
  const { start, end } = clampRange(startSec, endSec, buffer.duration);
  const startSample = Math.floor(start * sampleRate);
  const endSample = Math.min(buffer.length, Math.ceil(end * sampleRate));
  const frames = Math.max(1, endSample - startSample);

  const bytesPerSample = 3;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const wav = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wav);
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeText(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let f = 0; f < frames; f += 1) {
    for (let c = 0; c < channels; c += 1) {
      let sample = 0;
      try {
        sample = buffer.getChannelData(c)[startSample + f] || 0;
      } catch {
        sample = 0;
      }
      const clamped = Math.max(-1, Math.min(1, sample));
      const signed = clamped < 0 ? Math.round(clamped * 0x800000) : Math.round(clamped * 0x7fffff);
      const value = signed < 0 ? signed + 0x1000000 : signed;
      view.setUint8(offset, value & 0xff);
      view.setUint8(offset + 1, (value >> 8) & 0xff);
      view.setUint8(offset + 2, (value >> 16) & 0xff);
      offset += 3;
    }
  }
  return { blob: new Blob([wav], { type: 'audio/wav' }), start, end };
};

export default {
  trimSavedAudio,
  validateAudioTrimRange,
  MAX_TRIM_BYTES,
  TRIM_PEAK_COUNT,
  DECODE_TIMEOUT_MS,
  canTrimRecording,
  decodeRecordingBlob,
  computePeaks,
  computePeaksAsync,
  trimBufferToWavBlob,
};
