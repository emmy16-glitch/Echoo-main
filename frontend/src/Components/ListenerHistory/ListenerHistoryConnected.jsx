import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaCheckCircle,
  FaClock,
  FaEllipsisH,
  FaHistory,
  FaPause,
  FaPlay,
  FaSyncAlt,
  FaTrash,
} from 'react-icons/fa';

import audioService from '../../services/audioService';
import batch6Service from '../../services/batch6Service';
import '../../styles/listener-reference-pages.css';

const percent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  return `${minutes}:${String(secs).padStart(2,'0')}`;
};
const formatListeningTotal = (seconds) => {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};
const formatPlayedAt = (value) => {
  if (!value) return 'Previously listened';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Previously listened';
  return date.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
};

const normalizedTrack = (item) => {
  const raw = item?.track && typeof item.track === 'object' ? item.track : null;
  if (!raw) return null;
  const track = audioService.normalize(raw);
  if (!track?.id || !track?.fileUrl) return null;
  return track;
};

const ListenerHistoryConnected = () => {
  const navigate = useNavigate();
  const { playTrack, playTrackAt, currentTrack, isPlaying, togglePlay } = useOutletContext();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ totalPlays:0, completedItems:0, completionRate:0, totalListeningTime:0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) {
        setError('');
        setMessage('');
      }
      const [historyResult, statsResult] = await Promise.all([
        batch6Service.getHistory({ page:1, limit:100, type:'all', sort:'recent' }),
        batch6Service.getHistoryStats(),
      ]);
      setItems(Array.isArray(historyResult?.data?.history) ? historyResult.data.history : []);
      setStats({
        totalPlays:Number(statsResult?.data?.totalPlays) || 0,
        completedItems:Number(statsResult?.data?.completedItems) || 0,
        completionRate:Number(statsResult?.data?.completionRate) || 0,
        totalListeningTime:Number(statsResult?.data?.totalListeningTime) || 0,
      });
    } catch (loadError) {
      if (!silent) setError(loadError?.message || 'Could not load listening history.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent:true });
    const interval = window.setInterval(sync, 20000);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const queue = useMemo(() => items.map(normalizedTrack).filter(Boolean), [items]);

  const play = (item) => {
    const track = normalizedTrack(item);
    if (!track) {
      setError('This history item no longer has a playable audio file.');
      return;
    }
    if (String(currentTrack?.id || '') === String(track.id)) {
      togglePlay();
      return;
    }
    const resume = item.completed ? 0 : (Number(track.duration) || 0) * percent(item.progress) / 100;
    if (playTrackAt) playTrackAt({ ...track, subtitle:track.artistName }, resume, queue);
    else playTrack({ ...track, subtitle:track.artistName }, queue);
  };

  const remove = async (item) => {
    if (!item?.id || busyId) return;
    try {
      setBusyId(String(item.id));
      setError('');
      await batch6Service.removeHistoryItem(item.id);
      setItems((current) => current.filter((entry) => String(entry.id) !== String(item.id)));
      setMessage('History item removed.');
      const statsResult = await batch6Service.getHistoryStats();
      setStats({
        totalPlays:Number(statsResult?.data?.totalPlays) || 0,
        completedItems:Number(statsResult?.data?.completedItems) || 0,
        completionRate:Number(statsResult?.data?.completionRate) || 0,
        totalListeningTime:Number(statsResult?.data?.totalListeningTime) || 0,
      });
    } catch (actionError) {
      setError(actionError?.message || 'Could not remove history item.');
    } finally { setBusyId(''); }
  };

  const clear = async () => {
    if (busyId || !items.length) return;
    if (!window.confirm('Clear your entire Echoo listening history?')) return;
    try {
      setBusyId('clear');
      setError('');
      await batch6Service.clearHistory();
      setItems([]);
      setStats({ totalPlays:0, completedItems:0, completionRate:0, totalListeningTime:0 });
      setMessage('Listening history cleared.');
    } catch (actionError) {
      setError(actionError?.message || 'Could not clear listening history.');
    } finally { setBusyId(''); }
  };

  return (
    <main className="echoo-reference-page ref-history-page">
      <header className="ref-page-heading ref-history-heading">
        <div>
          <span className="ref-kicker">LISTENING HISTORY</span>
          <h1>Your listening history</h1>
          <p>Resume anything you have listened to from the same persistent player.</p>
        </div>
        <div className="ref-history-actions">
          <button type="button" onClick={() => load()} disabled={loading || Boolean(busyId)}><FaSyncAlt /> Refresh</button>
          <button type="button" className="danger" onClick={clear} disabled={busyId === 'clear' || !items.length}><FaTrash /> {busyId === 'clear' ? 'Clearing...' : 'Clear history'}</button>
        </div>
      </header>

      {message && <div className="ref-inline-success">{message}</div>}
      {error && <div className="ref-inline-error">{error}</div>}

      <section className="ref-history-stats">
        <article><FaHistory /><div><strong>{stats.totalPlays}</strong><span>Total plays</span><small>All time</small></div></article>
        <article><FaCheckCircle /><div><strong>{stats.completedItems}</strong><span>Completed</span><small>Tracks finished</small></div></article>
        <article><FaCheckCircle /><div><strong>{Math.round(stats.completionRate)}%</strong><span>Completion rate</span><small>Across all listens</small></div></article>
        <article><FaClock /><div><strong>{formatListeningTotal(stats.totalListeningTime)}</strong><span>Total time listened</span><small>All time</small></div></article>
      </section>

      <section className="ref-history-panel">
        <header><strong>Recent activity</strong><span>{items.length} item{items.length === 1 ? '' : 's'}</span></header>
        {loading ? (
          <div className="ref-state-card compact"><strong>Loading listening history...</strong></div>
        ) : items.length === 0 ? (
          <div className="ref-state-card compact"><FaHistory /><strong>No listening history yet.</strong><span>Play public audio and your real playback activity will appear here.</span></div>
        ) : (
          <div className="ref-history-list">
            {items.map((item) => {
              const track = normalizedTrack(item);
              const progress = percent(item.progress);
              const elapsed = track?.duration ? track.duration * progress / 100 : 0;
              const playing = Boolean(track && isPlaying && String(currentTrack?.id || '') === String(track.id));
              return (
                <article className="ref-history-row" key={item.id}>
                  <button type="button" className="ref-history-art" disabled={!track} onClick={() => track && navigate(`/listen/audio/${track.id}`)}>
                    {track?.coverArt ? <img src={track.coverArt} alt="" /> : <FaHeadphonesFallback />}
                  </button>
                  <button type="button" className="ref-history-copy" disabled={!track} onClick={() => track && navigate(`/listen/audio/${track.id}`)}>
                    <strong>{track?.title || item.track?.title || 'Unavailable audio'}</strong>
                    <span>{track?.artistName || 'Echoo Creator'}</span>
                    <small>Listened {formatPlayedAt(item.playedAt)}</small>
                  </button>
                  <div className="ref-history-progress">
                    <div><i style={{ width:`${progress}%` }} /></div>
                    <span>{item.completed ? 'Completed' : `${formatTime(elapsed)} / ${formatTime(track?.duration || 0)} · ${Math.round(progress)}%`}</span>
                  </div>
                  <button type="button" className="ref-history-resume" disabled={!track} onClick={() => play(item)}>{playing ? <FaPause /> : <FaPlay />} {playing ? 'Pause' : item.completed ? 'Play again' : 'Resume'}</button>
                  <button type="button" className="ref-history-more" title="Remove from history" disabled={busyId === String(item.id)} onClick={() => remove(item)}>{busyId === String(item.id) ? <FaEllipsisH /> : <FaTrash />}</button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};

const FaHeadphonesFallback = () => <span aria-hidden="true">◉</span>;

export default ListenerHistoryConnected;
