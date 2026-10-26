import { useEffect, useState } from 'react';
import batch3Service from '../../services/batch3Service';

const LAST_RECORDING_KEY = 'echoo:last-protected-broadcast:v1';
const storedBroadcast = () => {
  try { return localStorage.getItem(LAST_RECORDING_KEY) || ''; } catch { return ''; }
};

// Server-derived status only. Local storage remembers just the last broadcast
// identifier, not a success percentage or a recording file.
export default function ServerRecordingProgress({ liveBroadcastId = '' }) {
  const [broadcastId, setBroadcastId] = useState(storedBroadcast);
  const [progress, setProgress] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!liveBroadcastId || broadcastId === liveBroadcastId) return;
    setBroadcastId(liveBroadcastId);
    setProgress(null);
    try { localStorage.setItem(LAST_RECORDING_KEY, liveBroadcastId); } catch { /* no-op */ }
  }, [liveBroadcastId, broadcastId]);

  useEffect(() => {
    if (!broadcastId) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const response = await batch3Service.getServerRecordingProgress(broadcastId);
        if (!active) return;
        setProgress(response?.data || null);
        setUnavailable(false);
      } catch (error) {
        if (!active) return;
        if ([401, 403, 404].includes(Number(error?.status))) {
          // Hide private progress when access is denied. Do NOT delete the
          // broadcast ID: an expired token/sign-out followed by re-login must
          // restore its server-verified checkpoints instead of losing the card.
          setProgress(null);
          setUnavailable(true);
        }
        // Network failure must not erase the last confirmed progress.
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 12_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [broadcastId]);

  if (!progress || unavailable) return null;
  const count = Math.max(0, Number(progress.completedSegments) || 0);
  const duration = Math.floor((Number(progress.protectedSeconds) || 0) / 60);
  const bytes = Math.max(0, Number(progress.segmentBytes) || 0);
  const fullReplaySaved = progress.fullReplaySaved === true;
  const live = ['live', 'starting'].includes(progress.broadcastStatus);
  const segmentsActive = progress.segmentStatus === 'recording';
  const lastUpdate = progress.updatedAt ? new Date(progress.updatedAt).toLocaleTimeString() : '';
  const startTime = Date.parse(progress.startedAt || '');
  const endTime = live ? Date.now() : Date.parse(progress.endedAt || '');
  const elapsedSeconds = Number.isFinite(startTime) && Number.isFinite(endTime)
    ? Math.max(1, (endTime - startTime) / 1000)
    : 0;
  const coverage = fullReplaySaved
    ? 100
    : elapsedSeconds > 0 ? Math.max(0, Math.min(99, Math.round(
        (Number(progress.protectedSeconds) || 0) * 100 / elapsedSeconds
      ))) : 0;
  const headline = fullReplaySaved
    ? 'Recording saved to ECHOO'
    : progress.segmentStatus === 'degraded'
      ? 'Server segment backup needs attention'
      : count
        ? `${count} server recording ${count === 1 ? 'segment' : 'segments'} protected`
        : segmentsActive ? 'Preparing the first server recording segment' : '';
  if (!headline) return null;

  return (
    <section className="ec2-operation-progress" role="status" aria-live="polite" data-testid="server-recording-progress">
      <div className="ec2-operation-progress__head">
        <strong>{headline}</strong>
        <span>{duration > 0 ? `${duration} min` : live ? 'Live' : 'Off air'}</span>
      </div>
      {count > 0 && (
        <>
          <div className="ec2-operation-progress__bar" aria-hidden="true">
            <i style={{ width: `${coverage}%` }} />
          </div>
          <small>{fullReplaySaved
            ? '100% verified and saved'
            : `Approximately ${coverage}% of elapsed audio is in completed server parts; this is not the final replay verification.`}</small>
        </>
      )}
      <small>
        {fullReplaySaved
          ? 'The complete recording is verified and available in ECHOO.'
          : progress.segmentStatus === 'degraded'
            ? count > 0
              ? `${count} earlier parts are still present. ${progress.error || 'The server recording backup needs attention.'}`
              : progress.error || 'No server backup parts could be verified. Check browser recovery and server storage.'
            : `${bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB secured. ` : ''}Server backups are saved as the broadcast continues.${lastUpdate ? ` Last update ${lastUpdate}.` : ''} Refreshing this page will reload progress from the server.`}
      </small>
    </section>
  );
}
