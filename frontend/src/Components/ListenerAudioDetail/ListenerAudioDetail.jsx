import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBookmark,
  FaCheck,
  FaDownload,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaShareAlt,
} from 'react-icons/fa';

import audioService from '../../services/audioService';
import batch1Service from '../../services/batch1Service';
import downloadService from '../../services/downloadService';
import '../../styles/listener-reference-pages.css';
import '../../styles/listener-reference-pages-extended.css';

const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2,'0')}`;
};
const formatDate = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' });
};
const artistIdOf = (track) => {
  const artist = track?.artist;
  if (!artist) return null;
  if (typeof artist === 'string') return artist;
  return artist.id || artist._id || null;
};

const ListenerAudioDetail = () => {
  const { audioId } = useParams();
  const navigate = useNavigate();
  const {
    playTrack,
    currentTrack,
    isPlaying,
    togglePlay,
    currentTime,
    duration: playerDuration,
  } = useOutletContext();

  const [track,setTrack] = useState(null);
  const [related,setRelated] = useState([]);
  const [moreFromCreator,setMoreFromCreator] = useState([]);
  const [saved,setSaved] = useState(false);
  const [downloaded,setDownloaded] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState('');
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');

  const load = useCallback(async () => {
    if (!audioId) return;
    try {
      setLoading(true);
      setError('');
      const response = await audioService.getById(audioId);
      const nextTrack = response?.data || null;
      if (!nextTrack?.id) throw new Error('This audio could not be found.');
      setTrack(nextTrack);

      const artistId = artistIdOf(nextTrack);
      const requests = [
        batch1Service.checkSaved(nextTrack.id),
        audioService.getAll({ public:true, genre:nextTrack.genre || undefined, page:1, limit:12 }),
        artistId ? audioService.getAll({ public:true, userId:artistId, page:1, limit:12 }) : Promise.resolve({ data:[] }),
      ];
      const [savedResult,relatedResult,creatorResult] = await Promise.allSettled(requests);

      if (savedResult.status === 'fulfilled') {
        const data = savedResult.value?.data;
        setSaved(Boolean(data?.saved ?? data?.isSaved ?? data));
      }
      if (relatedResult.status === 'fulfilled') {
        setRelated((relatedResult.value?.data || []).filter((item) => String(item.id) !== String(nextTrack.id)).slice(0,5));
      }
      if (creatorResult.status === 'fulfilled') {
        setMoreFromCreator((creatorResult.value?.data || []).filter((item) => String(item.id) !== String(nextTrack.id)).slice(0,4));
      }
      setDownloaded(downloadService.has(nextTrack.id));
    } catch (loadError) {
      setTrack(null);
      setError(loadError?.message || 'Could not load this audio.');
    } finally { setLoading(false); }
  },[audioId]);

  useEffect(() => { load(); },[load]);

  const queue = useMemo(() => {
    const combined = [track,...related,...moreFromCreator].filter(Boolean);
    const seen = new Set();
    return combined.filter((item) => {
      if (!item?.id || seen.has(String(item.id))) return false;
      seen.add(String(item.id));
      return Boolean(item.fileUrl);
    });
  },[track,related,moreFromCreator]);

  const active = track && String(currentTrack?.id || '') === String(track.id);
  const playing = Boolean(active && isPlaying);
  const displayDuration = active && playerDuration > 0 ? playerDuration : Number(track?.duration) || 0;
  const displayCurrent = active ? currentTime : 0;
  const progress = displayDuration > 0 ? Math.min(100,(displayCurrent / displayDuration) * 100) : 0;

  const play = (item = track) => {
    if (!item?.fileUrl) {
      setError('This audio does not have a playable file attached to it.');
      return;
    }
    if (String(currentTrack?.id || '') === String(item.id)) {
      togglePlay();
      return;
    }
    playTrack({ ...item, subtitle:item.artistName || 'Echoo Creator' }, queue);
  };

  const toggleSaved = async () => {
    if (!track?.id || busy) return;
    try {
      setBusy('save'); setError(''); setMessage('');
      if (saved) await batch1Service.unsaveTrack(track.id);
      else await batch1Service.saveTrack(track.id);
      setSaved((value) => !value);
      setMessage(saved ? 'Removed from your Library.' : 'Saved to your Library.');
    } catch (actionError) {
      setError(actionError?.message || 'Could not update your Library.');
    } finally { setBusy(''); }
  };

  const download = async () => {
    if (!track?.id || busy) return;
    try {
      setBusy('download'); setError(''); setMessage('');
      if (downloaded) {
        navigate('/listen/downloads');
        return;
      }
      await downloadService.download(track);
      setDownloaded(true);
      setMessage('Audio downloaded to this browser.');
    } catch (actionError) {
      setError(actionError?.message || 'Could not download this audio.');
    } finally { setBusy(''); }
  };

  const share = async () => {
    if (!track) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title:track.title, text:`Listen to ${track.title} on Echoo`, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setMessage('Audio link copied.');
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') setError('Could not share this audio.');
    }
  };

  if (loading) {
    return <main className="echoo-reference-page ref-audio-detail-page"><div className="ref-state-card"><strong>Loading audio...</strong></div></main>;
  }
  if (!track) {
    return <main className="echoo-reference-page ref-audio-detail-page"><div className="ref-state-card"><FaHeadphones /><strong>{error || 'Audio unavailable.'}</strong><button type="button" onClick={() => navigate('/listen')}>Back home</button></div></main>;
  }

  return (
    <main className="echoo-reference-page ref-audio-detail-page">
      <button type="button" className="ref-back-link" onClick={() => navigate(-1)}><FaArrowLeft /> Back</button>
      {message && <div className="ref-inline-success">{message}</div>}
      {error && <div className="ref-inline-error">{error}</div>}

      <section className="ref-audio-detail-hero">
        <div className="ref-audio-detail-art">{track.coverArt ? <img src={track.coverArt} alt="" /> : <FaHeadphones />}</div>
        <div className="ref-audio-detail-copy">
          <span className="ref-kicker">AUDIO</span>
          <h1>{track.title}</h1>
          <button type="button" className="ref-audio-artist" onClick={() => artistIdOf(track) && navigate(`/listen/creator/${artistIdOf(track)}`)}>{track.artistName || 'Echoo Creator'}</button>
          <p>{track.genre || 'Audio'} · {formatTime(track.duration)} · {formatDate(track.createdAt)}</p>
          <div className="ref-audio-actions">
            <button type="button" className="primary" onClick={() => play()}>{playing ? <FaPause /> : <FaPlay />} {playing ? 'Pause' : 'Play'}</button>
            <button type="button" className={saved ? 'selected' : ''} disabled={busy === 'save'} onClick={toggleSaved}>{saved ? <FaCheck /> : <FaBookmark />} {saved ? 'Saved' : 'Save'}</button>
            <button type="button" className={downloaded ? 'selected' : ''} disabled={busy === 'download'} onClick={download}><FaDownload /> {downloaded ? 'Downloaded' : busy === 'download' ? 'Downloading...' : 'Download'}</button>
            <button type="button" onClick={share}><FaShareAlt /> Share</button>
          </div>
          <div className="ref-audio-wave-progress"><span>{formatTime(displayCurrent)}</span><div><i style={{ width:`${progress}%` }} /></div><span>{formatTime(displayDuration)}</span></div>
        </div>

        <aside className="ref-audio-meta">
          <h2>About this track</h2>
          <dl>
            <div><dt>Genre</dt><dd>{track.genre || 'Other'}</dd></div>
            <div><dt>Duration</dt><dd>{formatTime(track.duration)}</dd></div>
            <div><dt>Released</dt><dd>{formatDate(track.createdAt)}</dd></div>
            <div><dt>Plays</dt><dd>{Number(track.playCount) || 0}</dd></div>
            <div><dt>Likes</dt><dd>{Number(track.likeCount) || 0}</dd></div>
          </dl>
        </aside>
      </section>

      <section className="ref-audio-detail-body">
        <div className="ref-audio-main-column">
          <article className="ref-audio-description">
            <h2>About this track</h2>
            <p>{track.description?.trim() || 'The creator has not added a description for this audio yet.'}</p>
            {Array.isArray(track.tags) && track.tags.length > 0 && <div className="ref-audio-tags">{track.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
          </article>

          {moreFromCreator.length > 0 && (
            <section className="ref-audio-more">
              <div className="ref-section-heading"><div><h2>More from {track.artistName || 'this creator'}</h2><p>Other public audio from the same creator.</p></div></div>
              <div className="ref-audio-more-grid">
                {moreFromCreator.map((item) => (
                  <article key={item.id}>
                    <button type="button" onClick={() => navigate(`/listen/audio/${item.id}`)}>{item.coverArt ? <img src={item.coverArt} alt="" /> : <FaHeadphones />}</button>
                    <strong>{item.title}</strong><span>{formatTime(item.duration)}</span>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="ref-related-tracks">
          <div className="ref-section-heading"><div><h2>Related audio</h2></div></div>
          {related.length ? related.map((item) => (
            <article key={item.id}>
              <button type="button" className="ref-related-art" onClick={() => navigate(`/listen/audio/${item.id}`)}>{item.coverArt ? <img src={item.coverArt} alt="" /> : <FaHeadphones />}</button>
              <button type="button" className="ref-related-copy" onClick={() => navigate(`/listen/audio/${item.id}`)}><strong>{item.title}</strong><span>{item.artistName || 'Echoo Creator'}</span><small>{formatTime(item.duration)}</small></button>
              <button type="button" className="ref-row-play" onClick={() => play(item)}><FaPlay /></button>
            </article>
          )) : <div className="ref-related-empty">No related public audio yet.</div>}
        </aside>
      </section>
    </main>
  );
};

export default ListenerAudioDetail;
