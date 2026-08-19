const RECORDING_EVENT = 'echoo:broadcast-recording-ready';

let activeRecording = null;
let pendingRecording = null;

const supportedMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

const extensionFor = (mimeType) =>
  String(mimeType || '').includes('ogg') ? 'ogg' : 'webm';

const cleanFilenamePart = (value) =>
  String(value || 'echoo-live-recording')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'echoo-live-recording';

const stopRecorder = (recording, { keep = true } = {}) =>
  new Promise((resolve) => {
    if (!recording?.recorder) {
      resolve(null);
      return;
    }

    const finish = () => {
      try {
        recording.track?.stop();
      } catch {
        // The cloned recording track may already be ended.
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
        Math.round((Date.now() - recording.startedAt) / 1000)
      );
      const extension = extensionFor(mimeType);
      const datePart = new Date(recording.startedAt)
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);

      resolve({
        broadcastId: recording.broadcastId,
        blob,
        mimeType,
        durationSeconds,
        startedAt: new Date(recording.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        filename: `${cleanFilenamePart(recording.title)}-${datePart}.${extension}`,
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

export const getBroadcastRecordingState = () => ({
  supported: typeof MediaRecorder !== 'undefined',
  recording: Boolean(activeRecording),
  broadcastId: activeRecording?.broadcastId || null,
  startedAt: activeRecording?.startedAt || null,
  pending: Boolean(pendingRecording),
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
    return {
      supported: true,
      recording: true,
      broadcastId: id,
      startedAt: activeRecording.startedAt,
    };
  }

  if (activeRecording) {
    await stopRecorder(activeRecording, { keep: false });
    activeRecording = null;
  }

  if (typeof MediaRecorder === 'undefined') {
    console.warn('[Echoo Recording] MediaRecorder is not supported by this browser.');
    return { supported: false, recording: false };
  }

  const mimeType = supportedMimeType();
  const clonedTrack = mediaTrack.clone();
  const stream = new MediaStream([clonedTrack]);

  const options = {
    audioBitsPerSecond: 96000,
  };
  if (mimeType) options.mimeType = mimeType;

  const recorder = new MediaRecorder(stream, options);
  const chunks = [];

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size) chunks.push(event.data);
  });

  recorder.addEventListener('error', (event) => {
    console.error('[Echoo Recording] recorder error', event?.error || event);
  });

  const startedAt = Date.now();
  activeRecording = {
    recorder,
    stream,
    track: clonedTrack,
    chunks,
    mimeType,
    broadcastId: id,
    title,
    startedAt,
  };

  recorder.start(1000);

  console.log('[Echoo Recording] local recording started', {
    broadcastId: id,
    mimeType: recorder.mimeType || mimeType || 'browser-default',
  });

  return {
    supported: true,
    recording: true,
    broadcastId: id,
    startedAt,
  };
};

export const finishBroadcastRecording = async (broadcastId) => {
  const id = String(broadcastId || '');

  if (!activeRecording || activeRecording.broadcastId !== id) {
    return null;
  }

  const recording = activeRecording;
  activeRecording = null;

  const finished = await stopRecorder(recording, { keep: true });
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
    await stopRecorder(recording, { keep: false });
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

export default {
  ensureBroadcastRecording,
  finishBroadcastRecording,
  announceFinishedBroadcastRecording,
  discardBroadcastRecording,
  clearPendingBroadcastRecording,
  getBroadcastRecordingState,
};
