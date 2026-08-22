import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBookmark,
  FaCheckCircle,
  FaDownload,
  FaEdit,
  FaEllipsisH,
  FaEye,
  FaEyeSlash,
  FaPlay,
  FaSearch,
  FaStar,
  FaThumbtack,
  FaTimes,
} from 'react-icons/fa';

import realtimeService from '../../services/realtimeService';
import transcriptService, { normalizeSegment } from '../../services/transcriptService';

const sameId = (first, second) => Boolean(first && second && String(first) === String(second));
const formatTime = (milliseconds) => {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
};

const downloadText = (filename, content) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const mergeSegment = (items, value) => {
  const segment = normalizeSegment(value);
  if (!segment?.id) return items;
  const index = items.findIndex((item) => sameId(item.id, segment.id));
  if (index < 0) return [...items, segment].sort((a, b) => a.startMs - b.startMs);
  const next = [...items];
  next[index] = { ...next[index], ...segment };
  return next;
};

const mergeMoment = (items, value) => {
  const id = value?.id || value?._id;
  if (!id) return items;
  const index = items.findIndex((item) => sameId(item.id || item._id, id));
  if (index < 0) return [...items, value];
  const next = [...items];
  next[index] = { ...next[index], ...value };
  return next;
};

const CreatorTranscriptControl = ({ broadcastId, transcriptState = 'connecting', whisperHealth = {} }) => {
  const [segments, setSegments] = useState([]);
  const [moments, setMoments] = useState([]);
  const [settings, setSettings] = useState({ showToListeners: true, language: 'en', autoPublishCorrections: true, delayMs: 0 });
  const [query, setQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [editingId, setEditingId] = useState('');
  const [editText, setEditText] = useState('');
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef(null);

  const load = useCallback(async () => {
    if (!broadcastId) return;
    try {
      const [transcript, saved] = await Promise.all([
        transcriptService.getBroadcast(broadcastId, { limit: 200 }),
        transcriptService.getMoments(broadcastId),
      ]);
      setSegments(transcript.data || []);
      setMoments(Array.isArray(saved?.data) ? saved.data : []);
      if (transcript.captionSettings) setSettings((current) => ({ ...current, ...transcript.captionSettings }));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load transcript controls.');
    }
  }, [broadcastId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!broadcastId) return undefined;
    let active = true;
    let socket = null;
    realtimeService.joinBroadcast(broadcastId).then((connectedSocket) => {
      if (!active) return;
      socket = connectedSocket;
      const onSegment = (payload) => setSegments((current) => mergeSegment(current, payload));
      const onSettings = (payload) => {
        if (sameId(payload?.broadcastId, broadcastId)) setSettings((current) => ({ ...current, ...payload }));
      };
      const onMoment = (payload) => {
        if (sameId(payload?.broadcastId, broadcastId) && payload.moment) setMoments((current) => mergeMoment(current, payload.moment));
      };
      connectedSocket.on('transcript:segment', onSegment);
      connectedSocket.on('transcript:moderated', onSegment);
      connectedSocket.on('transcript:settings', onSettings);
      connectedSocket.on('transcript:momentSaved', onMoment);
      socket.__echooCreatorTranscriptCleanup = () => {
        connectedSocket.off('transcript:segment', onSegment);
        connectedSocket.off('transcript:moderated', onSegment);
        connectedSocket.off('transcript:settings', onSettings);
        connectedSocket.off('transcript:momentSaved', onMoment);
      };
    }).catch(() => {});
    return () => {
      active = false;
      socket?.__echooCreatorTranscriptCleanup?.();
      realtimeService.leaveBroadcast(broadcastId).catch(() => {});
    };
  }, [broadcastId]);

  useEffect(() => {
    if (!autoScroll || query || !listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [autoScroll, query, segments]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? segments.filter((segment) => `${segment.speaker} ${segment.text}`.toLowerCase().includes(needle))
      : segments;
  }, [query, segments]);

  const finalSegments = useMemo(() => segments.filter((segment) => segment.isFinal), [segments]);
  const metrics = useMemo(() => {
    const confidences = finalSegments.map((segment) => Number(segment.confidence)).filter(Number.isFinite);
    const accuracy = confidences.length ? Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100) : null;
    const words = finalSegments.reduce((total, segment) => total + String(segment.text || '').split(/\s+/).filter(Boolean).length, 0);
    const durationMinutes = Math.max(1 / 60, ((finalSegments.at(-1)?.endMs || 0) - (finalSegments[0]?.startMs || 0)) / 60000);
    return { accuracy, words, wordsPerMinute: Math.round(words / durationMinutes) };
  }, [finalSegments]);

  const action = async (segment, name, values = {}) => {
    try {
      setWorkingId(`${name}:${segment.id}`);
      setError('');
      const response = await transcriptService.moderateSegment(segment.id, name, values);
      if (response.data) setSegments((current) => mergeSegment(current, response.data));
      if (name === 'edit') setEditingId('');
    } catch (actionError) {
      setError(actionError?.message || 'Could not update this transcript line.');
    } finally {
      setWorkingId('');
    }
  };

  const saveMoment = async (segment) => {
    try {
      setWorkingId(`moment:${segment.id}`);
      const response = await transcriptService.saveMoment(broadcastId, { segmentId: segment.id, label: segment.text.slice(0, 80) });
      if (response?.data) setMoments((current) => mergeMoment(current, response.data));
    } catch (momentError) {
      setError(momentError?.message || 'Could not save this moment.');
    } finally {
      setWorkingId('');
    }
  };

  const removeMoment = async (moment) => {
    const id = moment.id || moment._id;
    try {
      await transcriptService.deleteMoment(broadcastId, id);
      setMoments((current) => current.filter((item) => !sameId(item.id || item._id, id)));
    } catch (momentError) {
      setError(momentError?.message || 'Could not remove this saved moment.');
    }
  };

  const changeSettings = async (update) => {
    const next = { ...settings, ...update };
    setSettings(next);
    try {
      const response = await transcriptService.updateSettings(broadcastId, next);
      if (response?.data) setSettings(response.data);
    } catch (settingsError) {
      setError(settingsError?.message || 'Could not update caption settings.');
    }
  };

  const exportTranscript = () => downloadText(
    `echoo-transcript-${broadcastId}.txt`,
    finalSegments.map((segment) => `${formatTime(segment.startMs)}  ${segment.speaker}\n${segment.text}`).join('\n\n')
  );

  return (
    <div className="ecbs-transcript-layout">
      <div className="ecbs-transcript-main">
        <section className="ecbs-transcript-card">
          <header className="ecbs-panel-title"><div><h2>Live Transcript Control</h2><p>Manage captions in real time. Moderate, correct, and highlight key moments.</p></div><span className={transcriptState === 'connected' ? 'connected' : ''}><i /> {transcriptState === 'connected' ? 'Transcription connected' : transcriptState}</span></header>
          <div className="ecbs-transcript-tools"><label><FaSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search in transcript..." /></label><label className="ecbs-auto-scroll"><input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} /> Auto-scroll</label><button type="button" onClick={exportTranscript}><FaDownload /> Export</button></div>
          {error && <p className="ecbs-inline-error" role="alert">{error}</p>}
          <div className="ecbs-transcript-list" ref={listRef}>
            {visible.map((segment) => (
              <article className={`${segment.isHighlighted ? 'highlighted' : ''} ${segment.isHidden ? 'hidden' : ''}`} key={segment.id}>
                <time>{formatTime(segment.startMs)}</time><i className="ecbs-speaker-dot" /><strong>{segment.speaker || 'Creator'}</strong>
                {editingId === segment.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); action(segment, 'edit', { text: editText }); }}><textarea value={editText} onChange={(event) => setEditText(event.target.value)} /><button type="submit"><FaCheckCircle /> Save</button><button type="button" onClick={() => setEditingId('')}><FaTimes /></button></form>
                ) : <p>{segment.text}<small>{segment.isFinal ? 'FINAL' : 'LIVE'}</small></p>}
                <div className="ecbs-line-actions">
                  <button type="button" className={segment.isHighlighted ? 'active gold' : ''} title="Highlight" onClick={() => action(segment, 'highlight')} disabled={Boolean(workingId)}><FaStar /></button>
                  <button type="button" className={segment.isPinned ? 'active' : ''} title="Pin" onClick={() => action(segment, 'pin')} disabled={Boolean(workingId)}><FaThumbtack /></button>
                  <button type="button" title="Edit" onClick={() => { setEditingId(segment.id); setEditText(segment.text); }}><FaEdit /></button>
                  <button type="button" className={segment.isHidden ? 'active' : ''} title={segment.isHidden ? 'Show to listeners' : 'Hide from listeners'} onClick={() => action(segment, 'hide')} disabled={Boolean(workingId)}>{segment.isHidden ? <FaEyeSlash /> : <FaEye />}</button>
                  <button type="button" title="Save moment" onClick={() => saveMoment(segment)} disabled={Boolean(workingId)}><FaBookmark /></button>
                  <button type="button" title="Download line" onClick={() => downloadText(`echoo-${formatTime(segment.startMs).replaceAll(':', '-')}.txt`, segment.text)}><FaDownload /></button>
                  <button type="button" title="More options"><FaEllipsisH /></button>
                </div>
              </article>
            ))}
            {!visible.length && <div className="ecbs-transcript-empty">{query ? 'No transcript lines match this search.' : 'Transcript lines will appear when you begin speaking.'}</div>}
          </div>
          <footer><span><FaStar /> Highlighted</span><span><FaThumbtack /> Pinned</span><span><FaEdit /> Corrected</span><span><FaEyeSlash /> Hidden from listeners</span><span><FaCheckCircle /> Final</span></footer>
        </section>

        <section className="ecbs-transcript-health">
          <header><h2>Transcript &amp; Stream Health</h2><p>Real-time system and quality metrics.</p></header>
          <div><article><span>Caption accuracy</span><strong>{metrics.accuracy == null ? 'Collecting' : `${metrics.accuracy}%`}</strong></article><article><span>Words per minute</span><strong>{metrics.words ? metrics.wordsPerMinute : 'Collecting'}</strong></article><article><span>Dropped frames</span><strong>{Number(whisperHealth.droppedFrames) || 0}</strong></article><article><span>Connection quality</span><strong>{transcriptState === 'connected' ? 'Excellent' : 'Reconnecting'}</strong></article><article><span>Buffered frames</span><strong>{Number(whisperHealth.bufferedFrames) || 0}</strong></article></div>
        </section>
      </div>

      <aside className="ecbs-transcript-side">
        <section className="ecbs-caption-settings"><header><h2>Caption Settings</h2><p>Control how captions appear to your listeners.</p></header><label><span><strong>Show captions to listeners</strong><small>Make live captions visible on listener apps.</small></span><button type="button" className={settings.showToListeners ? 'on' : ''} onClick={() => changeSettings({ showToListeners: !settings.showToListeners })}><i /></button></label><label><span><strong>Language</strong></span><select value={settings.language} onChange={(event) => changeSettings({ language: event.target.value })}><option value="en">English</option><option value="yo">Yoruba</option><option value="ha">Hausa</option><option value="pcm">Nigerian Pidgin</option></select></label><label><span><strong>Caption delay / sync</strong></span><select value={settings.delayMs} onChange={(event) => changeSettings({ delayMs: Number(event.target.value) })}><option value="0">No delay</option><option value="1000">1 second</option><option value="2000">2 seconds</option><option value="3000">3 seconds</option></select></label><label><span><strong>Auto-publish corrected text</strong><small>Apply corrections instantly to listeners.</small></span><button type="button" className={settings.autoPublishCorrections ? 'on' : ''} onClick={() => changeSettings({ autoPublishCorrections: !settings.autoPublishCorrections })}><i /></button></label></section>
        <section className="ecbs-saved-moments"><header><h2>Saved Moments ({moments.length})</h2></header>{moments.slice(-6).reverse().map((moment) => <article key={moment.id || moment._id}><time>{formatTime(moment.startMs)}</time><span title={moment.text}>{moment.label}</span><button type="button" title="Play from this point"><FaPlay /></button><button type="button" title="Remove moment" onClick={() => removeMoment(moment)}><FaTimes /></button></article>)}{!moments.length && <p>Highlight or save a transcript line to keep an important moment.</p>}</section>
      </aside>
    </div>
  );
};

export default CreatorTranscriptControl;
