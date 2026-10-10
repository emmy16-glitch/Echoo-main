import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { FiArrowLeft, FiBookmark, FiCheck, FiDownload, FiHeart, FiPause, FiPlay, FiSave, FiShare2, FiUsers } from 'react-icons/fi';

import audioService from '../../services/audioService';
import batch1Service from '../../services/batch1Service';
import downloadService from '../../services/downloadService';
import followService from '../../services/followService';
import savedMomentService from '../../services/savedMomentService';
import transcriptService from '../../services/transcriptService';
import { requestedPlaybackTime } from '../../services/listenerPlaybackRoute';
import { copyTextToClipboard, getPublicAppUrl } from '../../services/stationPublicUrl';
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
  const location = useLocation();
  const player = useOutletContext();
  const previewMode =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get('preview') === 'reference';
  const [track, setTrack] = useState(previewMode ? referenceReplay : null);
  const [loading, setLoading] = useState(!previewMode);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedMomentIds, setSavedMomentIds] = useState(() => new Set());
  const [following, setFollowing] = useState(false);
  const [savedAudio, setSavedAudio] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [transcript, setTranscript] = useState(previewMode ? referenceTranscript : []);
  const [transcriptLoading, setTranscriptLoading] = useState(!previewMode);
  const transcriptSearchSequence = useRef(0);
  const loadSequence = useRef(0);
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
    const sequence = loadSequence.current + 1;
    loadSequence.current = sequence;
    try {
      setLoading(true);
      const [response, transcriptResponse] = await Promise.all([
        audioService.getById(audioId),
        transcriptService.getAudio(audioId, { final: true }).catch(() => ({ data: [] })),
      ]);
      if (loadSequence.current !== sequence) return;
      const next = response?.data || response;
      if (!next?.id) throw new Error('This recording could not be found.');
      setTrack(next);
      batch1Service.checkSaved(next.id).then((result) => {
        if (loadSequence.current === sequence) setSavedAudio(Boolean(result?.data?.saved));
      }).catch(() => {
        if (loadSequence.current === sequence) setSavedAudio(false);
      });
      setTranscript(mapTranscript(transcriptResponse?.data || []));
      setTranscriptLoading(false);
      const momentResponse = await savedMomentService.list({ limit: 100 }).catch(() => ({ data: [] }));
      if (loadSequence.current !== sequence) return;
      setSavedMomentIds(new Set((momentResponse?.data || []).filter((moment) => String(moment.audioId) === String(next.id)).map((moment) => `${Math.round(moment.timestampMs / 1000)}`)));
      const artistId = typeof next.artist === 'object'
        ? next.artist?.id || next.artist?._id
        : next.artist;
      if (artistId) {
        followService.getCreatorStatus(artistId)
          .then((status) => {
            if (loadSequence.current === sequence) {
              setFollowing(Boolean(status?.isFollowing));
            }
          })
          .catch(() => {});
      }
      setError('');
    } catch (loadError) {
      if (loadSequence.current !== sequence) return;
      setError(loadError?.message || 'This recording is unavailable.');
    } finally {
      if (loadSequence.current === sequence) {
        setLoading(false);
        setTranscriptLoading(false);
      }
    }
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

  useEffect(() => {
    void load();
    return () => {
      loadSequence.current += 1;
      transcriptSearchSequence.current += 1;
    };
  }, [load]);

  const normalizedTrack = useMemo(() => track ? {
    ...track,
    id: track.id || track._id || audioId,
    title: track.title || 'Untitled recording',
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

  const active = normalizedTrack && String(player?.currentTrack?.id || '') === String(normalizedTrack.id);
  const playing = Boolean(active && player?.isPlaying);
  const displayDuration = active && Number(player?.duration) > 0 ? Number(player.duration) : normalizedTrack?.duration || 0;
  const displayCurrent = active ? Number(player?.currentTime) || 0 : 0;
  const playbackError = active ? player?.playerError || '' : '';
  const progress = displayDuration > 0 ? (displayCurrent / displayDuration) * 100 : 0;

  const play = () => {
    if (!normalizedTrack || !player) return;
    if (active) player.togglePlay?.();
    else player.playTrack?.(normalizedTrack, [normalizedTrack]);
  };
  const jump = (seconds) => {
    if (!normalizedTrack || !player) return;
    if (typeof player.playTrackAt === 'function') {
      player.playTrackAt(normalizedTrack, seconds, [normalizedTrack]);
    } else {
      player.playTrack?.(normalizedTrack, [normalizedTrack]);
      player.seekTo?.(seconds);
    }
  };
  useEffect(() => {
    initialSeekApplied.current = false;
  }, [audioId, location.search]);

  useEffect(() => {
    if (!normalizedTrack || initialSeekApplied.current || !player) return;
    if (String(normalizedTrack.id) !== String(audioId)) return;
    const requested = requestedPlaybackTime(location.search);
    if (requested === null) return;
    initialSeekApplied.current = true;
    if (typeof player.playTrackAt === 'function') {
      player.playTrackAt(normalizedTrack, requested, [normalizedTrack]);
    } else {
      player.playTrack?.(normalizedTrack, [normalizedTrack]);
      player.seekTo?.(requested);
    }
  }, [audioId, location.search, normalizedTrack, player]);

  const saveMoment = async (moment) => {
    const key = `${Math.round(moment.seconds)}`;
    if (previewMode || savedMomentIds.has(key)) return;
    try {
      await savedMomentService.create({
        audioId: normalizedTrack.id,
        ...(moment.segmentId ? { transcriptSegmentId: moment.segmentId } : {}),
        timestampMs: Math.round(moment.seconds * 1000),
        transcriptSnippet: moment.quote,
      });
      setSavedMomentIds((current) => new Set([...current, key]));
      setNotice('Moment saved.');
    } catch (saveError) {
      setError(saveError?.message || 'Could not save this moment.');
      throw saveError;
    }
  };
  const saveAllMoments = async () => {
    const unsaved = moments.filter((moment) => !savedMomentIds.has(`${Math.round(moment.seconds)}`));
    if (!unsaved.length) return setNotice('All key moments are saved.');
    const results = await Promise.allSettled(unsaved.map(saveMoment));
    const savedCount = results.filter((result) => result.status === 'fulfilled').length;
    const failedCount = results.length - savedCount;
    if (failedCount) setNotice(savedCount
      ? `${savedCount} moment${savedCount === 1 ? '' : 's'} saved; ${failedCount} could not be saved.`
      : 'Could not save the key moments. Please try again.');
    else setNotice('Key moments saved.');
  };
  const saveCurrentMoment = async () => {
    if (!active || !Number.isFinite(displayCurrent)) {
      setError('Start playback to save the moment you are listening to.');
      return;
    }
    await saveMoment({ seconds: displayCurrent });
  };
  const seekPercent = (percent) => {
    if (!normalizedTrack || !player || displayDuration <= 0) return;
    const seconds = (percent / 100) * displayDuration;
    if (!active && typeof player.playTrackAt === 'function') {
      player.playTrackAt(normalizedTrack, seconds, [normalizedTrack]);
    } else if (!active) {
      player.playTrack?.(normalizedTrack, [normalizedTrack]);
      player.seekTo?.(seconds);
    } else {
      player.seekTo?.(seconds);
    }
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
    try { await downloadService.download(normalizedTrack); setNotice('Recording downloaded.'); }
    catch { setError('Could not download this recording.'); }
  };
  const saveFile = async () => {
    try {
      const result = await downloadService.saveFile(normalizedTrack);
      setNotice(`${result.fileName} saved to your device.`);
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the audio file.');
    }
  };
  const toggleSavedAudio = async () => {
    if (!normalizedTrack || savingAudio) return;
    const wasSaved = savedAudio;
    setSavedAudio(!wasSaved);
    setSavingAudio(true);
    try {
      if (wasSaved) await batch1Service.unsaveTrack(normalizedTrack.id);
      else await batch1Service.saveTrack(normalizedTrack.id);
      setNotice(wasSaved ? 'Removed from Saved audio.' : 'Saved to your Library.');
    } catch (saveError) {
      setSavedAudio(wasSaved);
      setError(saveError?.message || 'Could not update Saved audio.');
    } finally {
      setSavingAudio(false);
    }
  };
  const share = async () => {
    try {
      const publicUrl = getPublicAppUrl(`/listen/audio/${encodeURIComponent(audioId || '')}`);
      if (!publicUrl) throw new Error('The public recording link is unavailable.');

      const desktopRuntime =
        typeof window !== 'undefined' && window.echooDesktop?.isDesktop === true;
      if (!desktopRuntime && navigator.share) {
        await navigator.share({
          title: normalizedTrack?.title || 'Echoo recording',
          url: publicUrl,
        });
        setNotice('Recording shared.');
      } else {
        await copyTextToClipboard(publicUrl);
        setNotice('Recording link copied.');
      }
    } catch (shareError) {
      if (shareError?.name === 'AbortError') return;
      setError('Could not share this recording.');
    }
  };

  if (loading) return <div className="replay-page"><div className="replay-state">Loading recording...</div></div>;
  if (!normalizedTrack) return <div className="replay-page"><button type="button" className="replay-back" onClick={() => navigate('/listen')}><FiArrowLeft /> Back</button><div className="replay-state">{error || 'Recording unavailable.'}</div></div>;

  const tabs = [
    { value: 'overview', label: 'Overview' },
    ...(transcriptPublished ? [{ value: 'transcript', label: 'Transcript' }, { value: 'chapters', label: 'Chapters' }] : []),
    { value: 'about', label: 'About' },
  ];

  return (
    <div className="replay-page eb-page-in">
      <button type="button" className="replay-back eb-press" onClick={() => navigate(-1)}><FiArrowLeft /> Back to recordings</button>
      {notice && <div className="replay-notice eb-toast-in" key={notice} role="status">{notice}</div>}
      {error && <div className="replay-error eb-shake" key={error} role="alert">{error}</div>}
      {playbackError && <div className="replay-error" role="alert">{playbackError}</div>}

      <section className="replay-hero" aria-labelledby="replay-title">
        <div className="replay-art">{normalizedTrack.coverArt && <img src={normalizedTrack.coverArt} alt="" />}<span>{formatTime(normalizedTrack.duration)}</span></div>
        <div className="replay-copy"><h1 id="replay-title">{normalizedTrack.title}</h1><strong>{normalizedTrack.genre}</strong><p>{normalizedTrack.description || 'No description is available for this recording.'}</p><div className="replay-creator"><span>{normalizedTrack.artistName.charAt(0)}</span><span><strong>{normalizedTrack.artistName}</strong><small>@{normalizedTrack.artistName.toLowerCase().replace(/\s+/g, '')}</small></span><FiCheck aria-label="Verified" /><em><FiUsers /> {Number(normalizedTrack.sourceBroadcast?.peakListeners || normalizedTrack.playCount || 0).toLocaleString()} listens</em></div></div>
      </section>

      <div className="replay-actions"><EchooButton icon={playing ? <FiPause /> : <FiPlay />} onClick={play}>{playing ? 'Pause' : 'Play'}</EchooButton><EchooButton variant="secondary" icon={<FiHeart />} onClick={toggleSavedAudio} disabled={savingAudio}>{savingAudio ? 'Saving…' : savedAudio ? 'Saved' : 'Save'}</EchooButton><EchooButton variant="secondary" icon={<FiBookmark />} onClick={saveCurrentMoment} disabled={!active}>Save moment</EchooButton><EchooButton variant="secondary" icon={<FiCheck />} onClick={toggleFollow}>{following ? 'Following' : 'Follow'}</EchooButton><EchooButton variant="secondary" icon={<FiShare2 />} onClick={share}>Share</EchooButton><EchooButton variant="secondary" icon={<FiDownload />} onClick={download}>Download for offline</EchooButton><EchooButton variant="secondary" icon={<FiSave />} onClick={saveFile}>Save file</EchooButton></div>

      <section className="replay-timeline" aria-label="Recording audio timeline"><Waveform progress={progress} onSeek={seekPercent} /><div><span>{formatTime(displayCurrent)}</span><span>{formatTime(displayDuration)}</span></div></section>
      <Tabs items={tabs} value={activeTab} onChange={setActiveTab} ariaLabel="Recording sections" className="replay-tabs" />

      {activeTab === 'overview' && <div className="replay-overview replay-overview--facts"><dl className="replay-facts"><div><dt>Category</dt><dd>{normalizedTrack.genre}</dd></div><div><dt>Duration</dt><dd>{formatTime(normalizedTrack.duration)}</dd></div><div><dt>Language</dt><dd>{transcript[0]?.language || 'Not specified'}</dd></div><div><dt>Recorded</dt><dd>{formatDate(normalizedTrack.sourceBroadcast?.endedAt || normalizedTrack.createdAt)}</dd></div><div><dt>Listeners</dt><dd>{Number(normalizedTrack.sourceBroadcast?.peakListeners || normalizedTrack.playCount || 0).toLocaleString()}</dd></div><div><dt>Type</dt><dd>{normalizedTrack.sourceBroadcast ? 'Live broadcast' : 'Audio'}</dd></div></dl>{Array.isArray(normalizedTrack.tags) && normalizedTrack.tags.length > 0 && <div className="replay-tags"><strong>Tags</strong><div>{normalizedTrack.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div>}</div>}
      {transcriptPublished && activeTab === 'transcript' && <TranscriptPanel segments={transcript} loading={transcriptLoading} onJump={jump} onSearch={previewMode ? undefined : searchTranscript} />}
      {transcriptPublished && activeTab === 'chapters' && (chapters.length ? <ChapterList chapters={chapters} onJump={jump} /> : <div className="replay-state">Chapters will appear when transcript moments are available.</div>)}
      {activeTab === 'about' && <article className="replay-about replay-about--wide"><h2>About this recording</h2><p>{normalizedTrack.description || 'No description is available for this recording.'}</p><p>Recorded on {formatDate(normalizedTrack.sourceBroadcast?.endedAt || normalizedTrack.createdAt)}.</p></article>}

      {activeTab === 'overview' && transcriptPublished && moments.length > 0 && <section className="replay-moments replay-moments--overview"><div><h2>Key Moments</h2><button type="button" onClick={saveAllMoments}>Save all</button></div>{moments.map((moment) => <KeyMomentCard key={moment.id} moment={moment} onJump={jump} onSave={saveMoment} saved={savedMomentIds.has(`${Math.round(moment.seconds)}`)} />)}</section>}
    </div>
  );
};

export default ListenerAudioDetail;
