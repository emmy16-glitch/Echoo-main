import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FiHeadphones, FiPlay } from 'react-icons/fi';
import ContinueListening from '../ListenerV2/ContinueListening';
import batch1Service from '../../services/batch1Service';
import listenerService from '../../services/listenerService';
import audioService from '../../services/audioService';
import { useGuestAuth } from '../Auth/GuestAuthGate';

const ListenerLibrary = () => {
  const navigate = useNavigate();
  const { playTrack, playTrackAt } = useOutletContext();
  const { isGuest, requestAuth } = useGuestAuth();
  const [tab, setTab] = useState('saved');
  const [saved, setSaved] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    if (isGuest) { setLoading(false); return; }
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([batch1Service.getSavedTracks(), listenerService.getHistory(1, 50)]);
    if (results[0].status === 'fulfilled') setSaved((results[0].value?.data?.tracks || []).map(audioService.normalize));
    if (results[1].status === 'fulfilled') setHistory(results[1].value?.data?.history || []);
    if (results.some(result => result.status === 'rejected')) setError('Some library content could not load. Try again.');
    setLoading(false);
  }, [isGuest]);
  useEffect(() => { load(); }, [load]);
  const remove = async (track) => {
    if (busy) return;
    const id = track.id || track._id;
    setBusy(id);
    try { await batch1Service.unsaveTrack(id); setSaved(items => items.filter(item => (item.id || item._id) !== id)); }
    catch { setError('Could not remove this recording. Try again.'); }
    finally { setBusy(''); }
  };
  const rows = tab === 'saved' ? saved : history;
  return <div className="listener-v2-page">
    <header className="listener-v2-page-title"><h1>Library</h1><p>Your saved audio and listening history.</p></header>
    <ContinueListening />
    <div className="listener-v2-category-tabs" aria-label="Library sections">
      {['saved', 'history'].map(key => <button type="button" key={key} aria-pressed={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{key === 'saved' ? 'Saved' : 'History'}</button>)}
      <button type="button" onClick={() => navigate('/listen/saved-moments')}>Saved broadcasts</button>
      <button type="button" onClick={() => navigate('/listen/downloads')}>Downloads</button>
    </div>
    {error && <p className="listener-v2-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
    {isGuest ? <div className="listener-v2-empty"><FiHeadphones /><strong>Keep your listening in one place</strong><p>Sign in to save recordings and keep your history.</p><button type="button" onClick={() => requestAuth({ action: 'Open Library', destination: '/listen/library' })}>Sign in</button></div>
      : loading ? <div className="listener-v2-row-skeleton" role="status" aria-label="Loading library"><span /><span /><span /></div>
      : rows.length ? <div className="listener-v2-audio-list">{rows.map(track => <article key={track.historyId || track.id || track._id}>
        <span className="listener-v2-audio-art">{track.coverArt ? <img src={track.coverArt} alt="" /> : <FiHeadphones />}</span>
        <div><strong>{track.title}</strong><span>{track.artistName}</span>{track.duration > 0 && <small>{Math.round(track.duration / 60)} min{tab === 'history' && track.progress > 0 ? ` · ${Math.round(track.progress)}% listened` : ''}</small>}</div>
        <button type="button" aria-label={`Play ${track.title}`} onClick={() => tab === 'history' ? playTrackAt(track, (Number(track.progress) || 0) / 100 * track.duration, rows) : playTrack(track, rows)}><FiPlay /></button>
        {tab === 'saved' && <details className="listener-library-overflow"><summary aria-label={`More actions for ${track.title}`}>•••</summary><button type="button" disabled={Boolean(busy)} onClick={() => remove(track)}>{busy === (track.id || track._id) ? 'Removing…' : 'Remove from Saved'}</button></details>}
      </article>)}</div>
      : <div className="listener-v2-empty"><FiHeadphones /><strong>{tab === 'saved' ? 'No saved audio yet' : 'No listening history yet'}</strong><p>Find something you want to hear.</p><button type="button" onClick={() => navigate('/listen')}>Explore Discover</button></div>}
  </div>;
};
export default ListenerLibrary;
