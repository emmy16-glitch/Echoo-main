import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaCheckCircle,
  FaCloudUploadAlt,
  FaDownload,
  FaExclamationTriangle,
  FaSave,
  FaSyncAlt,
  FaWifi,
} from 'react-icons/fa';

import {
  BROADCAST_RECORDING_READY_EVENT,
  clearPendingBroadcastRecording,
  recoverPendingBroadcastRecording,
} from '../../services/broadcastRecordingService.js';
import { autosaveFinishedRecording } from '../../services/recordingAutosave.js';
import './BroadcastRecordingPrompt.css';

const PENDING_RECORDING_DECISION_KEY = '__echooPendingBroadcastRecording';
const SAVED_AUTO_DISMISS_MS = 5000;

// Server error codes mapped to creator-safe language. Raw backend error
// text is never rendered directly; every recovery code gets plain language.
const friendlyRecoveryMessage = (error, recording) => {
  switch (error?.code) {
    case 'RECORDING_WAITING_FOR_NETWORK':
      return 'Recording is safe on this device. Echoo will continue saving when your connection returns.';
    case 'BROADCAST_STILL_LIVE':
      return 'This broadcast still looks live in another session, so Echoo left it untouched. End it there first — your local master stays safe here.';
    case 'RECOVERY_FORBIDDEN':
      return 'This recording belongs to a different creator account. Sign in as that creator to save it, or download a copy below.';
    case 'BROADCAST_NOT_FOUND':
      return 'Echoo could not find this broadcast on the server. Your local file is preserved — download a copy below so it is never lost.';
    case 'BROADCAST_NOT_RECOVERABLE':
      return 'This broadcast never went live, so the recording cannot be linked to it. Your local file is preserved — download a copy below.';
    default:
      return recording?.qualityCompletionPending
        ? 'Echoo is still confirming the final recording data. Your local master is protected; retry saving.'
        : 'Echoo could not save this recording yet. Your local master is protected; retry saving.';
  }
};

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

const BroadcastRecordingPrompt = () => {
  const [pending, setPending] = useState(readRecoveredPendingRecording);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [savedRecordingId, setSavedRecordingId] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const saveAttemptRef = useRef('');
  const savedRef = useRef(false);
  const autoDismissTimerRef = useRef(null);
  const autoDismissStartedAtRef = useRef(0);
  const autoDismissRemainingRef = useRef(SAVED_AUTO_DISMISS_MS);
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  const dismissSavedRecording = useCallback(() => {
    if (!savedRef.current) return;
    window.clearTimeout(autoDismissTimerRef.current);
    setPending(null);
    setSaved(false);
    setSavedRecordingId('');
    saveAttemptRef.current = '';
  }, []);

  const scheduleAutoDismiss = useCallback(() => {
    window.clearTimeout(autoDismissTimerRef.current);
    autoDismissStartedAtRef.current = Date.now();
    autoDismissTimerRef.current = window.setTimeout(
      dismissSavedRecording,
      autoDismissRemainingRef.current
    );
  }, [dismissSavedRecording]);

  useEffect(() => {
    let active = true;
    const applyPendingRecording = (detail) => {
      if (!active || !detail?.recording?.blob?.size) return;
      rememberPendingRecording(detail);
      setPending(detail);
      setError('');
      setErrorCode('');
      setSaved(false);
      setSavedRecordingId('');
      setRetryToken(0);
      saveAttemptRef.current = '';
    };

    const onRecordingReady = (event) => {
      applyPendingRecording(event?.detail || null);
    };

    const recoverPendingRecording = async () => {
      const recovered = readRecoveredPendingRecording();
      if (recovered) {
        applyPendingRecording(recovered);
        return;
      }
      const recording = await recoverPendingBroadcastRecording();
      if (recording) {
        applyPendingRecording({
          recording,
          broadcast: { id: recording.broadcastId, title: 'Recovered live broadcast recording' },
        });
      }
    };

    void recoverPendingRecording();
    window.addEventListener(BROADCAST_RECORDING_READY_EVENT, onRecordingReady);
    window.addEventListener('pageshow', recoverPendingRecording);

    return () => {
      active = false;
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
    const markSaved = (id = '') => {
      if (!active) return;
      forgetPendingRecording();
      clearPendingBroadcastRecording(recording.broadcastId);
      window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
      if (id) setSavedRecordingId(id);
      setSaved(true);
      setSaving(false);
    };

    const saveAutomatically = async () => {
      try {
        setSaving(true);
        setError('');
        setErrorCode('');
        const uploadResponse = await autosaveFinishedRecording({ recording, broadcast });
        rememberPendingRecording({ ...pending, recording });

        markSaved(String(uploadResponse?.data?.id || uploadResponse?.data?._id || ''));
      } catch (saveError) {
        if (!active) return;

        // A lost response after a successful upload can make a retry hit the
        // sourceBroadcast uniqueness guard. In that case the Recording already
        // exists, so treat the lifecycle as successfully finalized instead of
        // creating a confusing duplicate/error loop.
        if (saveError?.code === 'REPLAY_ALREADY_EXISTS') {
          markSaved();
          return;
        }

        setSaving(false);
        setError(friendlyRecoveryMessage(saveError, recording));
        setErrorCode(saveError?.code || '');
      }
    };

    saveAutomatically();

    return () => {
      active = false;
    };
  }, [pending, retryToken, saved]);

  useEffect(() => {
    if (!saved) return undefined;

    autoDismissRemainingRef.current = SAVED_AUTO_DISMISS_MS;
    scheduleAutoDismiss();
    closeButtonRef.current?.focus();

    return () => window.clearTimeout(autoDismissTimerRef.current);
  }, [saved, scheduleAutoDismiss]);

  useEffect(() => {
    if (!pending) return undefined;
    restoreFocusRef.current = document.activeElement;
    dialogRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && savedRef.current) {
        event.preventDefault();
        dismissSavedRecording();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus();
    };
  }, [dismissSavedRecording, pending]);

  useEffect(() => {
    if (!pending || saved) return undefined;

    const protectPendingRecording = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', protectPendingRecording);
    return () => window.removeEventListener('beforeunload', protectPendingRecording);
  }, [pending, saved]);

  // Network recovery is event-driven, never a polling loop: when the save
  // failed for lack of connectivity, retry once when the browser reports
  // the connection is back. Manual "Retry saving" always remains available.
  useEffect(() => {
    if (!pending || saved || !error || errorCode !== 'RECORDING_WAITING_FOR_NETWORK') return undefined;
    const handleOnline = () => setRetryToken((value) => value + 1);
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [pending, saved, error, errorCode]);

  // Manual escape hatch: the creator can always keep a device copy of the
  // recovered master. Downloading never clears OPFS — only a server READY
  // (markSaved) does that.
  const downloadLocalCopy = useCallback(() => {
    const recording = pending?.recording;
    if (!recording?.blob?.size || typeof window === 'undefined') return;
    const extension = recording.lossless || recording.mimeType === 'audio/wav'
      ? 'wav'
      : String(recording.mimeType || '').includes('ogg') ? 'ogg' : 'webm';
    const url = URL.createObjectURL(recording.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = recording.filename || `echoo-recovered-recording.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [pending]);

  if (!pending) return null;

  const { recording, broadcast } = pending;
  const title = broadcast?.title || 'Live broadcast recording';
  const savedLabel = recording.lossless
    ? 'Lossless Master Capture'
    : 'High-quality fallback recording';

  const viewRecording = () => {
    if (!savedRecordingId) return;
    const path = `/creator-studio/recordings/${encodeURIComponent(savedRecordingId)}`;
    dismissSavedRecording();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="echoo-recording-decision-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="echoo-recording-decision"
        role="dialog"
        aria-modal="true"
        aria-labelledby="echoo-recording-decision-title"
        aria-describedby="echoo-recording-decision-description"
        tabIndex={-1}
      >
        {saved && (
          <button
            ref={closeButtonRef}
            type="button"
            className="echoo-recording-decision-close"
            aria-label="Close"
            onClick={dismissSavedRecording}
          >
            ×
          </button>
        )}
        <header>
          <div className={`echoo-recording-decision-icon ${saved ? 'is-saved' : error ? 'is-error' : 'is-saving'}`}>
            {saved ? <FaCheckCircle /> : error ? <FaExclamationTriangle /> : saving ? <FaSyncAlt /> : <FaSave />}
          </div>
          <div>
            <span>LIVE SESSION ENDED</span>
            <h2 id="echoo-recording-decision-title">
              {saved ? 'Recording saved!' : error ? 'Recording needs attention' : 'Saving your recording…'}
            </h2>
            <p id="echoo-recording-decision-description">
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
          <>
            <div className="echoo-recording-saved">
              <FaCheckCircle /> {savedLabel} saved automatically in Recordings.
            </div>
            {savedRecordingId && (
              <div className="echoo-recording-saved-actions">
                <button type="button" onClick={viewRecording}>View recording</button>
              </div>
            )}
          </>
        )}

        {!saved && (
          <div className="echoo-recording-options">
            <button
              type="button"
              className="private"
              onClick={() => setRetryToken((value) => value + 1)}
              disabled={saving || !error}
            >
              {errorCode === 'RECORDING_WAITING_FOR_NETWORK' ? <FaWifi /> : <FaSyncAlt />}
              <span>
                <strong>{saving ? 'Saving…' : error ? 'Retry saving' : 'Saving automatically…'}</strong>
                <small>Your Recording stays private until you choose to publish it later from Recordings.</small>
              </span>
            </button>
            {error && (
              <button
                type="button"
                className="secondary"
                onClick={downloadLocalCopy}
              >
                <FaDownload />
                <span>
                  <strong>Download {recording?.lossless ? 'WAV' : 'recording'} copy</strong>
                  <small>Keep a device copy now. This never deletes the protected master.</small>
                </span>
              </button>
            )}
          </div>
        )}

        <footer>
          {saved ? (
            <div className="echoo-recording-auto-close">
              <span>Auto closing in 5 sec…</span>
              <i aria-hidden="true"><b /></i>
            </div>
          ) : (
            <span>
              <FaCloudUploadAlt /> Completed broadcasts are saved automatically to this Echoo backend during local testing.
            </span>
          )}
        </footer>
      </section>
    </div>
  );
};

export default BroadcastRecordingPrompt;
