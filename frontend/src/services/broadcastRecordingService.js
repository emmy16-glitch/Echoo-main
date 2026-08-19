import {
  startEchooMasterPcmCapture,
  supportsEchooMasterPcmCapture,
} from './echooMixerService.js';

const RECORDING_EVENT = 'echoo:broadcast-recording-ready';

const WAV_TARGET_SAMPLE_RATE = 48000;
const WAV_CHANNELS = 2;
const WAV_BIT_DEPTH = 24;
const WAV_BYTES_PER_SAMPLE = WAV_BIT_DEPTH / 8;
const WAV_MIME_TYPE = 'audio/wav';
const MAX_WAV_DATA_BYTES = 0xffffffff - 44;

const OPUS_FALLBACK_BITRATE = 256000;

let activeRecording = null;
let pendingRecording = null;

const supportsLosslessWavCapture = () => supportsEchooMasterPcmCapture();

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

const createWavHeader = ({
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

const stopLosslessRecording = async (recording, { keep = true } = {}) => {
  if (!recording?.capture) return null;

  // stop() flushes the AudioWorklet's final PCM chunk before disconnecting the
  // recorder branch from the SAME master bus used by LiveKit.
  await recording.capture.stop();
  recording.capture = null;

  if (!keep || !recording.dataBytes) return null;

  const sampleRate = Number(recording.sampleRate) || WAV_TARGET_SAMPLE_RATE;
  const header = createWavHeader({
    dataBytes: recording.dataBytes,
    sampleRate,
    channels: WAV_CHANNELS,
    bitDepth: WAV_BIT_DEPTH,
  });
  const blob = new Blob([header, ...recording.pcmChunks], { type: WAV_MIME_TYPE });
  const durationSeconds = recording.dataBytes /
    (sampleRate * WAV_CHANNELS * WAV_BYTES_PER_SAMPLE);

  return {
    broadcastId: recording.broadcastId,
    blob,
    mimeType: WAV_MIME_TYPE,
    durationSeconds: Math.max(1, durationSeconds),
    sampleRate,
    channels: WAV_CHANNELS,
    bitDepth: WAV_BIT_DEPTH,
    lossless: true,
    recordingFormat: 'pcm-wav',
    captureSource: 'echoo-post-master-bus',
    audioBitsPerSecond: sampleRate * WAV_CHANNELS * WAV_BIT_DEPTH,
    startedAt: new Date(recording.startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    filename: `${cleanFilenamePart(recording.title)}-${recordingDatePart(recording.startedAt)}.wav`,
    limitReached: Boolean(recording.limitReached),
  };
};

const startLosslessRecording = async ({ broadcastId, title }) => {
  if (!supportsLosslessWavCapture()) {
    throw new Error('Direct master-bus PCM capture is not supported by this browser.');
  }

  const recording = {
    mode: 'lossless-wav',
    capture: null,
    pcmChunks: [],
    dataBytes: 0,
    broadcastId: String(broadcastId || ''),
    title,
    startedAt: Date.now(),
    sampleRate: null,
    limitReached: false,
  };

  const capture = await startEchooMasterPcmCapture({
    onPcm: (buffer) => {
      if (!buffer || recording.limitReached) return;

      const floats = new Float32Array(buffer);
      const pcm = floatToPcm24(floats);

      if (recording.dataBytes + pcm.byteLength > MAX_WAV_DATA_BYTES) {
        recording.limitReached = true;
        console.error(
          '[Echoo Recording] WAV master reached the classic RIFF/WAV 4 GB data limit.'
        );
        return;
      }

      recording.pcmChunks.push(pcm);
      recording.dataBytes += pcm.byteLength;
    },
  });

  recording.capture = capture;
  recording.sampleRate = capture.sampleRate;

  console.log('[Echoo Recording] lossless WAV master recording started from the live master bus', {
    broadcastId: recording.broadcastId,
    sampleRate: recording.sampleRate,
    channels: WAV_CHANNELS,
    bitDepth: WAV_BIT_DEPTH,
    source: capture.source,
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

    const finish = () => {
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
        targetAudioBitsPerSecond: OPUS_FALLBACK_BITRATE,
        audioBitsPerSecond:
          Number(recording.recorder.audioBitsPerSecond) || OPUS_FALLBACK_BITRATE,
        startedAt: new Date(recording.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        filename: `${cleanFilenamePart(recording.title)}-${recordingDatePart(recording.startedAt)}.${extension}`,
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
  console.warn('[Echoo Recording] using lossy Opus fallback; direct master capture was unavailable.');
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
    // inside the mixer AudioContext. No cloned track, no second AudioContext,
    // no extra resampling/channel conversion before WAV encoding.
    activeRecording = await startLosslessRecording({
      broadcastId: id,
      title,
    });
  } catch (losslessError) {
    console.warn(
      '[Echoo Recording] direct lossless master-bus capture could not start:',
      losslessError?.message || losslessError
    );

    try {
      // Compatibility only. If AudioWorklet/direct master capture is unavailable,
      // retain the previous high-quality Opus track recorder rather than lose the take.
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
    pendingRecording = null;
  }
};

export const clearPendingBroadcastRecording = (broadcastId = '') => {
  const id = String(broadcastId || '');
  if (!id || pendingRecording?.broadcastId === id) pendingRecording = null;
};

export const BROADCAST_RECORDING_READY_EVENT = RECORDING_EVENT;

export const ECHOO_BROADCAST_MASTER_FORMAT = {
  mimeType: WAV_MIME_TYPE,
  sampleRate: WAV_TARGET_SAMPLE_RATE,
  channels: WAV_CHANNELS,
  bitDepth: WAV_BIT_DEPTH,
  lossless: true,
  captureSource: 'echoo-post-master-bus',
};

export default {
  ensureBroadcastRecording,
  finishBroadcastRecording,
  announceFinishedBroadcastRecording,
  discardBroadcastRecording,
  clearPendingBroadcastRecording,
  getBroadcastRecordingState,
};
