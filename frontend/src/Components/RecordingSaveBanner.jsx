import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaDownload, FaExclamationTriangle, FaSyncAlt, FaTimes } from 'react-icons/fa';
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
    setState({ kind: 'done', key: detail.key, title: detail.title, audioId: detail.audioId, localCopy: detail.localCopy || null });
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
          setState({ kind: 'uploading', key: detail.key, title: detail.title, percent: 0, loaded: 0, total: detail.total || 0, startedAt: Date.now() });
          break;
        case 'finalizing':
          window.clearTimeout(hideTimerRef.current);
          setElapsed(0);
          setState({ kind: 'finalizing', key: detail.key, title: detail.title, startedAt: Date.now() });
          break;
        case 'progress':
          setState((current) => current?.key === detail.key
            ? { ...current, kind: 'uploading', percent: detail.percent || 0, loaded: detail.loaded || 0, total: detail.total || current.total }
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
            hasRecovery: Boolean(detail.hasRecovery),
            recoveryCopy: detail.recoveryCopy || null,
          });
          break;
        case 'recovered':
          setState({ kind: 'recovered', key: 'recovered', title: detail.title });
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
    if (state?.kind !== 'uploading' && state?.kind !== 'finalizing') return undefined;
    const protect = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    const ticker = window.setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - (state.startedAt || Date.now())) / 1000)));
    }, 1000);
    return () => {
      window.removeEventListener('beforeunload', protect);
      window.clearInterval(ticker);
    };
  }, [state?.kind, state?.startedAt]);

  // Event-driven network recovery, never a polling loop: when the save
  // failed for lack of connectivity, retry once when the browser reports
  // the connection is back. Manual Retry always remains available.
  useEffect(() => {
    if (state?.kind !== 'error' || state.code !== 'RECORDING_WAITING_FOR_NETWORK' || !state.key) return undefined;
    const handleOnline = () => { void retryAutosave(state.key).catch(() => {}); };
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

  const retry = async () => {
    setState((current) => (current ? { ...current, retrying: true } : current));
    try {
      await retryAutosave(state.key);
    } catch {
      setState((current) => (current ? { ...current, retrying: false } : current));
    }
  };

  const saveRecovery = async () => {
    if (!state?.key || state.savingRecovery) return;
    setState((current) => (current ? { ...current, savingRecovery: true, recoveryError: '' } : current));
    try {
      const result = await saveRecoveryCopy(state.key);
      setState((current) => (current
        ? {
            ...current,
            savingRecovery: false,
            recoverySaved: !result?.cancelled,
            recoveryFilename: result?.filename || '',
          }
        : current));
    } catch (recoveryError) {
      setState((current) => (current
        ? {
            ...current,
            savingRecovery: false,
            recoveryError: recoveryError?.message || 'Could not save the recovery copy.',
          }
        : current));
    }
  };

  const chooseDeviceCopy = async (format) => {
    if (!state?.key || state.choosing) return;
    setState((current) => (current ? { ...current, choosing: format } : current));
    try {
      await completeDeviceCopyChoice(state.key, format);
    } catch (choiceError) {
      setState((current) => (current
        ? { ...current, choosing: '', choiceError: choiceError?.message || 'Could not save the device copy.' }
        : current));
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
    const recording = master.recording || { blob: master.blob, mimeType: master.mimeType, broadcastId: master.broadcast?.id || '', startedAt: new Date().toISOString() };
    hide();
    await uploadRecoveredTake({ recording, broadcast: master.broadcast || { title: master.title } }).catch(() => {});
  };

  const discardRecovered = () => {
    forgetLocalMaster('recovered');
    hide();
  };

  return (
    <div className={`echoo-save-banner is-${state.kind}`} role="status" aria-live="polite">
      {state.kind === 'finalizing' && (
        <>
          <FaSyncAlt className="spin" aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Finalizing “{state.title}”</strong>
            <span>Building the server MP3 — keep this tab open</span>
          </div>
        </>
      )}
      {state.kind === 'uploading' && (
        <>
          <FaSyncAlt className="spin" aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Saving “{state.title}”</strong>
            <span>{formatBytes(state.loaded)} of {formatBytes(state.total)} · {state.percent}% · {elapsed}s — keep this tab open</span>
            <i className="echoo-save-banner-bar"><b style={{ width: `${Math.max(2, state.percent || 0)}%` }} /></i>
          </div>
        </>
      )}
      {state.kind === 'device-choice' && (
        <>
          <FaCheckCircle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Saved safely to Echoo as MP3</strong>
            <span>
              Choose once how this device should automatically keep future broadcast copies.
              You can change this later in Settings → Recordings.
            </span>
            {state.choiceError && <span className="echoo-save-banner-choice-error">{state.choiceError}</span>}
          </div>
          <div className="echoo-save-banner-choices" aria-label="Automatic device recording format">
            <button type="button" onClick={() => chooseDeviceCopy('mp3')} disabled={Boolean(state.choosing)}>
              {state.choosing === 'mp3' ? 'Saving…' : 'MP3 · Recommended'}
            </button>
            <button type="button" onClick={() => chooseDeviceCopy('wav')} disabled={Boolean(state.choosing)}>
              {state.choosing === 'wav' ? 'Saving…' : 'WAV · Lossless'}
            </button>
            <button type="button" onClick={() => chooseDeviceCopy('none')} disabled={Boolean(state.choosing)}>
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
                ? `Server MP3 · ${String(state.localCopy.format || '').toUpperCase()} device copy · ${state.localCopy.filename || state.title}`
                : `Server MP3 · ${state.title}`}
            </span>
          </div>
          {state.audioId && <button type="button" className="eb-press" onClick={openRecording}>Play recording</button>}
          {state.localCopy?.path && <button type="button" className="eb-press" onClick={openLocalFolder}>Open folder</button>}
          <button type="button" className="eb-press" aria-label="Dismiss" onClick={hide}><FaTimes /></button>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <FaExclamationTriangle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Couldn’t save “{state.title}”</strong>
            <span>{state.message || 'Your local master is kept.'}</span>
          </div>
          {state.hasRecovery && (
            <button type="button" className="eb-press" onClick={saveRecovery} disabled={state.savingRecovery}>
              <FaDownload /> {state.savingRecovery ? 'Saving…' : state.recoverySaved || state.recoveryCopy?.saved ? 'Save another recovery copy' : 'Save recovery copy'}
            </button>
          )}
          <button type="button" className="eb-press" onClick={retry} disabled={state.retrying}>{state.retrying ? 'Retrying…' : 'Retry server save'}</button>
          {state.recoveryFilename && <span className="echoo-save-banner-choice-error">Saved: {state.recoveryFilename}</span>}
          {state.recoveryError && <span className="echoo-save-banner-choice-error">{state.recoveryError}</span>}
          <button type="button" className="eb-press" aria-label="Dismiss" onClick={hide}><FaTimes /></button>
        </>
      )}
      {state.kind === 'recovered' && (
        <>
          <FaExclamationTriangle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Unsaved recording found</strong>
            <span>{state.title} — from a tab that closed before saving.</span>
          </div>
          <button type="button" className="eb-press" onClick={saveRecovery} disabled={state.savingRecovery}>
            <FaDownload /> {state.savingRecovery ? 'Saving…' : 'Save recovery copy'}
          </button>
          <button type="button" className="eb-press" onClick={uploadRecovered}>Upload recovery to server</button>
          <button type="button" className="eb-press" onClick={discardRecovered}>Discard</button>
        </>
      )}
    </div>
  );
};

export default RecordingSaveBanner;
