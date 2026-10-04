import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FiHeadphones, FiPlay } from 'react-icons/fi';
import ContinueListening from '../ListenerV2/ContinueListening';
import batch1Service from '../../services/batch1Service';
import audioService from '../../services/audioService';
import { useGuestAuth } from '../Auth/GuestAuthGate';

const ListenerLibrary = () => {
  const navigate = useNavigate();
  const { playTrack } = useOutletContext();
  const { isGuest, requestAuth } = useGuestAuth();
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (isGuest) {
      setSaved([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await batch1Service.getSavedTracks();
      setSaved((result?.data?.tracks || []).map(audioService.normalize));
    } catch {
      setError('Saved audio could not load. Try again.');
    } finally {
      setLoading(false);
    }
  }, [isGuest]);

  useEffect(() => { load(); }, [load]);

  const remove = async (track) => {
    if (busy) return;
    const id = track.id || track._id;
    setBusy(id);
    try {
      await batch1Service.unsaveTrack(id);
      setSaved(items => items.filter(item => (item.id || item._id) !== id));
    } catch {
      setError('Could not remove this recording. Try again.');
    } finally {
      setBusy('');
    }
  };

  return <div className="listener-v2-page">
    <header className="listener-v2-page-title"><h1>Library</h1><p>Your saved audio and listening tools.</p></header>
    <ContinueListening />
    <div className="listener-v2-category-tabs" aria-label="Library sections">
      <button type="button" className="is-active" aria-current="page">Saved</button>
      <button type="button" onClick={() => navigate('/listen/history')}>History</button>
      <button type="button" onClick={() => navigate('/listen/playlist')}>Playlists</button>
      <button type="button" onClick={() => navigate('/listen/saved-moments')}>Saved moments</button>
      <button type="button" onClick={() => navigate('/listen/downloads')}>Downloads</button>
    </div>
    {error && <p className="listener-v2-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
    {isGuest ? <div className="listener-v2-empty"><FiHeadphones /><strong>Keep your listening in one place</strong><p>Sign in to save recordings and keep your library across devices.</p><button type="button" onClick={() => requestAuth({ action: 'Open Library', destination: '/listen/library' })}>Sign in</button></div>
      : loading ? <div className="listener-v2-row-skeleton" role="status" aria-label="Loading library"><span /><span /><span /></div>
      : saved.length ? <div className="listener-v2-audio-list">{saved.map(track => <article key={track.id || track._id}>
        <span className="listener-v2-audio-art">{track.coverArt ? <img src={track.coverArt} alt="" /> : <FiHeadphones />}</span>
        <div><strong>{track.title}</strong><span>{track.artistName}</span>{track.duration > 0 && <small>{Math.round(track.duration / 60)} min</small>}</div>
        <button type="button" aria-label={`Play ${track.title}`} onClick={() => playTrack(track, saved)}><FiPlay /></button>
        <details className="listener-library-overflow"><summary aria-label={`More actions for ${track.title}`}>•••</summary><button type="button" disabled={Boolean(busy)} onClick={() => remove(track)}>{busy === (track.id || track._id) ? 'Removing…' : 'Remove from Saved'}</button></details>
      </article>)}</div>
      : <div className="listener-v2-empty"><FiHeadphones /><strong>No saved audio yet</strong><p>Save a recording and it will appear here.</p><button type="button" onClick={() => navigate('/listen')}>Explore Discover</button></div>}
  </div>;
};

export default ListenerLibrary;
