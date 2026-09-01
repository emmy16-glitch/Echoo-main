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
import { apiRequest } from '../../services/api.js';
import {
  BROADCAST_RECORDING_READY_EVENT,
  clearPendingBroadcastRecording,
  retryBroadcastQualityCompletion,
} from '../../services/broadcastRecordingService.js';
import './BroadcastRecordingPrompt.css';

const PENDING_RECORDING_DECISION_KEY = '__echooPendingBroadcastRecording';

const readRecoveredPendingDecision = () => {
  if (typeof window === 'undefined') return null;
  const detail = window[PENDING_RECORDING_DECISION_KEY] || null;
  return detail?.recording?.blob?.size ? detail : null;
};

const rememberPendingDecision = (detail) => {
  if (typeof window === 'undefined' || !detail?.recording?.blob?.size) return;
  window[PENDING_RECORDING_DECISION_KEY] = detail;
};

const forgetPendingDecision = () => {
  if (typeof window === 'undefined') return;
  try {
    delete window[PENDING_RECORDING_DECISION_KEY];
  } catch {
    window[PENDING_RECORDING_DECISION_KEY] = null;
  }
};

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
  const [pending, setPending] = useState(readRecoveredPendingDecision);
  const [savingMode, setSavingMode] = useState('');
  const [error, setError] = useState('');
  const [savedMode, setSavedMode] = useState('');

  useEffect(() => {
    const applyPendingDecision = (detail) => {
      if (!detail?.recording?.blob?.size) return;
      rememberPendingDecision(detail);
      setPending(detail);
      setError('');
      setSavedMode('');
      setSavingMode('');
    };

    const onRecordingReady = (event) => {
      applyPendingDecision(event?.detail || null);
    };

    const recoverPendingDecision = () => {
      const recovered = readRecoveredPendingDecision();
      if (recovered) applyPendingDecision(recovered);
    };

    recoverPendingDecision();

    window.addEventListener(BROADCAST_RECORDING_READY_EVENT, onRecordingReady);
    window.addEventListener('focus', recoverPendingDecision);
    window.addEventListener('pageshow', recoverPendingDecision);
    return () => {
      window.removeEventListener(BROADCAST_RECORDING_READY_EVENT, onRecordingReady);
      window.removeEventListener('focus', recoverPendingDecision);
      window.removeEventListener('pageshow', recoverPendingDecision);
    };
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
    forgetPendingDecision();
    clearPendingBroadcastRecording(recording.broadcastId);
    window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
    window.setTimeout(() => {
      setPending(null);
      setSavedMode('');
    }, 1200);
  };

  const ensureQualityFinalized = async () => {
    if (!recording.qualityCompletionPending) return;
    await retryBroadcastQualityCompletion(recording);
    // Persist the cleared pending flag in the in-memory recovery detail too.
    rememberPendingDecision({ ...pending, recording });
  };

  const saveRecording = async (isPublic) => {
    if (savingMode || savedMode) return;

    const mode = isPublic ? 'publish' : 'private';
    setSavingMode(mode);
    setError('');

    try {
      await ensureQualityFinalized();

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
        broadcastId: recording.broadcastId,
      });

      closeAfterSave(mode);
    } catch (saveError) {
      setError(
        recording.qualityCompletionPending
          ? saveError?.message || 'Echoo is still confirming the transcript quality upload. The local master is protected; try again.'
          : saveError?.message || 'Echoo could not save this local recording.'
      );
    } finally {
      setSavingMode('');
    }
  };

  const discard = async () => {
    if (savingMode || savedMode) return;
    setSavingMode('discard');
    setError('');
    try {
      await ensureQualityFinalized();
      await apiRequest(
        `/broadcasts/${encodeURIComponent(recording.broadcastId)}/discard-replay`,
        { method: 'POST' }
      );
      forgetPendingDecision();
      clearPendingBroadcastRecording(recording.broadcastId);
      setPending(null);
    } catch (discardError) {
      setError(
        recording.qualityCompletionPending
          ? discardError?.message || 'Echoo is still confirming the transcript quality upload. The local recording is protected; try again.'
          : discardError?.message || 'Echoo could not confirm the discard. The local recording is still protected; try again.'
      );
    } finally {
      setSavingMode('');
    }
  };

  const savedLabel = recording.lossless
    ? 'Lossless Master Capture'
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

        {recording.qualityCompletionPending && (
          <div className="echoo-recording-error">
            Echoo is still confirming the final transcript-quality upload. Saving or discarding will retry that confirmation first.
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
            <FaTrash /> {savingMode === 'discard' ? 'Discarding…' : 'Discard recording'}
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
