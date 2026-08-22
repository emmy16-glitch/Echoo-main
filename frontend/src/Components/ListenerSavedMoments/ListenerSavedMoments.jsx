import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FiBookmark, FiClock, FiPlay, FiTrash2 } from 'react-icons/fi';
import savedMomentService from '../../services/savedMomentService';
import './ListenerSavedMoments.css';

const formatTime = (milliseconds) => {
  const seconds = Math.floor((Number(milliseconds) || 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const ListenerSavedMoments = () => {
  const navigate = useNavigate();
  const player = useOutletContext();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await savedMomentService.list();
      setMoments(response?.data || []);
      setError('');
    } catch (loadError) { setError(loadError?.message || 'Saved moments could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (moment) => {
    const seconds = moment.timestampMs / 1000;
    if (moment.audio?.fileUrl) {
      player?.playTrackAt?.({ ...moment.audio, id: moment.audioId, coverArt: moment.coverArt, subtitle: moment.creatorName }, seconds, [moment.audio]);
      return;
    }
    if (moment.audioId) navigate(`/listen/audio/${moment.audioId}?t=${Math.floor(seconds)}`);
    else if (moment.broadcastId) navigate(`/listen/live/${moment.broadcastId}`);
  };
  const remove = async (moment) => {
    try { setWorkingId(moment.id); await savedMomentService.remove(moment.id); setMoments((current) => current.filter((item) => item.id !== moment.id)); }
    catch (removeError) { setError(removeError?.message || 'Could not remove this moment.'); }
    finally { setWorkingId(''); }
  };

  return (
    <main className="lsm-page">
      <header><span>YOUR LIBRARY</span><h1>Saved Moments</h1><p>Return to the words and audio worth keeping.</p></header>
      {error && <div className="lsm-error" role="alert">{error}</div>}
      {loading ? <div className="lsm-state">Loading saved moments...</div> : moments.length ? (
        <section className="lsm-list" aria-label="Saved moments">
          {moments.map((moment) => (
            <article key={moment.id}>
              <button type="button" className="lsm-cover" onClick={() => open(moment)}>{moment.coverArt ? <img src={moment.coverArt} alt="" /> : <FiBookmark />}</button>
              <div className="lsm-copy"><span>{moment.status === 'live' ? 'LIVE' : 'REPLAY'} · {moment.category}</span><h2>{moment.title}</h2><p>&ldquo;{moment.transcriptSnippet || 'Saved audio moment'}&rdquo;</p><small>{moment.creatorName} · {moment.stationName}</small></div>
              <time><FiClock /> {formatTime(moment.timestampMs)}</time>
              <button type="button" className="lsm-play" onClick={() => open(moment)} aria-label={`Play ${moment.title} from ${formatTime(moment.timestampMs)}`}><FiPlay /></button>
              <button type="button" className="lsm-remove" onClick={() => remove(moment)} disabled={workingId === moment.id} aria-label="Remove saved moment"><FiTrash2 /></button>
            </article>
          ))}
        </section>
      ) : <div className="lsm-state"><FiBookmark /><h2>No saved moments yet</h2><p>Save a transcript line or replay timestamp and it will appear here.</p><button type="button" onClick={() => navigate('/listen/live')}>Explore live shows</button></div>}
    </main>
  );
};

export default ListenerSavedMoments;
