import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCheck, FaClock, FaExclamationTriangle, FaPen, FaSave, FaSyncAlt } from 'react-icons/fa';
import batch3Service from '../../services/batch3Service';
import transcriptService from '../../services/transcriptService';
import realtimeService from '../../services/realtimeService';

const labels = {
  pending: 'Waiting',
  processing: 'Processing',
  ready: 'Ready',
  ready_for_review: 'Ready for review',
  editing: 'Editing',
  published: 'Published',
  failed: 'Needs attention',
  disabled: 'Disabled',
};

const StatusIcon = ({ status }) => status === 'ready' || status === 'ready_for_review' || status === 'published'
  ? <FaCheck />
  : status === 'failed' ? <FaExclamationTriangle /> : <FaClock />;

const transcriptJobLabel = (jobType) => ({
  transcript_completion: 'Preparing the transcript draft',
  transcript_improvement: 'Checking and preparing the draft',
  transcript_quality_chunk: 'Processing the final audio',
}[jobType] || 'Preparing transcript assets');

const activityTime = (value) => {
  if (!value) return 'Waiting for an update';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waiting for an update';
  return `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

const CreatorBroadcastProcessing = ({ broadcast: initialBroadcast, onStartAnother }) => {
  const [processing, setProcessing] = useState({ broadcast: initialBroadcast, jobs: [] });
  const [segments, setSegments] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [audioVisibility, setAudioVisibility] = useState('public');
  const [transcriptVisibility, setTranscriptVisibility] = useState('public');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [realtimeState, setRealtimeState] = useState('connecting');
  const broadcastId = initialBroadcast?.id || initialBroadcast?._id;
  const broadcast = processing.broadcast || initialBroadcast || {};
  const status = broadcast.assetStatus || {};

  const refresh = useCallback(async () => {
    if (!broadcastId) return;
    try {
      const response = await batch3Service.getProcessing(broadcastId);
      if (response?.data) {
        setProcessing(response.data);
        setAudioVisibility(response.data.broadcast?.assetVisibility?.audio || 'public');
        setTranscriptVisibility(response.data.broadcast?.assetVisibility?.transcript || 'public');
      }
      setError('');
    } catch (refreshError) {
      setError(refreshError?.message || 'Could not refresh processing status.');
    }
  }, [broadcastId]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!broadcastId) return undefined;
    let active = true;
    let socket = null;

    realtimeService.joinBroadcast(broadcastId).then((connectedSocket) => {
      if (!active) return;
      socket = connectedSocket;
      setRealtimeState('live');
      const onProcessing = (payload) => {
        if (String(payload?.broadcastId) !== String(broadcastId)) return;
        setProcessing((current) => ({
          ...current,
          broadcast: {
            ...(current.broadcast || initialBroadcast),
            assetStatus: payload.assetStatus || current.broadcast?.assetStatus,
            assetVisibility: payload.assetVisibility || current.broadcast?.assetVisibility,
            replayAudio: payload.replayAudioId ?? current.broadcast?.replayAudio,
          },
          jobs: Array.isArray(payload.jobs) ? payload.jobs : current.jobs,
        }));
      };
      const onTranscriptStatus = (payload) => {
        if (String(payload?.broadcastId) !== String(broadcastId)) return;
        setProcessing((current) => ({
          ...current,
          broadcast: {
            ...(current.broadcast || initialBroadcast),
            transcriptState: payload.state || current.broadcast?.transcriptState,
          },
        }));
      };
      connectedSocket.on('broadcast:processing', onProcessing);
      connectedSocket.on('transcript:status', onTranscriptStatus);
      socket.__echooProcessingMonitorCleanup = () => {
        connectedSocket.off('broadcast:processing', onProcessing);
        connectedSocket.off('transcript:status', onTranscriptStatus);
      };
    }).catch(() => {
      if (active) setRealtimeState('polling');
    });

    return () => {
      active = false;
      socket?.__echooProcessingMonitorCleanup?.();
      realtimeService.leaveBroadcast(broadcastId).catch(() => {});
    };
  }, [broadcastId, initialBroadcast]);

  const transcriptReady = ['ready_for_review', 'editing', 'published'].includes(status.transcript);
  useEffect(() => {
    if (!transcriptReady || !broadcastId) return;
    transcriptService.getBroadcast(broadcastId, { final: true, limit: 200 })
      .then((response) => setSegments((response?.data || []).filter((segment) => !segment.isHidden)))
      .catch((loadError) => setError(loadError?.message || 'Could not load the transcript draft.'));
  }, [broadcastId, transcriptReady]);

  const allDone = useMemo(() => (
    status.audio === 'ready' &&
    ['ready_for_review', 'editing', 'published', 'disabled', 'failed'].includes(status.transcript) &&
    !processing.jobs?.some((job) => ['queued', 'processing'].includes(job.status))
  ), [processing.jobs, status.audio, status.transcript]);

  const transcriptJobs = useMemo(
    () => (processing.jobs || []).filter((job) => String(job?.jobType || '').startsWith('transcript_')),
    [processing.jobs]
  );
  const activeTranscriptJob = transcriptJobs.find((job) => ['processing', 'queued'].includes(job.status));
  const failedTranscriptJob = transcriptJobs.find((job) => job.status === 'failed');
  const transcriptProgress = transcriptJobs.length
    ? Math.round(transcriptJobs.reduce((total, job) => total + Math.max(0, Math.min(100, Number(job.progress) || 0)), 0) / transcriptJobs.length)
    : status.transcript === 'ready_for_review' || status.transcript === 'editing' || status.transcript === 'published'
      ? 100
      : 0;
  const transcriptActivity = failedTranscriptJob
    ? failedTranscriptJob.error || 'Transcript processing needs attention.'
    : activeTranscriptJob
      ? transcriptJobLabel(activeTranscriptJob.jobType)
      : status.transcript === 'ready_for_review'
        ? 'Your transcript draft is ready to review.'
        : status.transcript === 'editing'
          ? 'Your transcript is open for edits.'
          : status.transcript === 'published'
            ? 'Your transcript is published.'
            : 'Waiting for the final recording to be available.';
  const transcriptLastUpdated = [...transcriptJobs]
    .map((job) => job.completedAt || job.startedAt || job.updatedAt || job.createdAt)
    .filter(Boolean)
    .sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0];
  const transcriptSteps = [
    ['recording', 'Final recording', status.audio === 'ready' ? 'complete' : status.audio === 'failed' ? 'failed' : 'active'],
    ['draft', 'Transcript draft', failedTranscriptJob ? 'failed' : transcriptJobs.some((job) => job.jobType === 'transcript_completion' && job.status === 'completed') ? 'complete' : activeTranscriptJob?.jobType === 'transcript_completion' ? 'active' : 'pending'],
    ['review', 'Quality check', failedTranscriptJob ? 'failed' : ['ready_for_review', 'editing', 'published'].includes(status.transcript) ? 'complete' : activeTranscriptJob?.jobType === 'transcript_improvement' ? 'active' : 'pending'],
    ['ready', 'Ready to review', status.transcript === 'failed' ? 'failed' : ['ready_for_review', 'editing', 'published'].includes(status.transcript) ? 'complete' : 'pending'],
  ];

  const updateVisibility = async () => {
    try {
      setBusy('visibility');
      await batch3Service.updateAssetVisibility(broadcastId, { audio: audioVisibility, transcript: transcriptVisibility });
      setNotice('Visibility saved.');
      await refresh();
    } catch (actionError) { setError(actionError?.message || 'Could not save visibility.'); }
    finally { setBusy(''); }
  };

  const publishReplay = async () => {
    try {
      setBusy('audio');
      await batch3Service.publishReplay(broadcastId, audioVisibility);
      setNotice('Replay published.');
      await refresh();
    } catch (actionError) { setError(actionError?.message || 'Could not publish the replay.'); }
    finally { setBusy(''); }
  };

  const startReview = async () => {
    try {
      setBusy('review');
      await batch3Service.beginTranscriptReview(broadcastId);
      await refresh();
    } catch (actionError) { setError(actionError?.message || 'Could not open transcript review.'); }
    finally { setBusy(''); }
  };

  const saveSegment = async (segment) => {
    const text = String(drafts[segment.id] ?? segment.text).trim();
    if (!text) return;
    try {
      setBusy(segment.id);
      const response = await transcriptService.moderateSegment(segment.id, 'edit', { text, speaker: segment.speaker });
      setSegments((current) => current.map((item) => item.id === segment.id ? response.data : item));
      setNotice('Correction saved.');
    } catch (actionError) { setError(actionError?.message || 'Could not save that correction.'); }
    finally { setBusy(''); }
  };

  const publishTranscript = async () => {
    try {
      setBusy('transcript');
      await batch3Service.publishTranscript(broadcastId, transcriptVisibility);
      setNotice('Transcript published with the replay.');
      await refresh();
    } catch (actionError) { setError(actionError?.message || 'Could not publish the transcript.'); }
    finally { setBusy(''); }
  };

  return (
    <section className="ecbs-processing-page">
      <header>
        <span>BROADCAST ENDED</span>
        <h1>Your session has ended successfully.</h1>
        <p>Echoo is preparing the audience mix and polishing the replay assets in the background.</p>
      </header>
      {(notice || error) && <div className={`ebsx-message ${error ? 'error' : 'success'}`} role="status">{error || notice}</div>}

      <section className="ecbs-processing-status" aria-label="Processing status">
        {[
          ['audio', 'Audio recording'],
          ['transcript', 'Transcript'],
          ['highlights', 'Important moments'],
          ['chapters', 'Replay chapters'],
        ].map(([key, title]) => <article key={key} className={status[key] || 'pending'}><StatusIcon status={status[key]} /><div><strong>{title}</strong><span>{labels[status[key]] || 'Waiting'}</span></div></article>)}
      </section>

      <p className="ecbs-processing-note">{status.audio === 'ready' ? 'Your recording is safely stored. You can close this page; processing will continue.' : 'Keep this page open while the browser finishes saving the final recording. Transcript processing continues on the backend.'}</p>

      <section className={`ecbs-transcript-monitor ${status.transcript === 'failed' ? 'has-error' : ''}`} aria-labelledby="transcript-monitor-title" aria-live="polite">
        <header>
          <div>
            <span>LIVE PROCESSING MONITOR</span>
            <h2 id="transcript-monitor-title">Transcript progress</h2>
            <p>{transcriptActivity}</p>
          </div>
          <div className="ecbs-transcript-monitor__meta">
            <span className={`ecbs-transcript-monitor__connection ${realtimeState}`}>{realtimeState === 'live' ? 'Live updates' : realtimeState === 'polling' ? 'Checking every 3s' : 'Connecting'}</span>
            <button type="button" onClick={refresh} disabled={busy === 'refresh'} aria-label="Refresh transcript processing status"><FaSyncAlt /> Refresh</button>
          </div>
        </header>
        <div className="ecbs-transcript-monitor__progress" role="progressbar" aria-label="Transcript processing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={transcriptProgress}>
          <span style={{ width: `${transcriptProgress}%` }} />
        </div>
        <div className="ecbs-transcript-monitor__summary"><strong>{transcriptProgress}% complete</strong><span>{activityTime(transcriptLastUpdated)}</span></div>
        <ol className="ecbs-transcript-monitor__steps">
          {transcriptSteps.map(([id, label, state]) => <li key={id} className={state}><i>{state === 'complete' ? <FaCheck /> : state === 'failed' ? <FaExclamationTriangle /> : <FaClock />}</i><span>{label}</span></li>)}
        </ol>
        {failedTranscriptJob && <div className="ecbs-transcript-monitor__error"><FaExclamationTriangle /><div><strong>Processing stopped</strong><p>{failedTranscriptJob.error || 'The transcript worker reported an error. Keep this panel open or refresh after resolving the worker issue.'}</p></div></div>}
      </section>

      <section className="ecbs-publish-panel">
        <div><h2>Your replay</h2><p>Audio can be published before the transcript is finished.</p></div>
        <label>Audio visibility<select value={audioVisibility} onChange={(event) => setAudioVisibility(event.target.value)}><option value="public">Public</option><option value="followers">Followers only</option><option value="private">Private</option></select></label>
        <label>Transcript visibility<select value={transcriptVisibility} onChange={(event) => setTranscriptVisibility(event.target.value)}><option value="public">Public</option><option value="followers">Followers only</option><option value="private">Private</option></select></label>
        <button type="button" onClick={updateVisibility} disabled={Boolean(busy)}><FaSave /> Save visibility</button>
        <button type="button" className="primary" onClick={publishReplay} disabled={status.audio !== 'ready' || Boolean(busy)}>Publish replay now</button>
      </section>

      {transcriptReady && <section className="ecbs-transcript-review">
        <header><div><h2>Transcript review</h2><p>Correct the generated draft, then publish it when it is ready.</p></div>{status.transcript === 'ready_for_review' && <button type="button" onClick={startReview} disabled={Boolean(busy)}><FaPen /> Start editing</button>}</header>
        <div className="ecbs-transcript-review__rows">
          {segments.map((segment) => <article key={segment.id}>
            <time>{new Date(Math.max(0, segment.startMs || 0)).toISOString().slice(11, 19)}</time>
            <strong>{segment.speaker || 'Speaker'}</strong>
            <textarea value={drafts[segment.id] ?? segment.text} onChange={(event) => setDrafts((current) => ({ ...current, [segment.id]: event.target.value }))} disabled={status.transcript === 'published'} />
            <button type="button" aria-label="Save correction" onClick={() => saveSegment(segment)} disabled={status.transcript === 'published' || busy === segment.id}><FaSave /></button>
            <details><summary>Original generated version</summary><p>{segment.originalText || segment.text}</p></details>
          </article>)}
        </div>
        <button type="button" className="primary" onClick={publishTranscript} disabled={status.transcript === 'published' || !broadcast.replayAudio || Boolean(busy)}>Publish transcript</button>
      </section>}

      <footer><span>{allDone ? 'All processing is complete.' : 'We will notify you when the transcript is ready.'}</span><button type="button" onClick={onStartAnother}>Prepare another broadcast</button></footer>
    </section>
  );
};

export default CreatorBroadcastProcessing;
