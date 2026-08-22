import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiDownload, FiMoreVertical, FiPause, FiPlay, FiShare2, FiUsers } from 'react-icons/fi';

import audioService from '../../services/audioService';
import downloadService from '../../services/downloadService';
import followService from '../../services/followService';
import savedMomentService from '../../services/savedMomentService';
import transcriptService from '../../services/transcriptService';
import { ChapterList, EchooButton, KeyMomentCard, Tabs, TranscriptPanel, Waveform } from '../../design-system';
import { referenceChapters, referenceMoments, referenceReplay, referenceTranscript } from '../ListenerExperience/listenerExperienceData';
import './ListenerAudioDetail.css';

const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
};
const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const ListenerAudioDetail = () => {
  const { audioId } = useParams();
  const navigate = useNavigate();
  const player = useOutletContext();
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'reference';
  const [track, setTrack] = useState(previewMode ? referenceReplay : null);
  const [loading, setLoading] = useState(!previewMode);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedMomentIds, setSavedMomentIds] = useState(() => new Set());
  const [following, setFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [transcript, setTranscript] = useState(previewMode ? referenceTranscript : []);
  const [transcriptLoading, setTranscriptLoading] = useState(!previewMode);
  const transcriptSearchSequence = useRef(0);
  const initialSeekApplied = useRef(false);

  const mapTranscript = useCallback((segments = []) => segments.map((segment) => ({
    ...segment,
    id: segment.id || segment.providerSegmentId,
    seconds: (Number(segment.startMs) || 0) / 1000,
    time: formatTime((Number(segment.startMs) || 0) / 1000),
    state: segment.isFinal ? 'final' : 'partial',
  })), []);

  const load = useCallback(async () => {
    if (!audioId || previewMode) return;
    try {
      setLoading(true);
      const [response, transcriptResponse] = await Promise.all([
        audioService.getById(audioId),
        transcriptService.getAudio(audioId, { final: true }).catch(() => ({ data: [] })),
      ]);
      const next = response?.data || response;
      if (!next?.id) throw new Error('This replay could not be found.');
      setTrack(next);
      setTranscript(mapTranscript(transcriptResponse?.data || []));
      setTranscriptLoading(false);
      const momentResponse = await savedMomentService.list({ limit: 100 }).catch(() => ({ data: [] }));
      setSavedMomentIds(new Set((momentResponse?.data || []).filter((moment) => String(moment.audioId) === String(next.id)).map((moment) => `${Math.round(moment.timestampMs / 1000)}`)));
      const artistId = typeof next.artist === 'object'
        ? next.artist?.id || next.artist?._id
        : next.artist;
      if (artistId) {
        followService.getCreatorStatus(artistId)
          .then((status) => setFollowing(Boolean(status?.isFollowing)))
          .catch(() => {});
      }
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'This replay is unavailable.');
    } finally { setLoading(false); setTranscriptLoading(false); }
  }, [audioId, mapTranscript, previewMode]);

  const searchTranscript = useCallback(async (search) => {
    if (previewMode || !audioId) return;
    const sequence = transcriptSearchSequence.current + 1;
    transcriptSearchSequence.current = sequence;
    setTranscriptLoading(true);
    try {
      const response = await transcriptService.getAudio(audioId, { search, final: true, limit: 100 });
      if (transcriptSearchSequence.current === sequence) {
        setTranscript(mapTranscript(response?.data || []));
        setError('');
      }
    } catch (searchError) {
      if (transcriptSearchSequence.current === sequence) setError(searchError?.message || 'Transcript search is unavailable.');
    } finally {
      if (transcriptSearchSequence.current === sequence) setTranscriptLoading(false);
    }
  }, [audioId, mapTranscript, previewMode]);

  useEffect(() => { load(); }, [load]);

  const normalizedTrack = useMemo(() => track ? {
    ...track,
    id: track.id || track._id || audioId,
    title: track.title || 'Untitled Replay',
    artistName: track.artistName || track.creator?.displayName || track.creator || 'Echoo Creator',
    genre: track.genre || track.category || 'Audio',
    coverArt: track.coverArt || track.artwork || '',
    duration: Number(track.duration) || 0,
    fileUrl: track.fileUrl || '',
    sourceBroadcast: track.sourceBroadcast || null,
  } : null, [track, audioId]);

  const chapters = useMemo(() => {
    if (previewMode) return referenceChapters;
    return transcript
      .filter((segment) => segment.isFinal !== false)
      .filter((segment, index) => index === 0 || index % 5 === 0)
      .slice(0, 8)
      .map((segment, index, list) => ({
        id: `chapter-${segment.id}`,
        title: index === 0 ? 'Introduction' : `Discussion ${index + 1}`,
        description: segment.text,
        seconds: segment.seconds,
        time: formatTime(
          Math.max(0, (list[index + 1]?.seconds ?? normalizedTrack?.duration ?? segment.seconds) - segment.seconds)
        ),
      }));
  }, [normalizedTrack?.duration, previewMode, transcript]);

  const moments = useMemo(() => {
    if (previewMode) return referenceMoments;
    return transcript
      .filter((segment) => segment.isFinal !== false && segment.text?.length >= 48)
      .slice(0, 5)
      .map((segment) => ({
        id: `moment-${segment.id}`,
        segmentId: segment.id,
        seconds: segment.seconds,
        time: segment.time,
        quote: segment.text,
      }));
  }, [previewMode, transcript]);
  const transcriptPublished = previewMode || normalizedTrack?.sourceBroadcast?.assetStatus?.transcript === 'published';

  const active = normalizedTrack && String(player.currentTrack?.id || '') === String(normalizedTrack.id);
  const playing = Boolean(active && player.isPlaying);
  const displayDuration = active && player.duration > 0 ? player.duration : normalizedTrack?.duration || 0;
  const displayCurrent = active ? player.currentTime : 0;
  const progress = displayDuration > 0 ? (displayCurrent / displayDuration) * 100 : 0;

  const play = () => {
    if (!normalizedTrack) return;
    if (active) player.togglePlay();
    else player.playTrack(normalizedTrack, [normalizedTrack]);
  };
  const jump = (seconds) => {
    if (!normalizedTrack) return;
    player.playTrackAt(normalizedTrack, seconds, [normalizedTrack]);
  };
  useEffect(() => {
    if (!normalizedTrack || initialSeekApplied.current) return;
    const requested = Number(new URLSearchParams(window.location.search).get('t'));
    if (!Number.isFinite(requested) || requested < 0) return;
    initialSeekApplied.current = true;
    player.playTrackAt(normalizedTrack, requested, [normalizedTrack]);
  }, [normalizedTrack, player]);

  const saveMoment = async (moment) => {
    const key = `${Math.round(moment.seconds)}`;
    if (previewMode || savedMomentIds.has(key)) return;
    try {
      await savedMomentService.create({
        audioId: normalizedTrack.id,
        transcriptSegmentId: moment.segmentId,
        timestampMs: Math.round(moment.seconds * 1000),
        transcriptSnippet: moment.quote,
      });
      setSavedMomentIds((current) => new Set([...current, key]));
      setNotice('Moment saved.');
    } catch (saveError) { setError(saveError?.message || 'Could not save this moment.'); }
  };
  const saveAllMoments = async () => {
    const unsaved = moments.filter((moment) => !savedMomentIds.has(`${Math.round(moment.seconds)}`));
    if (!unsaved.length) return setNotice('All key moments are saved.');
    const results = await Promise.allSettled(unsaved.map(saveMoment));
    if (results.some((result) => result.status === 'fulfilled')) setNotice('Key moments saved.');
  };
  const seekPercent = (percent) => {
    if (!normalizedTrack) return;
    if (!active) player.playTrackAt(normalizedTrack, (percent / 100) * displayDuration, [normalizedTrack]);
    else player.seekTo((percent / 100) * displayDuration);
  };
  const toggleFollow = async () => {
    const artistId = typeof normalizedTrack?.artist === 'object'
      ? normalizedTrack.artist?.id || normalizedTrack.artist?._id
      : normalizedTrack?.artist;
    if (previewMode || !artistId) return setFollowing((value) => !value);
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      if (wasFollowing) await followService.unfollowCreator(artistId);
      else await followService.followCreator(artistId);
    } catch (followError) {
      setFollowing(wasFollowing);
      setError(followError?.message || 'Could not update your follow status.');
    }
  };
  const download = async () => {
    try { await downloadService.download(normalizedTrack); setNotice('Replay downloaded.'); }
    catch { setError('Could not download this replay.'); }
  };
  const share = async () => {
    try { await navigator.clipboard?.writeText(window.location.href); setNotice('Replay link copied.'); }
    catch { setError('Could not copy this replay link.'); }
  };

  if (loading) return <main className="replay-page"><div className="replay-state">Loading replay...</div></main>;
  if (!normalizedTrack) return <main className="replay-page"><button type="button" className="replay-back" onClick={() => navigate('/listen')}><FiArrowLeft /> Back</button><div className="replay-state">{error || 'Replay unavailable.'}</div></main>;

  const tabs = [
    { value: 'overview', label: 'Overview' },
    ...(transcriptPublished ? [{ value: 'transcript', label: 'Transcript' }, { value: 'chapters', label: 'Chapters' }] : []),
    { value: 'about', label: 'About' },
  ];

  return (
    <main className="replay-page">
      <button type="button" className="replay-back" onClick={() => navigate(-1)}><FiArrowLeft /> Back to Replays</button>
      {notice && <div className="replay-notice" role="status">{notice}</div>}
      {error && <div className="replay-error" role="alert">{error}</div>}

      <section className="replay-hero" aria-labelledby="replay-title">
        <div className="replay-art">{normalizedTrack.coverArt && <img src={normalizedTrack.coverArt} alt="" />}<span>{formatTime(normalizedTrack.duration)}</span></div>
        <div className="replay-copy"><h1 id="replay-title">{normalizedTrack.title}</h1><strong>{normalizedTrack.genre}</strong><p>{normalizedTrack.description || 'No description is available for this replay.'}</p><div className="replay-creator"><span>{normalizedTrack.artistName.charAt(0)}</span><span><strong>{normalizedTrack.artistName}</strong><small>@{normalizedTrack.artistName.toLowerCase().replace(/\s+/g, '')}</small></span><FiCheck aria-label="Verified" /><em><FiUsers /> {Number(normalizedTrack.sourceBroadcast?.peakListeners || normalizedTrack.playCount || 0).toLocaleString()} listens</em></div></div>
      </section>

      <div className="replay-actions"><EchooButton icon={playing ? <FiPause /> : <FiPlay />} onClick={play}>{playing ? 'Pause' : 'Play'}</EchooButton><EchooButton variant="secondary" icon={<FiCheck />} onClick={toggleFollow}>{following ? 'Following' : 'Follow'}</EchooButton><EchooButton variant="secondary" icon={<FiShare2 />} onClick={share}>Share</EchooButton><EchooButton variant="secondary" icon={<FiDownload />} onClick={download}>Download</EchooButton><EchooButton variant="ghost" icon={<FiMoreVertical />} aria-label="More replay options" /></div>

      <section className="replay-timeline" aria-label="Replay audio timeline"><Waveform progress={progress} onSeek={seekPercent} /><div><span>{formatTime(displayCurrent)}</span><span>{formatTime(displayDuration)}</span></div></section>
      <Tabs items={tabs} value={activeTab} onChange={setActiveTab} ariaLabel="Replay sections" className="replay-tabs" />

      {activeTab === 'overview' && <div className="replay-overview"><article className="replay-about"><h2>About this replay</h2><p>{normalizedTrack.description || 'No description is available for this replay.'}</p><button type="button" onClick={() => setActiveTab('about')}>Show more</button></article><dl className="replay-facts"><div><dt>Category</dt><dd>{normalizedTrack.genre}</dd></div><div><dt>Duration</dt><dd>{formatTime(normalizedTrack.duration)}</dd></div><div><dt>Language</dt><dd>{transcript[0]?.language || 'Not specified'}</dd></div><div><dt>Recorded</dt><dd>{formatDate(normalizedTrack.sourceBroadcast?.endedAt || normalizedTrack.createdAt)}</dd></div><div><dt>Listeners</dt><dd>{Number(normalizedTrack.sourceBroadcast?.peakListeners || normalizedTrack.playCount || 0).toLocaleString()}</dd></div><div><dt>Type</dt><dd>{normalizedTrack.sourceBroadcast ? 'Live Show' : 'Audio'}</dd></div></dl></div>}
      {transcriptPublished && activeTab === 'transcript' && <TranscriptPanel segments={transcript} loading={transcriptLoading} onJump={jump} onSearch={previewMode ? undefined : searchTranscript} />}
      {transcriptPublished && activeTab === 'chapters' && (chapters.length ? <ChapterList chapters={chapters} onJump={jump} /> : <div className="replay-state">Chapters will appear when transcript moments are available.</div>)}
      {activeTab === 'about' && <article className="replay-about replay-about--wide"><h2>About this replay</h2><p>{normalizedTrack.description || 'No description is available for this replay.'}</p><p>Recorded on {formatDate(normalizedTrack.sourceBroadcast?.endedAt || normalizedTrack.createdAt)}.</p></article>}

      {transcriptPublished && (chapters.length > 0 || moments.length > 0) && <div className="replay-discovery-grid">{chapters.length > 0 && <ChapterList chapters={chapters} onJump={jump} />}<section className="replay-moments"><div><h2>Key Moments</h2><button type="button" onClick={saveAllMoments}>Save all</button></div>{moments.map((moment) => <KeyMomentCard key={moment.id} moment={moment} onJump={jump} onSave={saveMoment} saved={savedMomentIds.has(`${Math.round(moment.seconds)}`)} />)}{!moments.length && <div className="lex-panel-empty">Key moments will appear with the transcript.</div>}</section></div>}
    </main>
  );
};

export default ListenerAudioDetail;
