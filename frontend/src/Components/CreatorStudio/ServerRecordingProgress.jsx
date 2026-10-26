import { useCallback, useEffect, useState } from 'react';
import batch3Service from '../../services/batch3Service';
import { retryAutosave } from '../../services/recordingAutosave';

const LAST_RECORDING_KEY = 'echoo:last-protected-broadcast:v1';
const SNAPSHOT_KEY = 'echoo:server-recording-progress:v1';
const ownerId = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return String(user._id || user.id || '');
  } catch { return ''; }
};
const loadBroadcastId = () => {
  try { return localStorage.getItem(LAST_RECORDING_KEY) || ''; } catch { return ''; }
};
const loadSnapshot = () => {
  try {
    const value = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
    return value?.owner && value.owner === ownerId() ? value : null;
  } catch { return null; }
};
const rememberSnapshot = (broadcastId, progress) => {
  try {
    const owner = ownerId();
    if (!owner || !broadcastId || !progress) return;
    // Last confirmed SERVER state only. Never persist raw audio, secrets or
    // a client-invented completion percentage.
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      owner, broadcastId, progress, checkedAt: Date.now(),
    }));
  } catch { /* Storage is best effort; MongoDB remains authoritative. */ }
};

export default function ServerRecordingProgress({ liveBroadcastId = '', hideSaved = false }) {
  const [broadcastId, setBroadcastId] = useState(() => loadSnapshot()?.broadcastId || loadBroadcastId());
  const [progress, setProgress] = useState(() => loadSnapshot()?.progress || null);
  const [lastCheckedAt, setLastCheckedAt] = useState(() => loadSnapshot()?.checkedAt || 0);
  const [connected, setConnected] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [unavailable, setUnavailable] = useState(false);
  const [recoveryParts, setRecoveryParts] = useState([]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(-1);
  const [recoveryError, setRecoveryError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  const switchBroadcast = useCallback((id) => {
    const next = String(id || '');
    if (!/^[a-f0-9]{24}$/i.test(next)) return;
    setBroadcastId(previous => previous === next ? previous : next);
    setProgress(previous => previous?.broadcastId === next ? previous : null);
    setRecoveryParts([]);
    setRecoveryOpen(false);
    setRetryError('');
    try { localStorage.setItem(LAST_RECORDING_KEY, next); } catch { /* optional */ }
  }, []);

  useEffect(() => {
    if (liveBroadcastId) switchBroadcast(liveBroadcastId);
    const onTracked = (event) => switchBroadcast(event?.detail?.broadcastId);
    window.addEventListener('echoo:recording-track-broadcast', onTracked);
    return () => window.removeEventListener('echoo:recording-track-broadcast', onTracked);
  }, [liveBroadcastId, switchBroadcast]);

  const refresh = useCallback(async () => {
    if (!broadcastId) return;
    try {
      const response = await batch3Service.getServerRecordingProgress(broadcastId);
      const result = response?.data || null;
      if (result?.broadcastId !== broadcastId) return;
      setProgress(result);
      setUnavailable(false);
      setConnected(true);
      setLastCheckedAt(Date.now());
      rememberSnapshot(broadcastId, result);
    } catch (error) {
      if ([401, 403, 404].includes(Number(error?.status))) {
        setUnavailable(true);
        return;
      }
      setConnected(false);
      // Network problems must not reset the last confirmed recording progress.
    }
  }, [broadcastId]);

  useEffect(() => {
    if (!broadcastId) return undefined;
    let active = true;
    const check = () => { if (active) void refresh(); };
    check();
    const timer = window.setInterval(check, 12_000);
    const onOnline = () => { setConnected(true); check(); };
    const onOffline = () => setConnected(false);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [broadcastId, refresh]);

  const retrySave = async () => {
    if (!broadcastId || retrying) return;
    setRetrying(true);
    setRetryError('');
    try {
      // When an OPFS master exists, its resumable chunk uploader checks the
      // server's accepted indices and transmits only the missing pieces.
      const resumed = await retryAutosave(broadcastId);
      if (!resumed) {
        // Otherwise retry the idempotent SERVER reconstruction only.
        await batch3Service.retryRecordingFinalization(broadcastId);
      }
      await refresh();
    } catch (error) {
      setRetryError(error?.message || 'Retry could not start. The saved recording parts remain protected.');
      await refresh();
    } finally { setRetrying(false); }
  };

  const loadRecoveryParts = async () => {
    setRecoveryError('');
    try {
      const result = await batch3Service.getRecordingRecoverySegments(broadcastId);
      setRecoveryParts(result?.data?.segments || []);
      setRecoveryOpen(true);
    } catch {
      setRecoveryError('Could not retrieve protected recording parts. Check your connection and retry.');
    }
  };
  const downloadRecoveryPart = async (index) => {
    setRecoveryBusy(index);
    setRecoveryError('');
    try { await batch3Service.downloadRecordingRecoverySegment(broadcastId, index); }
    catch (error) { setRecoveryError(error?.message || 'This part could not be downloaded.'); }
    finally { setRecoveryBusy(-1); }
  };

  if (!broadcastId || !progress || unavailable || (hideSaved && progress.fullReplaySaved === true)) return null;
  const live = ['live', 'starting'].includes(progress.broadcastStatus);
  const done = progress.fullReplaySaved === true;
  const count = Math.max(0, Number(progress.completedSegments) || 0);
  const protectedSeconds = Math.max(0, Number(progress.protectedSeconds) || 0);
  const bytes = Math.max(0, Number(progress.segmentBytes) || 0);
  const start = Date.parse(progress.startedAt || '');
  const end = live ? Date.now() : Date.parse(progress.endedAt || '');
  const elapsedSeconds = Number.isFinite(start) && Number.isFinite(end) && end > start
    ? (end - start) / 1000 : 0;
  // Distinguish DURABLE BACKUP COVERAGE from FINAL REPLAY SAVE COMPLETION.
  // Never show a fabricated 100% during recording/finalization.
  const coverage = done ? 100 : elapsedSeconds > 0
    ? Math.max(0, Math.min(99, Math.floor(protectedSeconds * 100 / elapsedSeconds))) : 0;
  const finalization = progress.finalization || {};
  const failed = finalization.status === 'failed' ||
    ['failed', 'incomplete'].includes(progress.reconstructionStatus) ||
    progress.replayFileUnavailable === true;
  const pending = !live && !done && !failed;
  const savingPercent = done ? 100 : Math.min(99, Math.max(0, Number(finalization.percent) || 0));
  const title = done ? 'Recording saved to ECHOO'
    : live ? 'Protecting your live recording'
    : failed ? 'Recording needs recovery'
    : 'Saving recording to ECHOO';
  const updated = lastCheckedAt ? new Date(lastCheckedAt).toLocaleTimeString() : '';

  return (
    <section className="ec2-operation-progress" role="status" aria-live="polite"
      data-testid="server-recording-progress" aria-label="Persistent recording save progress">
      <div className="ec2-operation-progress__head">
        <strong>{title}</strong>
        <span>{done ? 'Saved' : !connected ? 'Offline' : live ? 'Live' : pending ? 'Finalizing' : 'Attention'}</span>
      </div>
      <div className="ec2-operation-progress__bar" role="progressbar" aria-label="Protected server backup coverage"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage}>
        <i style={{ width: `${coverage}%` }} />
      </div>
      <small>{done
        ? '100% verified. Your recording is available in ECHOO.'
        : `Server backup coverage: ${coverage}% • ${Math.floor(protectedSeconds / 60)} minutes sealed • ${count} parts • ${(bytes / 1048576).toFixed(1)} MB. This is not the final replay save percentage.`}</small>
      {!live && !done && (
        <>
          <div className="ec2-operation-progress__bar" role="progressbar" aria-label="Final recording save"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={savingPercent}>
            <i style={{ width: `${savingPercent}%` }} />
          </div>
          <small>{failed ? 'Save failed or incomplete. Retry resumes existing verified files and missing recovery chunks.'
            : `Final save: ${finalization.status || 'waiting'} • ${savingPercent}% reported by server. Verifying the finished audio.`}</small>
        </>
      )}
      {!connected && <small role="status">Connection lost. Showing last verified progress{updated ? ` from ${updated}` : ''}. Reconnecting automatically; recordings on the server are not reset.</small>}
      {connected && updated && !done && <small>Last confirmed by ECHOO: {updated}</small>}
      {progress.error && <small role="alert">{progress.error}</small>}
      {progress.replayFileUnavailable && <small role="alert">A previous save is listed, but the recorded audio file cannot be found. Keep your recovery copies.</small>}
      {finalization.error && <small role="alert">{finalization.error}</small>}
      {progress.reconstructionError && <small role="alert">{progress.reconstructionError}</small>}
      {!live && !done && (
        <div className="ec2-operation-progress__actions">
          <button type="button" onClick={retrySave} disabled={retrying || !connected}
            data-testid="retry-server-recording">
            {retrying ? 'Resuming recovery…' : failed ? 'Retry recording save' : 'Retry or resume save'}
          </button>
          <button type="button" onClick={loadRecoveryParts} disabled={!connected}
            aria-expanded={recoveryOpen} data-testid="load-server-recovery-parts">
            {recoveryOpen ? 'Refresh saved audio parts' : 'Recover saved audio parts'}
          </button>
        </div>
      )}
      {retryError && <small role="alert">{retryError}</small>}
      {recoveryOpen && !done && (
        <div style={{ maxHeight: 190, overflowY: 'auto' }}>
          <small>{recoveryParts.length
            ? `${recoveryParts.length} sealed MP3 parts available; your originals remain stored on the server.`
            : 'No sealed server parts were located. Check the local recording recovery copy.'}</small>
          {recoveryParts.map((part) => (
            <div key={part.index}>
              <button type="button" onClick={() => downloadRecoveryPart(part.index)}
                disabled={recoveryBusy >= 0 || !connected}>
                {recoveryBusy === part.index ? 'Downloading…' : `Download MP3 part ${part.index + 1}`}
                {part.bytes ? ` (${(part.bytes / 1048576).toFixed(1)} MB)` : ''}
              </button>
            </div>
          ))}
        </div>
      )}
      {recoveryError && <small role="alert">{recoveryError}</small>}
    </section>
  );
}
