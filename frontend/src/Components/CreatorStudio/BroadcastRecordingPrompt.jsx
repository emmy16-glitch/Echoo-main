import { useEffect, useRef, useState } from 'react';
import {
  FaCheckCircle,
  FaCloudUploadAlt,
  FaSave,
  FaSyncAlt,
} from 'react-icons/fa';

import studioService from '../../services/studioService.js';
import {
  BROADCAST_RECORDING_READY_EVENT,
  clearPendingBroadcastRecording,
  retryBroadcastQualityCompletion,
} from '../../services/broadcastRecordingService.js';
import './BroadcastRecordingPrompt.css';

const PENDING_RECORDING_DECISION_KEY = '__echooPendingBroadcastRecording';

const readRecoveredPendingRecording = () => {
  if (typeof window === 'undefined') return null;
  const detail = window[PENDING_RECORDING_DECISION_KEY] || null;
  return detail?.recording?.blob?.size ? detail : null;
};

const rememberPendingRecording = (detail) => {
  if (typeof window === 'undefined' || !detail?.recording?.blob?.size) return;
  window[PENDING_RECORDING_DECISION_KEY] = detail;
};

const forgetPendingRecording = () => {
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
  const [pending, setPending] = useState(readRecoveredPendingRecording);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const saveAttemptRef = useRef('');

  useEffect(() => {
    const applyPendingRecording = (detail) => {
      if (!detail?.recording?.blob?.size) return;
      rememberPendingRecording(detail);
      setPending(detail);
      setError('');
      setSaved(false);
      setRetryToken(0);
      saveAttemptRef.current = '';
    };

    const onRecordingReady = (event) => {
      applyPendingRecording(event?.detail || null);
    };

    const recoverPendingRecording = () => {
      const recovered = readRecoveredPendingRecording();
      if (recovered) applyPendingRecording(recovered);
    };

    recoverPendingRecording();
    window.addEventListener(BROADCAST_RECORDING_READY_EVENT, onRecordingReady);
    window.addEventListener('pageshow', recoverPendingRecording);

    return () => {
      window.removeEventListener(BROADCAST_RECORDING_READY_EVENT, onRecordingReady);
      window.removeEventListener('pageshow', recoverPendingRecording);
    };
  }, []);

  useEffect(() => {
    if (!pending?.recording?.blob?.size || saved) return undefined;

    const { recording, broadcast } = pending;
    const saveKey = String(recording.broadcastId || broadcast?.id || 'recording');
    const attemptKey = `${saveKey}:${retryToken}`;
    if (saveAttemptRef.current === attemptKey) return undefined;
    saveAttemptRef.current = attemptKey;

    let active = true;
    let successTimer = null;

    const saveAutomatically = async () => {
      const title = broadcast?.title || 'Live broadcast recording';
      const description = broadcast?.description || '';

      try {
        setSaving(true);
        setError('');

        if (recording.qualityCompletionPending) {
          await retryBroadcastQualityCompletion(recording);
          rememberPendingRecording({ ...pending, recording });
        }

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
          // Completed broadcasts are saved automatically. Visibility is managed
          // later from Recordings rather than interrupting End Broadcast with a
          // publish/private decision.
          isPublic: false,
          broadcastId: recording.broadcastId,
        });

        if (!active) return;
        forgetPendingRecording();
        clearPendingBroadcastRecording(recording.broadcastId);
        window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
        window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
        setSaved(true);
        setSaving(false);
        successTimer = window.setTimeout(() => {
          if (active) {
            setPending(null);
            setSaved(false);
            saveAttemptRef.current = '';
          }
        }, 1400);
      } catch (saveError) {
        if (!active) return;

        // A lost response after a successful upload can make a retry hit the
        // sourceBroadcast uniqueness guard. In that case the Recording already
        // exists, so treat the lifecycle as successfully finalized instead of
        // creating a confusing duplicate/error loop.
        if (saveError?.code === 'REPLAY_ALREADY_EXISTS') {
          forgetPendingRecording();
          clearPendingBroadcastRecording(recording.broadcastId);
          window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
          window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
          setSaved(true);
          setSaving(false);
          successTimer = window.setTimeout(() => {
            if (active) {
              setPending(null);
              setSaved(false);
              saveAttemptRef.current = '';
            }
          }, 1400);
          return;
        }

        setSaving(false);
        setError(
          recording.qualityCompletionPending
            ? saveError?.message || 'Echoo is still confirming the final recording data. Your local master is protected; retry saving.'
            : saveError?.message || 'Echoo could not save this recording yet. Your local master is protected; retry saving.'
        );
      }
    };

    saveAutomatically();

    return () => {
      active = false;
      if (successTimer) window.clearTimeout(successTimer);
    };
  }, [pending, retryToken, saved]);

  useEffect(() => {
    if (!pending) return undefined;

    const protectPendingRecording = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', protectPendingRecording);
    return () => window.removeEventListener('beforeunload', protectPendingRecording);
  }, [pending]);

  if (!pending) return null;

  const { recording, broadcast } = pending;
  const title = broadcast?.title || 'Live broadcast recording';
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
            <h2 id="echoo-recording-decision-title">
              {saved ? 'Recording saved' : error ? 'Recording needs attention' : 'Saving your recording…'}
            </h2>
            <p>
              {saved
                ? 'Your completed broadcast is now available in Recordings.'
                : error
                  ? 'Echoo kept the local master safe. Retry the automatic save when you are ready.'
                  : 'Echoo automatically saves every completed broadcast. There is no publish or discard step here.'}
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
            This master reached the classic WAV file-size limit. Echoo is saving the captured segment as the Recording for this broadcast.
          </div>
        )}

        {error && <div className="echoo-recording-error">{error}</div>}

        {saved && (
          <div className="echoo-recording-saved">
            <FaCheckCircle /> {savedLabel} saved automatically in Recordings.
          </div>
        )}

        {!saved && (
          <div className="echoo-recording-options">
            <button
              type="button"
              className="private"
              onClick={() => setRetryToken((value) => value + 1)}
              disabled={saving || !error}
            >
              <FaSyncAlt />
              <span>
                <strong>{saving ? 'Saving…' : error ? 'Retry saving' : 'Saving automatically…'}</strong>
                <small>Your Recording stays private until you choose to publish it later from Recordings.</small>
              </span>
            </button>
          </div>
        )}

        <footer>
          <span>
            <FaCloudUploadAlt /> Completed broadcasts are saved automatically to this Echoo backend during local testing.
          </span>
        </footer>
      </section>
    </div>
  );
};

export default BroadcastRecordingPrompt;
