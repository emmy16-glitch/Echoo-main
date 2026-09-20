import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaExclamationTriangle, FaSyncAlt, FaTimes } from 'react-icons/fa';
import {
  RECORDING_UPLOAD_EVENT,
  installRecordingAutosave,
  peekLocalMaster,
  forgetLocalMaster,
  retryAutosave,
  uploadRecoveredTake,
} from '../services/recordingAutosave.js';
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
  const hideTimerRef = useRef(null);

  const hide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    setState(null);
  }, []);

  const flashDone = useCallback((detail) => {
    setState({ kind: 'done', title: detail.title, audioId: detail.audioId });
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(hide, 12000);
  }, [hide]);

  useEffect(() => {
    const onUpload = (event) => {
      const detail = event?.detail || {};
      switch (detail.status) {
        case 'started':
          window.clearTimeout(hideTimerRef.current);
          setState({ kind: 'uploading', key: detail.key, title: detail.title, percent: 0, loaded: 0, total: detail.total || 0 });
          break;
        case 'progress':
          setState((current) => current?.key === detail.key
            ? { ...current, kind: 'uploading', percent: detail.percent || 0, loaded: detail.loaded || 0, total: detail.total || current.total }
            : current);
          break;
        case 'done':
          flashDone(detail);
          break;
        case 'error':
          window.clearTimeout(hideTimerRef.current);
          setState({ kind: 'error', key: detail.key, title: detail.title, message: detail.message });
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
    if (state?.kind !== 'uploading') return undefined;
    const protect = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [state?.kind]);

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

  const uploadRecovered = async () => {
    const master = peekLocalMaster('recovered');
    if (!master?.recording?.blob?.size && !master?.blob?.size) {
      hide();
      return;
    }
    const recording = master.recording || { blob: master.blob, mimeType: master.mimeType, broadcastId: '', startedAt: new Date().toISOString() };
    hide();
    await uploadRecoveredTake({ recording, broadcast: master.broadcast || { title: master.title } }).catch(() => {});
  };

  const discardRecovered = () => {
    forgetLocalMaster('recovered');
    hide();
  };

  return (
    <div className={`echoo-save-banner is-${state.kind}`} role="status" aria-live="polite">
      {state.kind === 'uploading' && (
        <>
          <FaSyncAlt className="spin" aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Saving “{state.title}”</strong>
            <span>{formatBytes(state.loaded)} of {formatBytes(state.total)} · {state.percent}% — keep this tab open</span>
            <i className="echoo-save-banner-bar"><b style={{ width: `${Math.max(2, state.percent || 0)}%` }} /></i>
          </div>
        </>
      )}
      {state.kind === 'done' && (
        <>
          <FaCheckCircle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Saved to Recordings as MP3</strong>
            <span>{state.title}</span>
          </div>
          {state.audioId && <button type="button" onClick={openRecording}>View</button>}
          <button type="button" aria-label="Dismiss" onClick={hide}><FaTimes /></button>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <FaExclamationTriangle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Couldn’t save “{state.title}”</strong>
            <span>{state.message || 'Your local master is kept.'}</span>
          </div>
          <button type="button" onClick={retry} disabled={state.retrying}>{state.retrying ? 'Retrying…' : 'Retry'}</button>
          <button type="button" aria-label="Dismiss" onClick={hide}><FaTimes /></button>
        </>
      )}
      {state.kind === 'recovered' && (
        <>
          <FaExclamationTriangle aria-hidden="true" />
          <div className="echoo-save-banner-body">
            <strong>Unsaved recording found</strong>
            <span>{state.title} — from a tab that closed before saving.</span>
          </div>
          <button type="button" onClick={uploadRecovered}>Upload</button>
          <button type="button" onClick={discardRecovered}>Discard</button>
        </>
      )}
    </div>
  );
};

export default RecordingSaveBanner;
