import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCheck, FaClock, FaExclamationTriangle, FaPen, FaSave } from 'react-icons/fa';
import batch3Service from '../../services/batch3Service';
import transcriptService from '../../services/transcriptService';

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

const CreatorBroadcastProcessing = ({ broadcast: initialBroadcast, onStartAnother }) => {
  const [processing, setProcessing] = useState({ broadcast: initialBroadcast, jobs: [] });
  const [segments, setSegments] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [audioVisibility, setAudioVisibility] = useState('public');
  const [transcriptVisibility, setTranscriptVisibility] = useState('public');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
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