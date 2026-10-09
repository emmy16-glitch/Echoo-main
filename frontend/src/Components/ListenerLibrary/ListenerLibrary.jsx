import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { FiHeadphones, FiPlay } from 'react-icons/fi';
import ContinueListening from '../ListenerV2/ContinueListening';
import batch1Service from '../../services/batch1Service';
import audioService from '../../services/audioService';
import collectionService from '../../services/collectionService';
import { useGuestAuth } from '../Auth/GuestAuthGate';

const ListenerLibrary = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const collectionTab = searchParams.get('tab') === 'collections';
  const { playTrack } = useOutletContext();
  const { isGuest, requestAuth } = useGuestAuth();
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [publicCollections, setPublicCollections] = useState([]);
  const [savedCollections, setSavedCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState('');

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

  const loadCollections = useCallback(async () => {
    setCollectionsLoading(true);
    setCollectionsError('');
    const results = await Promise.allSettled([
      collectionService.getPublic({ limit: 40 }),
      isGuest ? Promise.resolve({ data: [] }) : collectionService.getSaved(),
    ]);
    if (results[0].status === 'fulfilled') setPublicCollections(results[0].value?.data || []);
    else setCollectionsError('Published Collections could not load. Try again.');
    if (results[1].status === 'fulfilled') setSavedCollections(results[1].value?.data || []);
    else setCollectionsError('Saved Collections could not load. Try again.');
    setCollectionsLoading(false);
  }, [isGuest]);

  useEffect(() => { if (collectionTab) void loadCollections(); }, [collectionTab, loadCollections]);

  const collectionRow = (collection) => (
    <article key={collection.id}>
      <span className="listener-v2-audio-art">{collection.coverArt ? <img src={collection.coverArt} alt="" /> : <FiHeadphones />}</span>
      <div><strong>{collection.title || collection.name}</strong><span>{collection.station?.name || 'Echoo Collection'} · {collection.broadcastCount ?? collection.recordings?.length ?? 0} recordings</span></div>
      <button type="button" aria-label={`Open ${collection.title || collection.name}`} onClick={() => navigate(`/listen/collections/${encodeURIComponent(collection.id)}`)}>View</button>
    </article>
  );

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
    <header className="listener-v2-page-title"><h1>Library</h1></header>
    {!collectionTab && <ContinueListening />}
    <div className="listener-v2-category-tabs" aria-label="Library sections">
      <button type="button" className={!collectionTab ? "is-active" : ""} aria-current={!collectionTab ? "page" : undefined} onClick={() => setSearchParams({})}>Saved audio</button>
      <button type="button" className={collectionTab ? "is-active" : ""} aria-current={collectionTab ? "page" : undefined} onClick={() => setSearchParams({ tab: "collections" })}>Collections</button>
      <button type="button" onClick={() => navigate('/listen/history')}>History</button>
      <button type="button" onClick={() => navigate('/listen/playlist')}>Playlists</button>
      <button type="button" onClick={() => navigate('/listen/downloads')}>Downloads</button>
    </div>
    {collectionTab ? (
      <>
        {collectionsError && <p className="listener-v2-error" role="alert">{collectionsError} <button type="button" onClick={loadCollections}>Retry</button></p>}
        {collectionsLoading ? <div className="listener-v2-row-skeleton" role="status" aria-label="Loading Collections"><span /><span /><span /></div> : (
          <>
            {!isGuest && <section className="listener-v2-panel" aria-label="Saved Collections">
              <h2>Saved Collections</h2>
              {savedCollections.length ? <div className="listener-v2-audio-list">{savedCollections.map(collectionRow)}</div> : <p>Collections you save will appear here across your devices.</p>}
            </section>}
            <section className="listener-v2-panel" aria-label="Published Collections">
              <h2>Explore Collections</h2>
              {publicCollections.length ? <div className="listener-v2-audio-list">{publicCollections.map(collectionRow)}</div> : <p>No published Collections are available yet.</p>}
            </section>
          </>
        )}
      </>
    ) : (
    <>
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
    </>
    )}
  </div>;
};

export default ListenerLibrary;
