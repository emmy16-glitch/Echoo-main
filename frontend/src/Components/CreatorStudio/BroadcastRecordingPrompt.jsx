import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaCheckCircle,
  FaCloudUploadAlt,
  FaCut,
  FaExclamationTriangle,
  FaPlay,
  FaSave,
  FaStop,
  FaSyncAlt,
} from 'react-icons/fa';

import studioService from '../../services/studioService.js';
import {
  BROADCAST_RECORDING_READY_EVENT,
  clearPendingBroadcastRecording,
  retryBroadcastQualityCompletion,
} from '../../services/broadcastRecordingService.js';
import {
  canTrimRecording,
  computePeaksAsync,
  decodeRecordingBlob,
  trimBufferToWavBlob,
} from '../../services/audioTrimService.js';
import {
  ECHOO_RECORDINGS_LIBRARY,
  RECORDING_PC_FORMATS,
  saveRecordingToPc,
  waitForServerMp3,
} from '../../services/recordingExportService.js';
import './BroadcastRecordingPrompt.css';

const PENDING_RECORDING_DECISION_KEY = '__echooPendingBroadcastRecording';
const SAVED_AUTO_DISMISS_MS = 5000;

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
  const [savedRecordingId, setSavedRecordingId] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [pcFormat, setPcFormat] = useState('mp3');
  const [pcSaving, setPcSaving] = useState(false);
  const [pcMessage, setPcMessage] = useState('');
  // Trim/crop step (before anything is uploaded). The decoded buffer stays
  // in memory only while this dialog is open; the local master blob is the
  // source of truth until the creator presses Save.
  const [trimPeaks, setTrimPeaks] = useState([]);
  const [trimDuration, setTrimDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [trimPreparing, setTrimPreparing] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);
  const [trimSupported, setTrimSupported] = useState(true);
  const [trimWasCut, setTrimWasCut] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [mp3Ready, setMp3Ready] = useState(false);
  const [mp3Checking, setMp3Checking] = useState(false);
  const trimBufferRef = useRef(null);
  const previewAudioRef = useRef(null);
  const previewObjectUrlRef = useRef('');
  const previewStopTimerRef = useRef(null);
  const savedUploadBlobRef = useRef(null);
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
    stopPreview();
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = '';
    }
    trimBufferRef.current = null;
    savedUploadBlobRef.current = null;
    setPending(null);
    setSaved(false);
    setSavedRecordingId('');
    saveAttemptRef.current = '';
  }, []);

  const stopPreview = useCallback(() => {
    window.clearTimeout(previewStopTimerRef.current);
    try {
      previewAudioRef.current?.pause();
    } catch {
      // No active preview.
    }
    setPreviewing(false);
  }, []);

  const scheduleAutoDismiss = useCallback(() => {
    window.clearTimeout(autoDismissTimerRef.current);
    autoDismissStartedAtRef.current = Date.now();
    autoDismissTimerRef.current = window.setTimeout(
      dismissSavedRecording,
      autoDismissRemainingRef.current
    );
  }, [dismissSavedRecording]);

  const pauseAutoDismiss = useCallback(() => {
    if (!savedRef.current) return;
    const elapsed = Date.now() - autoDismissStartedAtRef.current;
    autoDismissRemainingRef.current = Math.max(1000, autoDismissRemainingRef.current - elapsed);
    window.clearTimeout(autoDismissTimerRef.current);
  }, []);

  const resumeAutoDismiss = useCallback(() => {
    if (!savedRef.current) return;
    scheduleAutoDismiss();
  }, [scheduleAutoDismiss]);

  useEffect(() => {
    const applyPendingRecording = (detail) => {
      if (!detail?.recording?.blob?.size) return;
      rememberPendingRecording(detail);
      setPending(detail);
      setError('');
      setSaved(false);
      setSavedRecordingId('');
      setRetryToken(0);
      setPcFormat('mp3');
      setPcMessage('');
      setTrimPeaks([]);
      setTrimDuration(0);
      setTrimStart(0);
      setTrimEnd(0);
      setTrimPreparing(false);
      setTrimProgress(0);
      setTrimSupported(true);
      setTrimWasCut(false);
      setPreviewing(false);
      setMp3Ready(false);
      setMp3Checking(false);
      trimBufferRef.current = null;
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

  // Step 1 — prepare the trim editor as soon as the master lands, with
  // progress. Save is NEVER blocked on this: creators can save the full
  // recording immediately while the waveform loads in the background.
  useEffect(() => {
    if (!pending?.recording?.blob?.size || saved) return undefined;
    const { recording } = pending;
    let active = true;

    if (!canTrimRecording(recording.blob)) {
      setTrimSupported(false);
      setRetryToken((value) => value + 1);
      return undefined;
    }

    setTrimPreparing(true);
    setTrimProgress(2);
    decodeRecordingBlob(recording.blob, (value) => {
      if (active) setTrimProgress(Math.min(70, value * 0.7));
    })
      .then(async (buffer) => {
        if (!active) return;
        trimBufferRef.current = buffer;
        const peaks = await computePeaksAsync(buffer, 120, (value) => {
          if (active) setTrimProgress(70 + Math.round(value * 0.3));
        });
        if (!active) return;
        setTrimPeaks(peaks);
        setTrimDuration(buffer.duration || recording.durationSeconds || 0);
        setTrimStart(0);
        setTrimEnd(buffer.duration || recording.durationSeconds || 0);
        setTrimSupported(true);
        setTrimProgress(100);
      })
      .catch(() => {
        if (!active) return;
        // Decoder failed (odd codec, low memory) — fall back to full save.
        setTrimSupported(false);
        setRetryToken((value) => value + 1);
      })
      .finally(() => {
        if (active) setTrimPreparing(false);
      });

    return () => {
      active = false;
    };
  }, [pending, saved]);

  useEffect(() => {
    if (!pending?.recording?.blob?.size || saved) return undefined;

    const { recording, broadcast } = pending;
    const saveKey = String(recording.broadcastId || broadcast?.id || 'recording');
    const attemptKey = `${saveKey}:${retryToken}`;
    if (saveAttemptRef.current === attemptKey) return undefined;
    saveAttemptRef.current = attemptKey;

    let active = true;
    const notifyToast = (message, type = 'success') => {
      window.dispatchEvent(new CustomEvent('echoo:toast', { detail: { message, type } }));
    };
    const markSaved = (id = '') => {
      if (!active) return;
      forgetPendingRecording();
      clearPendingBroadcastRecording(recording.broadcastId);
      stopPreview();
      window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
      if (id) {
        setSavedRecordingId(id);
        setMp3Checking(true);
        // Probe server MP3 in background so "Save MP3 to PC" enables itself.
        waitForServerMp3(id, { attempts: 12, delayMs: 2500 })
          .then(() => { if (active) { setMp3Ready(true); setMp3Checking(false); } })
          .catch(() => { if (active) setMp3Checking(false); });
      }
      setSaved(true);
      setSaving(false);
      notifyToast(id ? 'Recording saved! Server copy is MP3 — find it in Recordings.' : 'Recording saved!', 'success');
    };

    // Step 2 — upload. Called from the Save button (trimmed or full) or
    // automatically when trimming is unavailable (huge/undecodable master).
    const saveRecording = async ({ trimmed = true } = {}) => {
      const title = broadcast?.title || 'Live broadcast recording';
      const description = broadcast?.description || '';
      const attemptTrim = trimmed && trimSupported && trimBufferRef.current && trimDuration > 0;

      try {
        setSaving(true);
        setError('');

        if (recording.qualityCompletionPending) {
          await retryBroadcastQualityCompletion(recording);
          rememberPendingRecording({ ...pending, recording });
        }

        let uploadBlob = recording.blob;
        let uploadMime = recording.mimeType || recording.blob.type || 'audio/wav';
        let wasCut = false;
        if (attemptTrim) {
          const end = trimEnd > trimStart ? trimEnd : trimDuration;
          const fullLength = end - trimStart >= trimDuration - 0.5 && trimStart <= 0.5;
          if (!fullLength) {
            const cut = trimBufferToWavBlob(trimBufferRef.current, trimStart, end);
            uploadBlob = cut.blob;
            uploadMime = 'audio/wav';
            wasCut = true;
          }
        }

        let uploadName = safeFilename(title, recording);
        if (wasCut && !uploadName.toLowerCase().endsWith('.wav')) {
          // Trimmed audio is always re-encoded to WAV — never keep a stale
          // .webm/.ogg extension from an Opus fallback master.
          uploadName = uploadName.replace(/\.[a-z0-9]+$/i, '') + '.wav';
        }

        const file = new File(
          [uploadBlob],
          uploadName,
          { type: uploadMime }
        );

        const uploadResponse = await studioService.uploadAudio({
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
            ...(wasCut ? ['trimmed'] : []),
          ],
          // Visibility is managed later from Recordings rather than
          // interrupting End Broadcast with a publish/private decision.
          isPublic: false,
          broadcastId: recording.broadcastId,
        });

        setTrimWasCut(wasCut);
        // Remember exactly what was uploaded so "Save WAV to PC" matches it.
        savedUploadBlobRef.current = wasCut ? uploadBlob : null;
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
        setError(
          recording.qualityCompletionPending
            ? saveError?.message || 'Echoo is still confirming the final recording data. Your local master is protected; retry saving.'
            : saveError?.message || 'Echoo could not save this recording yet. Your local master is protected; retry saving.'
        );
      }
    };

    // Only auto-save when trimming is unavailable — otherwise the creator
    // reviews/trims first and presses Save themselves.
    if (!trimSupported && !trimPreparing) {
      saveRecording({ trimmed: false });
    }

    return () => {
      active = false;
    };
  }, [pending, retryToken, saved, trimSupported, trimPreparing, trimStart, trimEnd, trimDuration]);

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

  // Preview the selected [trimStart, trimEnd) region of the local master.
  const previewTrim = () => {
    const blob = pending?.recording?.blob;
    if (!blob?.size || !trimDuration) return;
    stopPreview();
    if (!previewObjectUrlRef.current) {
      previewObjectUrlRef.current = URL.createObjectURL(blob);
    }
    const audio = previewAudioRef.current;
    if (!audio) return;
    const end = trimEnd > trimStart ? trimEnd : trimDuration;
    try {
      audio.src = previewObjectUrlRef.current;
      audio.currentTime = Math.max(0, trimStart);
      void audio.play();
      setPreviewing(true);
      previewStopTimerRef.current = window.setTimeout(
        () => stopPreview(),
        Math.max(500, (end - trimStart) * 1000)
      );
    } catch {
      setPreviewing(false);
    }
  };

  const end = trimEnd > trimStart ? trimEnd : trimDuration;
  const isFullLength = trimDuration > 0 && end - trimStart >= trimDuration - 0.5 && trimStart <= 0.5;
  const selectedSeconds = Math.max(0, end - trimStart);

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
        {(saved || error) && (
          <button
            ref={saved ? closeButtonRef : undefined}
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
              {saved ? 'Recording saved!' : error ? 'Recording needs attention' : saving ? 'Saving your recording…' : 'Trim your recording'}
            </h2>
            <p id="echoo-recording-decision-description">
              {saved
                ? 'Your completed broadcast is now available in Recordings. Echoo automatically saves every completed broadcast.'
                : error
                  ? 'Echoo kept the local master safe. Adjust the trim if you like, then retry saving.'
                  : saving
                    ? 'Uploading your recording to the Echoo server as MP3…'
                    : 'Drag the handles to crop the part you want to keep, preview it, then press Save. The server copy is always MP3.'}
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

        {!saved && trimSupported && (
          <div className="echoo-recording-trim">
            <div className="echoo-recording-trim-head">
              <strong><FaCut /> Step 1 — Trim / crop (optional)</strong>
              <span>{trimDuration ? `${formatDuration(trimStart)} – ${formatDuration(end)} of ${formatDuration(trimDuration)}` : 'Preparing…'}</span>
            </div>
            {trimPreparing || (!trimPeaks.length && !trimDuration) ? (
              <div className="echoo-recording-trim-loading">
                <div>Reading waveform… {trimProgress}%</div>
                <div className="echoo-recording-trim-progress" aria-hidden="true">
                  <i style={{ width: `${Math.max(2, trimProgress)}%` }} />
                </div>
                <button
                  type="button"
                  className="private"
                  onClick={() => setRetryToken((value) => value + 1)}
                  disabled={saving}
                >
                  <FaSave />
                  <span>
                    <strong>{saving ? 'Saving…' : 'Skip trimming — save full now'}</strong>
                    <small>Waveform keeps loading in the background. Nothing is lost.</small>
                  </span>
                </button>
              </div>
            ) : (
              <>
                <div
                  className="echoo-recording-waveform"
                  role="img"
                  aria-label={`Waveform of your recording, selected ${formatDuration(trimStart)} to ${formatDuration(end)}`}
                >
                  {trimPeaks.map((peak, index) => {
                    const pos = trimPeaks.length <= 1 ? 0 : index / (trimPeaks.length - 1);
                    const time = pos * trimDuration;
                    const selected = time >= trimStart && time <= end;
                    return (
                      <i
                        key={index}
                        style={{ height: `${Math.max(4, Math.round(peak * 100))}%` }}
                        className={selected ? 'is-selected' : 'is-cut'}
                      />
                    );
                  })}
                </div>
                <label className="echoo-recording-trim-slider">
                  <span>Start <b>{formatDuration(trimStart)}</b></span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, Math.floor(trimDuration))}
                    step={1}
                    value={Math.min(Math.floor(trimStart), Math.floor(end))}
                    disabled={saving}
                    onChange={(event) => {
                      stopPreview();
                      setTrimStart(Math.min(Number(event.target.value), end));
                    }}
                  />
                </label>
                <label className="echoo-recording-trim-slider">
                  <span>End <b>{formatDuration(end)}</b></span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, Math.floor(trimDuration))}
                    step={1}
                    value={Math.floor(end)}
                    disabled={saving}
                    onChange={(event) => {
                      stopPreview();
                      setTrimEnd(Math.max(Number(event.target.value), trimStart));
                    }}
                  />
                </label>
                <div className="echoo-recording-trim-actions">
                  <button type="button" onClick={previewTrim} disabled={saving || previewing}>
                    {previewing ? <FaStop /> : <FaPlay />}
                    <span>{previewing ? 'Playing…' : 'Preview selection'}</span>
                  </button>
                  <span className="echoo-recording-trim-length">
                    {isFullLength ? 'Full recording' : `${formatDuration(selectedSeconds)} selected`}
                  </span>
                </div>
                <audio ref={previewAudioRef} preload="auto" onEnded={stopPreview} hidden />
              </>
            )}
          </div>
        )}

        {saved && (
          <>
            <div className="echoo-recording-saved" role="status" aria-live="polite">
              <FaCheckCircle /> {savedLabel} saved in Recordings as MP3{trimWasCut ? ' (trimmed)' : ''}. Saved successfully!
            </div>
            <div
              className="echoo-recording-pc-save"
              onMouseEnter={pauseAutoDismiss}
              onMouseLeave={resumeAutoDismiss}
              onFocus={pauseAutoDismiss}
              onBlur={resumeAutoDismiss}
            >
              <strong>Step 2 — Save a copy to this phone / PC?</strong>
              <span className="echoo-recording-pc-hint">
                Server copy is MP3 automatically. For this device, pick MP3 (universal), Opus (smallest, instant) or WAV (lossless) —
                files suggest <code>Desktop/{ECHOO_RECORDINGS_LIBRARY}/</code> as your library.
                {mp3Checking && !mp3Ready ? ' Preparing server MP3…' : mp3Ready ? ' Server MP3 is ready.' : ''}
              </span>
              <div className="echoo-recording-format-row" role="radiogroup" aria-label="PC save format">
                {RECORDING_PC_FORMATS.map((option) => (
                  <label key={option.id} className={`echoo-recording-format${pcFormat === option.id ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="echoo-pc-format"
                      value={option.id}
                      checked={pcFormat === option.id}
                      onChange={() => { setPcFormat(option.id); setPcMessage(''); }}
                    />
                    <span><strong>{option.label}</strong><small>{option.hint}</small></span>
                  </label>
                ))}
              </div>
              <div className="echoo-recording-saved-actions">
                <button
                  type="button"
                  disabled={pcSaving || (pcFormat === 'mp3' && mp3Checking && !mp3Ready)}
                  onClick={async () => {
                    setPcSaving(true);
                    setPcMessage('');
                    try {
                      const result = await saveRecordingToPc({
                        blob: savedUploadBlobRef.current?.size ? savedUploadBlobRef.current : recording.blob,
                        title,
                        format: pcFormat,
                        audioId: savedRecordingId,
                      });
                      if (result?.cancelled) {
                        setPcMessage('Save cancelled.');
                      } else {
                        setPcMessage(
                          pcFormat === 'mp3'
                            ? `MP3 saved to your device${result?.path ? ` (${result.path})` : ''}. Saved successfully!`
                            : pcFormat === 'opus'
                              ? `Opus saved to your device${result?.path ? ` (${result.path})` : ''}. Saved successfully!`
                              : `WAV master saved to your device${result?.path ? ` (${result.path})` : ''}. Saved successfully!`
                        );
                      }
                    } catch (saveError) {
                      setPcMessage(saveError?.message || 'Could not save to this device.');
                    } finally {
                      setPcSaving(false);
                    }
                  }}
                >
                  <FaSave /> {pcSaving ? 'Saving…' : pcFormat === 'mp3' && mp3Checking && !mp3Ready ? 'Preparing MP3…' : `Save ${pcFormat.toUpperCase()} to this device`}
                </button>
                {savedRecordingId && (
                  <button type="button" onClick={viewRecording}>View recording</button>
                )}
              </div>
              {pcMessage && <div className="echoo-recording-pc-message">{pcMessage}</div>}
            </div>
          </>
        )}

        {!saved && (
          <div className="echoo-recording-options">
            <div className="echoo-recording-step-label">Step 2 — Save to server (automatic MP3, private)</div>
            {trimSupported ? (
              <>
                <button
                  type="button"
                  className="publish"
                  onClick={() => setRetryToken((value) => value + 1)}
                  disabled={saving}
                >
                  <FaSave />
                  <span>
                    <strong>{saving ? 'Saving… uploading as MP3…' : error ? 'Retry saving' : trimPreparing ? 'Save full recording now' : isFullLength ? 'Save full recording' : `Save trimmed (${formatDuration(selectedSeconds)})`}</strong>
                    <small>Uploads to the Echoo server as MP3. Stays private until you publish it from Recordings.</small>
                  </span>
                </button>
                {!isFullLength && !saving && (
                  <button
                    type="button"
                    className="private"
                    onClick={() => {
                      stopPreview();
                      setTrimStart(0);
                      setTrimEnd(trimDuration);
                      setRetryToken((value) => value + 1);
                    }}
                    disabled={saving}
                  >
                    <FaSyncAlt />
                    <span>
                      <strong>Save full recording instead</strong>
                      <small>Skip trimming and keep the whole {formatDuration(trimDuration)} master.</small>
                    </span>
                  </button>
                )}
              </>
            ) : (
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
            )}
          </div>
        )}

        <footer>
          {saved ? (
            <div className="echoo-recording-auto-close" onMouseEnter={pauseAutoDismiss} onMouseLeave={resumeAutoDismiss}>
              <span>Saved successfully! Auto closing in 5 sec… (hover to pause)</span>
              <i aria-hidden="true"><b /></i>
            </div>
          ) : (
            <span>
              <FaCloudUploadAlt /> Step 1 trim (optional), Step 2 save — the server copy is MP3 and stays private until you publish it.
            </span>
          )}
        </footer>
      </section>
    </div>
  );
};

export default BroadcastRecordingPrompt;
