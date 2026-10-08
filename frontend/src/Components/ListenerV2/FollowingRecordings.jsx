import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FiPlay } from 'react-icons/fi';
import followService from '../../services/followService';
import audioService from '../../services/audioService';
import { isAuthenticated } from '../../services/guestSession';
import { buildMediaUrl } from '../../services/api';

const idOf = (value) => String(value?.id || value?._id || '');

const followTargets = (stations, creators) => [
  ...stations.map((station) => ({
    key: `station:${idOf(station)}`,
    name: station.name || 'Channel',
    image: station.brandCover || station.coverArt || station.logo,
    path: `/listen/channels/${idOf(station)}`,
  })),
  ...creators.map((creator) => ({
    key: `creator:${idOf(creator)}`,
    name: creator.name || creator.displayName || creator.username || 'Creator',
    image: creator.avatar || creator.profileImage,
    path: `/listen/creator/${idOf(creator)}`,
  })),
].filter((target) => target.key.split(':')[1]);

export default function FollowingRecordings({ excludeIds = [], showAccounts = true }) {
  const navigate = useNavigate();
  const { playTrack } = useOutletContext();
  const [tracks, setTracks] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const excludeKey = excludeIds.map((value) => String(value || '')).filter(Boolean).sort().join('|');
  const excluded = useMemo(() => new Set(excludeKey ? excludeKey.split('|') : []), [excludeKey]);

  const load = useCallback(async (isActive = () => true) => {
    if (!isAuthenticated()) {
      if (isActive()) { setTracks([]); setAccounts([]); setLoading(false); setError(''); }
      return;
    }

    try {
      const [stationResult, creatorResult] = await Promise.allSettled([
        followService.getFollowingStations(),
        followService.getFollowingCreators(),
      ]);
      if (!isActive()) return;
      if (stationResult.status === 'rejected' && creatorResult.status === 'rejected') {
        throw new Error('Following could not load.');
      }

      const stations = stationResult.status === 'fulfilled' ? stationResult.value.data || [] : [];
      const creators = creatorResult.status === 'fulfilled' ? creatorResult.value.data || [] : [];
      setAccounts(followTargets(stations, creators));

      const ownerIds = [...new Set([
        ...creators.map(idOf),
        ...stations.map((station) => idOf(station.owner) || (typeof station.owner === 'string' ? station.owner : '')),
      ].filter(Boolean))].slice(0, 12);
      if (!ownerIds.length) {
        setTracks([]);
        setError('');
        return;
      }

      const results = await Promise.allSettled(ownerIds.map(
        (userId) => audioService.getAll({ userId, public: true, limit: 8 })
      ));
      if (!isActive()) return;
      const seen = new Set();
      const nextTracks = results
        .flatMap((result) => result.status === 'fulfilled' ? result.value.data || [] : [])
        .filter((track) => {
          const id = idOf(track);
          if (!id || seen.has(id) || excluded.has(id)) return false;
          seen.add(id);
          return true;
        })
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 8);
      setTracks(nextTracks);
      setError(results.every((result) => result.status === 'rejected') ? 'Recordings from followed creators could not load.' : '');
    } catch (loadError) {
      if (isActive()) setError(loadError?.message || 'Following could not load.');
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [excluded]);

  useEffect(() => {
    let active = true;
    const refresh = () => { void load(() => active); };
    refresh();
    window.addEventListener('echoo:following-changed', refresh);
    window.addEventListener('echoo:network-restored', refresh);
    return () => {
      active = false;
      window.removeEventListener('echoo:following-changed', refresh);
      window.removeEventListener('echoo:network-restored', refresh);
    };
  }, [load]);

  return (
    <section className="listener-v2-panel listener-v2-followed-panel">
      <header className="listener-v2-section-title">
        <h2>{showAccounts ? 'Following' : 'Recordings from followed creators'}</h2>
        {showAccounts && <button type="button" onClick={() => navigate('/listen/following')}>View all</button>}
      </header>

      {showAccounts && accounts.length > 0 && (
        <div className="listener-v2-followed-accounts" aria-label="People and Channels you follow">
          {accounts.slice(0, 5).map((account) => (
            <button type="button" key={account.key} className="listener-v2-followed-account"
              onClick={() => navigate(account.path)} aria-label={`Open ${account.name}`}>
              <span className="listener-v2-followed-account-art">
                {account.image ? <img src={buildMediaUrl(account.image)} alt="" /> : account.name.charAt(0).toUpperCase()}
              </span>
              <span>{account.name}</span>
            </button>
          ))}
        </div>
      )}

      {tracks.length > 0 ? (
        <div className="listener-v2-audio-list">
          {tracks.map((track) => (
            <article key={idOf(track)}>
              <span className="listener-v2-audio-art">{track.coverArt && <img src={track.coverArt} alt="" />}</span>
              <div><strong>{track.title}</strong><span>{track.artistName}</span></div>
              <button type="button" aria-label={`Play ${track.title}`} onClick={() => playTrack(track, tracks)}><FiPlay /></button>
            </article>
          ))}
        </div>
      ) : loading ? (
        <p role="status">Loading followed creators…</p>
      ) : error ? (
        <p role="alert">{error} <button className="listener-v2-inline-action" type="button" onClick={() => load()}>Try again</button></p>
      ) : accounts.length > 0 ? (
        <p className="listener-v2-followed-note">No other recordings from the creators you follow are available here yet.</p>
      ) : (
        <p>You’re not following any creators or Channels yet. <button className="listener-v2-inline-action" type="button" onClick={() => navigate('/listen/search')}>Find creators</button></p>
      )}
    </section>
  );
}
