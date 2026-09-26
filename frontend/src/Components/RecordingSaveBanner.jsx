import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaCheckCircle,
  FaDownload,
  FaExclamationTriangle,
  FaSyncAlt,
  FaTimes,
} from 'react-icons/fa';
import {
  RECORDING_UPLOAD_EVENT,
  installRecordingAutosave,
  peekLocalMaster,
  forgetLocalMaster,
  retryAutosave,
  saveRecoveryCopy,
  completeDeviceCopyChoice,
  uploadRecoveredTake,
} from '../services/recordingAutosave.js';
import { openDesktopRecordingsFolder } from '../services/desktopBridge.js';
import './RecordingSaveBanner.css';

const formatBytes = (bytes) => {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 ** 3)).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size <= 0) return '0 KB';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const normalizedFormats = (formats = []) =>
  [...new Set(Array.isArray(formats) ? formats : [])]
    .filter((format) => ['mp3', 'wav', 'opus'].includes(format));

export function RecordingAutosaveMount() {
  useEffect(() => installRecordingAutosave(), []);
  return null;
}

const RecordingSaveBanner = () => {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const hideTimerRef = useRef(null);

  const hide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    setState(null);
  }, []);

  const flashDone = useCallback((detail) => {
    setState({
      kind: 'done',
      key: detail.key,
      title: detail.title,
      audioId: detail.audioId,
      localCopy: detail.localCopy || null,
    });
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(hide, 12000);
  }, [hide]);

  useEffect(() => {
    const onUpload = (event) => {
      const detail = event?.detail || {};
      switch (detail.status) {
        case 'started':
          window.clearTimeout(hideTimerRef.current);
          setElapsed(0);
          setState({
            kind: 'uploading',
            key: detail.key,
            title: detail.title,
            percent: 0,
            loaded: 0,
            total: detail.total || 0,
            startedAt: Date.now(),
          });
          break;
        case 'device-saving':
          window.clearTimeout(hideTimerRef.current);
          setElapsed(0);
          setState({
            kind: 'device-saving',
            key: detail.key,
            title: detail.title,
            format: detail.format || 'mp3',
            percent: 0,
            startedAt: Date.now(),
          });
          break;
        case 'device-progress':
          setState((current) => current?.key === detail.key
            ? {
                ...current,
                kind: 'device-saving',
                format: detail.format || current.format || 'mp3',
                percent: Math.max(0, Math.min(100, Number(detail.percent) || 0)),
              }
            : current);
          break;
        case 'finalizing':
          window.clearTimeout(hideTimerRef.current);
          setElapsed(0);
          setState({
            kind: 'finalizing',
            key: detail.key,
            title: detail.title,
            startedAt: Date.now(),
            localCopy: detail.localCopy || null,
            localSaved: Boolean(detail.localSaved || detail.localCopy?.saved),
            hasRecovery: Boolean(detail.hasRecovery),
            recoveryFormats: normalizedFormats(detail.recoveryFormats),
            preferredFormat: detail.preferredFormat || 'mp3',
            serverReady: Boolean(detail.serverReady),
          });
          break;
        case 'progress':
          setState((current) => current?.key === detail.key
            ? {
                ...current,
                kind: 'uploading',
                percent: detail.percent || 0,
                loaded: detail.loaded || 0,
                total: detail.total || current.total,
              }
            : current);
          break;
        case 'device-choice':
          window.clearTimeout(hideTimerRef.current);
          setState({
            kind: 'device-choice',
            key: detail.key,
            title: detail.title,
            audioId: detail.audioId,
            channelName: detail.channelName || '',
            preparedFormat: detail.preparedFormat || '',
            downloadStarted: Boolean(detail.downloadStarted),
            message: detail.message || '',
          });
          break;
        case 'done':
          flashDone(detail);
          break;
        case 'error':
          window.clearTimeout(hideTimerRef.current);
          setState({
            kind: 'error',
            key: detail.key,
            title: detail.title,
            message: detail.message,
            code: detail.code || '',
            audioId: detail.audioId || null,
            localCopy: detail.localCopy || null,
            localSaved: Boolean(detail.localSaved || detail.localCopy?.saved),
            hasRecovery: Boolean(detail.hasRecovery),
            recoveryFormats: normalizedFormats(detail.recoveryFormats),
            preferredFormat: detail.preferredFormat || 'mp3',
            serverReady: Boolean(detail.serverReady),
          });
          break;
        case 'recovered':
          window.clearTimeout(hideTimerRef.current);
          setState({
            kind: 'recovered',
            key: 'recovered',
            title: detail.title,
            recoveryFormats: normalizedFormats(detail.recoveryFormats),
            preferredFormat: detail.preferredFormat || 'mp3',
          });
          break;
        default:
          break;
      }
    };

    window.addEventListener(RECORDING_UPLOAD_EVENT, onUpload);
    return () => {
      window.removeEventListener(RECORDING_UPLOAD_EVENT, onUpload);
      window.clearTimeout(hideTimerRef.current);
    };
  }, [flashDone]);

  useEffect(() => {
    if (!['uploading', 'finalizing', 'device-saving'].includes(state?.kind)) {
      return undefined;
    }
    const protect = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    const ticker = window.setInterval(() => {
      setElapsed(Math.max(
        0,
        Math.round((Date.now() - (state.startedAt || Date.now())) / 1000)
      ));
    }, 1000);
    return () => {
      window.removeEventListener('beforeunload', protect);
      window.clearInterval(ticker);
    };
  }, [state?.kind, state?.startedAt]);

  useEffect(() => {
    if (
      state?.kind !== 'error' ||
      state.code !== 'RECORDING_WAITING_FOR_NETWORK' ||
      !state.key
    ) return undefined;

    const handleOnline = () => {
      void retryAutosave(state.key).catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [state?.kind, state?.code, state?.key]);

  if (!state) return null;

  const openRecording = () => {
    if (!state.audioId) {
      hide();
      return;
    }
    hide();
    navigate(`/creator-studio/recordings/${encodeURIComponent(state.audioId)}`);
  };

  const retryServer = async () => {
    if (!state?.key || state.retryingServer) return;
    setState((current) => (
      current ? { ...current, retryingServer: true } : current
    ));
    try {
      await retryAutosave(state.key);
    } catch {
      setState((current) => (
        current ? { ...current, retryingServer: false } : current
      ));
    }
  };

  const saveRecovery = async (format = '') => {
    if (!state?.key || state.savingRecoveryFormat) return;
    const selected = format || state.preferredFormat || '';
    setState((current) => (
      current
        ? {
            ...current,
            savingRecoveryFormat: selected || 'local',
            recoveryError: '',
          }
        : current
    ));

    try {
      const result = await saveRecoveryCopy(state.key, selected);
      setState((current) => (
        current
          ? {
              ...current,
              savingRecoveryFormat: '',
              recoverySaved: Boolean(result?.saved),
              recoveryPrepared: Boolean(result?.prepared),
              recoveryDownloadStarted: Boolean(result?.downloadStarted),
              recoveryFilename: result?.filename || '',
              localSaved: current.localSaved || Boolean(result?.saved),
              localCopy: result?.saved
                ? {
                    ...(current.localCopy || {}),
                    ...result,
                    format: selected || result?.format,
                  }
                : current.localCopy,
            }
          : current
      ));
    } catch (recoveryError) {
      setState((current) => (
        current
          ? {
              ...current,
              savingRecoveryFormat: '',
              recoveryError:
                recoveryError?.message || 'Could not save the local recording.',
            }
          : current
      ));
    }
  };

  const chooseDeviceCopy = async (format) => {
    if (!state?.key || state.choosing) return;
    setState((current) => (
      current ? { ...current, choosing: format, choiceError: '' } : current
    ));
    try {
      await completeDeviceCopyChoice(state.key, format);
    } catch (choiceError) {
      setState((current) => (
        current
          ? {
              ...current,
              choosing: '',
              choiceError:
                choiceError?.message || 'Could not save the device copy.',
            }
          : current
      ));
    }
  };

  const openLocalFolder = async () => {
    if (!state?.localCopy?.path) return;
    await openDesktopRecordingsFolder(state.localCopy.path).catch(() => {});
  };

  const uploadRecovered = async () => {
    const master = peekLocalMaster('recovered');
    if (!master?.recording?.blob?.size && !master?.blob?.size) {
      hide();
      return;
    }
    const recording = master.recording || {
      blob: master.blob,
      mimeType: master.mimeType,
      broadcastId: master.broadcast?.id || '',
      startedAt: new Date().toISOString(),
    };
    hide();
    await uploadRecoveredTake({
      recording,
      broadcast: master.broadcast || { title: master.title },
    }).catch(() => {});
  };

  const discardRecovered = async () => {
    const master = peekLocalMaster('recovered');
    try {
      await master?.recording?.dispose?.();
    } catch {
      // The UI can still forget the in-memory card; a later recovery attempt
      // will handle any storage cleanup that the browser refused here.
    }
    forgetLocalMaster('recovered');
    hide();
  };

  const renderLocalSaveButtons = () => {
    if (!state.hasRecovery && state.kind !== 'recovered' && state.kind !== 'finalizing') {
      return null;
    }
    const formats = normalizedFormats(state.recoveryFormats);
    if (!formats.length) return null;

    return (
      <div className="echoo-save-banner-choices" aria-label="Save local recording">
        {formats.map((format) => (
          <button
            key={format}
            type="button"
            className="eb-press"
            onClick={() => saveRecovery(format)}
            disabled={Boolean(state.savingRecoveryFormat)}
          >
            <FaDownload /> {
              state.savingRecoveryFormat === format
                ? `Saving ${format.toUpperCase()}…`
                : state.recoveryPrepared && format === 'mp3'
                  ? 'MP3 ready · Tap to save'
                  : `Save ${format.toUpperCase()} to device`
            }
          </button>
        ))}
      </div>
    );
  };

  return (
    <div
      className={`echoo-save-banner is-${state.kind}`}
      role="status"
      aria-live="polite"
    >
      {state.kind === 'device-saving' && (
        <>
          <FaSyncAlt className="spin" aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>
              Saving local {String(state.format || 'mp3').toUpperCase()} “{state.title}”
            </strong>
            <span>
              {state.format === 'mp3'
                ? `Encoding on this device · ${state.percent || 0}% · server not required`
                : 'Saving the lossless local master · server not required'}
            </span>
            {state.format === 'mp3' && (
              <i className="echoo-save-banner-bar">
                <b style={{ width: `${Math.max(2, state.percent || 0)}%` }} />
              </i>
            )}
          </div>
        </>
      )}

      {state.kind === 'finalizing' && (
        <>
          <FaSyncAlt className="spin" aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>
              {state.localSaved
                ? 'Local recording saved · finishing Echoo server copy'
                : `Recording ready locally · finishing “${state.title}” on Echoo`}
            </strong>
            <span>
              {state.localSaved
                ? 'You already have the device copy. Server finalization can finish separately.'
                : 'You can save MP3 or WAV to this device now — you do not need to wait for the server.'}
            </span>
          </div>
          {!state.localSaved && renderLocalSaveButtons()}
        </>
      )}

      {state.kind === 'uploading' && (
        <>
          <FaSyncAlt className="spin" aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Saving “{state.title}”</strong>
            <span>
              {formatBytes(state.loaded)} of {formatBytes(state.total)} · {state.percent}% · {elapsed}s — keep this tab open
            </span>
            <i className="echoo-save-banner-bar">
              <b style={{ width: `${Math.max(2, state.percent || 0)}%` }} />
            </i>
          </div>
        </>
      )}

      {state.kind === 'device-choice' && (
        <>
          <FaCheckCircle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Saved safely to Echoo as MP3</strong>
            <span>
              {state.message || (
                <>
                  Choose once how this device should keep future broadcast
                  copies. MP3 is encoded locally; WAV keeps the lossless master.
                  Browsers may require one final Save tap. You can change this
                  later in Settings → Recordings.
                </>
              )}
            </span>
            {state.choiceError && (
              <span className="echoo-save-banner-choice-error">
                {state.choiceError}
              </span>
            )}
          </div>
          <div
            className="echoo-save-banner-choices"
            aria-label="Automatic device recording format"
          >
            <button
              type="button"
              onClick={() => chooseDeviceCopy('mp3')}
              disabled={Boolean(state.choosing)}
            >
              {state.choosing === 'mp3'
                ? 'Saving…'
                : state.preparedFormat === 'mp3'
                  ? 'MP3 ready · Tap to save'
                  : 'MP3 · Recommended'}
            </button>
            <button
              type="button"
              onClick={() => chooseDeviceCopy('wav')}
              disabled={Boolean(state.choosing)}
            >
              {state.choosing === 'wav' ? 'Saving…' : 'WAV · Lossless'}
            </button>
            <button
              type="button"
              onClick={() => chooseDeviceCopy('none')}
              disabled={Boolean(state.choosing)}
            >
              Server only
            </button>
          </div>
        </>
      )}

      {state.kind === 'done' && (
        <>
          <FaCheckCircle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Recording saved</strong>
            <span>
              {state.localCopy?.saved
                ? `Echoo server MP3 · ${String(state.localCopy.format || '').toUpperCase()} device copy · ${state.localCopy.filename || state.title}`
                : `Echoo server MP3 · ${state.title}`}
            </span>
          </div>
          {state.audioId && (
            <button type="button" className="eb-press" onClick={openRecording}>
              Play recording
            </button>
          )}
          {state.localCopy?.path && (
            <button
              type="button"
              className="eb-press"
              onClick={openLocalFolder}
            >
              Open folder
            </button>
          )}
          <button
            type="button"
            className="eb-press"
            aria-label="Dismiss"
            onClick={hide}
          >
            <FaTimes />
          </button>
        </>
      )}

      {state.kind === 'error' && (
        <>
          <FaExclamationTriangle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>
              {state.localSaved
                ? 'Local recording saved — Echoo server copy is pending'
                : state.serverReady
                  ? 'Echoo server copy is safe — device copy needs attention'
                  : `Recording is safe locally — server is not ready`}
            </strong>
            <span>{state.message || 'Your local master is kept.'}</span>
          </div>

          {renderLocalSaveButtons()}

          {!state.serverReady && (
            <button
              type="button"
              className="eb-press"
              onClick={retryServer}
              disabled={state.retryingServer}
            >
              {state.retryingServer ? 'Retrying server…' : 'Retry Echoo server save'}
            </button>
          )}

          {state.recoverySaved && state.recoveryFilename && (
            <span className="echoo-save-banner-choice-error">
              Saved: {state.recoveryFilename}
            </span>
          )}
          {state.recoveryPrepared && (
            <span className="echoo-save-banner-choice-error">
              MP3 is encoded and ready. Tap Save MP3 again to open the phone save/share sheet.
            </span>
          )}
          {state.recoveryDownloadStarted && state.recoveryFilename && (
            <span className="echoo-save-banner-choice-error">
              Browser download started: {state.recoveryFilename}. Echoo kept the local master because browsers cannot confirm the file was actually retained.
            </span>
          )}
          {state.recoveryError && (
            <span className="echoo-save-banner-choice-error">
              {state.recoveryError}
            </span>
          )}
          <button
            type="button"
            className="eb-press"
            aria-label="Dismiss"
            onClick={hide}
          >
            <FaTimes />
          </button>
        </>
      )}

      {state.kind === 'recovered' && (
        <>
          <FaExclamationTriangle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Unsaved local recording found</strong>
            <span>
              {state.title} — recovered from this device. Save it as MP3 or WAV
              before trying the server if you want a device copy first.
            </span>
          </div>

          {renderLocalSaveButtons()}

          <button
            type="button"
            className="eb-press"
            onClick={uploadRecovered}
          >
            Retry Echoo server save
          </button>
          <button
            type="button"
            className="eb-press"
            onClick={() => { void discardRecovered(); }}
          >
            Discard
          </button>
        </>
      )}
    </div>
  );
};

export default RecordingSaveBanner;
