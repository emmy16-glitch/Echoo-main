import { useEffect, useMemo, useState } from 'react';
import {
  FaCheckCircle,
  FaCloudUploadAlt,
  FaGlobe,
  FaLock,
  FaSave,
  FaTrash,
} from 'react-icons/fa';

import studioService from '../../services/studioService.js';
import {
  BROADCAST_RECORDING_READY_EVENT,
  clearPendingBroadcastRecording,
} from '../../services/broadcastRecordingService.js';
import './BroadcastRecordingPrompt.css';

const formatDuration = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 ** 3)).toFixed(2)} GB`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatRecordingType = (recording) => {
  if (recording?.lossless || recording?.mimeType === 'audio/wav') {
    return 'PCM WAV';
  }
  if (String(recording?.mimeType || '').includes('ogg')) return 'Opus / OGG';
  return 'Opus / WebM';
};

const formatRecordingQuality = (recording) => {
  if (recording?.lossless || recording?.recordingFormat === 'pcm-wav') {
    const sampleRate = Number(recording?.sampleRate) || 48000;
    const bitDepth = Number(recording?.bitDepth) || 24;
    const channels = Number(recording?.channels) || 2;
    return `${(sampleRate / 1000).toFixed(sampleRate % 1000 ? 1 : 0)} kHz · ${bitDepth}-bit PCM · ${channels === 2 ? 'Stereo' : `${channels} ch`} · Lossless`;
  }

  const value = Number(
    recording?.audioBitsPerSecond || recording?.targetAudioBitsPerSecond
  ) || 0;
  return value > 0
    ? `${Math.round(value / 1000)} kbps Opus · fallback`
    : 'Opus fallback';
};

const safeFilename = (title, recording) => {
  const fallback = String(recording?.filename || '').toLowerCase();
  const mimeType = String(recording?.mimeType || '').toLowerCase();
  const extension =
    fallback.endsWith('.wav') || mimeType === 'audio/wav'
      ? 'wav'
      : fallback.endsWith('.ogg') || mimeType.includes('ogg')
        ? 'ogg'
        : 'webm';
  const clean = String(title || 'Echoo live recording')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'Echoo-live-recording';
  return `${clean}.${extension}`;
};

const BroadcastRecordingPrompt = () => {
  const [pending, setPending] = useState(null);
  const [savingMode, setSavingMode] = useState('');
  const [error, setError] = useState('');
  const [savedMode, setSavedMode] = useState('');

  useEffect(() => {
    const onRecordingReady = (event) => {
      const detail = event?.detail || null;
      if (!detail?.recording?.blob?.size) return;
      setPending(detail);
      setError('');
      setSavedMode('');
      setSavingMode('');
    };

    window.addEventListener(BROADCAST_RECORDING_READY_EVENT, onRecordingReady);
    return () => window.removeEventListener(BROADCAST_RECORDING_READY_EVENT, onRecordingReady);
  }, []);

  useEffect(() => {
    if (!pending) return undefined;

    const protectPendingRecording = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', protectPendingRecording);
    return () => window.removeEventListener('beforeunload', protectPendingRecording);
  }, [pending]);

  const previewUrl = useMemo(() => {
    if (!pending?.recording?.blob) return '';
    return URL.createObjectURL(pending.recording.blob);
  }, [pending]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!pending) return null;

  const { recording, broadcast } = pending;
  const title = broadcast?.title || 'Live broadcast recording';
  const description = broadcast?.description || '';

  const closeAfterSave = (mode) => {
    setSavedMode(mode);
    clearPendingBroadcastRecording(recording.broadcastId);
    window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
    window.setTimeout(() => {
      setPending(null);
      setSavedMode('');
    }, 1200);
  };

  const saveRecording = async (isPublic) => {
    if (savingMode || savedMode) return;

    const mode = isPublic ? 'publish' : 'private';
    setSavingMode(mode);
    setError('');

    try {
      const file = new File(
        [recording.blob],
        safeFilename(title, recording),
        { type: recording.mimeType || recording.blob.type || 'audio/wav' }
      );

      await studioService.uploadAudio({
        file,
        title,
        description:
          description ||
          `Recorded live on Echoo. Broadcast recording from ${new Date(recording.startedAt).toLocaleString()}.`,
        genre: 'Other',
        tags: [
          'live-recording',
          'broadcast',
          recording.lossless ? 'lossless-master' : 'recording-fallback',
        ],
        isPublic,
      });

      closeAfterSave(mode);
    } catch (saveError) {
      setError(saveError?.message || 'Echoo could not save this local recording.');
    } finally {
      setSavingMode('');
    }
  };

  const discard = () => {
    if (savingMode || savedMode) return;
    clearPendingBroadcastRecording(recording.broadcastId);
    setPending(null);
  };

  const savedLabel = recording.lossless
    ? 'Lossless master recording'
    : 'High-quality fallback recording';

  return (
    <div className="echoo-recording-decision-overlay" role="presentation">
      <section
        className="echoo-recording-decision"
        role="dialog"
        aria-modal="true"
        aria-labelledby="echoo-recording-decision-title"
      >
        <header>
          <div className="echoo-recording-decision-icon"><FaSave /></div>
          <div>
            <span>LIVE SESSION ENDED</span>
            <h2 id="echoo-recording-decision-title">Keep this broadcast recording?</h2>
            <p>
              {recording.lossless
                ? 'Echoo captured the actual post-master studio mix as a lossless PCM WAV master without holding the full raw session in page memory.'
                : 'Disk-backed lossless capture was unavailable, so Echoo used the high-quality Opus fallback for this session.'}
            </p>
          </div>
        </header>

        <div className="echoo-recording-summary">
          <div>
            <strong>{title}</strong>
            <span>{broadcast?.stationName || 'Echoo broadcast'}</span>
          </div>
          <dl>
            <div><dt>Length</dt><dd>{formatDuration(recording.durationSeconds)}</dd></div>
            <div><dt>Local file</dt><dd>{formatBytes(recording.blob.size)}</dd></div>
            <div><dt>Format</dt><dd>{formatRecordingType(recording)}</dd></div>
            <div><dt>Quality</dt><dd>{formatRecordingQuality(recording)}</dd></div>
          </dl>
        </div>

        {recording.limitReached && (
          <div className="echoo-recording-error">
            This master reached the classic WAV file-size limit. Save this segment before recording another session.
          </div>
        )}

        {previewUrl && (
          <div className="echoo-recording-preview">
            <span>Check the master before you decide</span>
            <audio src={previewUrl} controls preload="metadata" />
          </div>
        )}

        <div className="echoo-recording-options">
          <button
            type="button"
            className="private"
            onClick={() => saveRecording(false)}
            disabled={Boolean(savingMode || savedMode)}
          >
            <FaLock />
            <span>
              <strong>{savingMode === 'private' ? 'Saving...' : 'Save unpublished'}</strong>
              <small>Keep the recording in Creator Audio. Listeners cannot see it.</small>
            </span>
          </button>

          <button
            type="button"
            className="publish"
            onClick={() => saveRecording(true)}
            disabled={Boolean(savingMode || savedMode)}
          >
            <FaGlobe />
            <span>
              <strong>{savingMode === 'publish' ? 'Publishing...' : 'Save & publish'}</strong>
              <small>Save the recording and make this audio available to listeners.</small>
            </span>
          </button>
        </div>

        {error && <div className="echoo-recording-error">{error}</div>}

        {savedMode && (
          <div className="echoo-recording-saved">
            <FaCheckCircle />
            {savedMode === 'publish'
              ? `${savedLabel} saved and published to listeners.`
              : `${savedLabel} saved privately in Creator Audio.`}
          </div>
        )}

        <footer>
          <button
            type="button"
            className="discard"
            onClick={discard}
            disabled={Boolean(savingMode || savedMode)}
          >
            <FaTrash /> Discard recording
          </button>
          <span>
            <FaCloudUploadAlt /> Local testing: completed recordings are uploaded to this Echoo backend, not cloud storage.
          </span>
        </footer>
      </section>
    </div>
  );
};

export default BroadcastRecordingPrompt;
