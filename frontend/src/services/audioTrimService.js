import { apiRequest } from './api.js';

export const TRIM_WAVEFORM_POINTS = 240;
export const TRIM_WAVEFORM_MAX_POLLS = 180;
export const TRIM_WAVEFORM_DEFAULT_RETRY_MS = 1500;

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

const abortError = () => {
  const error = new Error('Waveform preparation was cancelled.');
  error.code = 'ABORT_ERR';
  return error;
};

const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(abortError());
  const timer = globalThis.setTimeout(resolve, Math.max(100, Number(ms) || TRIM_WAVEFORM_DEFAULT_RETRY_MS));
  const onAbort = () => {
    globalThis.clearTimeout(timer);
    reject(abortError());
  };
  signal?.addEventListener?.('abort', onAbort, { once: true });
  if (signal) {
    const cleanup = () => signal.removeEventListener?.('abort', onAbort);
    globalThis.setTimeout(cleanup, Math.max(100, Number(ms) || TRIM_WAVEFORM_DEFAULT_RETRY_MS) + 50);
  }
});

export const prepareTrimWaveform = async (
  audioId,
  {
    signal,
    onStatus,
    maxPolls = TRIM_WAVEFORM_MAX_POLLS,
  } = {}
) => {
  if (!audioId) throw new Error('Audio ID is missing.');

  const attempts = Math.max(1, Math.min(600, Number(maxPolls) || TRIM_WAVEFORM_MAX_POLLS));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw abortError();

    const response = await apiRequest(
      `/audio/${encodeURIComponent(audioId)}/waveform`,
      {
        method: 'GET',
        signal,
        timeoutMs: 20_000,
        cache: 'no-store',
      }
    );
    const data = response?.data || {};

    if (data.status === 'ready') {
      const duration = Number(data.duration) || 0;
      const points = Array.isArray(data.points)
        ? data.points.map((value) => Math.max(0, Math.min(1, Number(value) || 0)))
        : [];
      if (!(duration > 0) || points.length < 16) {
        throw new Error('Echoo returned incomplete waveform data for this recording.');
      }
      return {
        duration,
        points,
        cached: Boolean(data.cached),
        generatedAt: data.generatedAt || null,
      };
    }

    const retryAfterMs = Math.max(
      500,
      Math.min(5000, Number(data.retryAfterMs) || TRIM_WAVEFORM_DEFAULT_RETRY_MS)
    );
    try {
      onStatus?.({ attempt: attempt + 1, retryAfterMs, status: data.status || 'processing' });
    } catch {
      // UI status callbacks must never break waveform preparation.
    }
    await wait(retryAfterMs, signal);
  }

  const error = new Error('Echoo is still preparing this long recording. Please try again in a moment.');
  error.code = 'WAVEFORM_STILL_PROCESSING';
  throw error;
};

export default {
  trimSavedAudio,
  prepareTrimWaveform,
  validateAudioTrimRange,
  TRIM_WAVEFORM_POINTS,
};
