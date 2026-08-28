import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaArrowRight,
  FaBroadcastTower,
  FaFilter,
  FaFire,
  FaHeadphones,
  FaPlus,
  FaSearch,
  FaTimes,
  FaUsers,
} from 'react-icons/fa';
import batch2Service from '../../services/batch2Service';
import followService from '../../services/followService';
import { useCreatorStudioState } from './CreatorStudioState';
import './CreatorDiscoverWorkspace.css';

const idOf = (value) => String(value?.id || value?._id || '');
const formatCount = (value) => {
  const count = Math.max(0, Number(value) || 0);
  return count >= 1000 ? `${Number((count / 1000).toFixed(1))}K` : String(Math.floor(count));
};

const StationArtwork = ({ station }) => (
  (station.coverArt || station.brandCover)
    ? <img src={station.coverArt || station.brandCover} alt={`${station.name} artwork`} loading="lazy" />
    : <span className="creator-discover-artwork-fallback"><FaBroadcastTower aria-hidden="true" /></span>
);

export default function CreatorDiscoverWorkspace({ onNavigate }) {
  const { currentUser, publicStations, loading, refresh } = useCreatorStudioState();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [filteredStations, setFilteredStations] = useState(null);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const queryTimer = useRef(null);

  useEffect(() => {
    let active = true;
    followService.getFollowingStations()
      .then((response) => {
        if (active) setFollowingIds(new Set((response?.data || []).map(idOf).filter(Boolean)));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    window.clearTimeout(queryTimer.current);
    const trimmed = query.trim();
    if (!trimmed && category === 'All categories') {
      setFilteredStations(null);
      return undefined;
    }

    queryTimer.current = window.setTimeout(() => {
      batch2Service.listStations({
        page: 1,
        limit: 100,
        search: trimmed || undefined,
        category: category === 'All categories' ? undefined : category,
      }).then((response) => setFilteredStations(response?.data || []))
        .catch((requestError) => setError(requestError?.message || 'Could not search public stations.'));
    }, 220);
    return () => window.clearTimeout(queryTimer.current);
  }, [category, query]);

  const stations = filteredStations || publicStations;
  const categories = useMemo(() => {
    const counts = new Map();
    publicStations.forEach((station) => {
      const name = station.category || 'Other';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [publicStations]);
  const live = stations.filter((station) => station.isLive);
  const popular = [...stations]
    .sort((a, b) => Number(b.listenerCount || b.followerCount || 0) - Number(a.listenerCount || a.followerCount || 0))
    .slice(0, 5);
  const rising = [...stations]
    .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0))
    .slice(0, 5);
  const creators = useMemo(() => {
    const seen = new Map();
    stations.forEach((station) => {
      const owner = station.owner || {};
      const ownerId = idOf(owner) || station.ownerId;
      if (ownerId && ownerId !== idOf(currentUser) && !seen.has(ownerId)) seen.set(ownerId, owner);
    });
    return [...seen.entries()].slice(0, 5);
  }, [currentUser, stations]);
  const topics = useMemo(() => [...new Set(stations.flatMap((station) => station.tags || []))].slice(0, 6), [stations]);

  const toggleFollow = async (station) => {
    const stationId = idOf(station);
    if (!stationId || actionId) return;
    const following = followingIds.has(stationId);
    try {
      setActionId(stationId);
      setError('');
      const result = following
        ? await followService.unfollowStation(stationId)
        : await followService.followStation(stationId);
      setFollowingIds((current) => {
        const next = new Set(current);
        if (following) next.delete(stationId); else next.add(stationId);
        return next;
      });
      const followerCount = Number(result?.station?.followerCount ?? result?.followerCount);
      if (Number.isFinite(followerCount)) await refresh({ silent: true });
    } catch (followError) {
      setError(followError?.message || 'Could not update this follow status.');
    } finally {
      setActionId('');
    }
  };

  const card = (station) => {
    const stationId = idOf(station);
    const isFollowing = followingIds.has(stationId);
    return (
      <article className="creator-discover-card" key={stationId}>
        <div className="creator-discover-art">
          <StationArtwork station={station} />
          {station.isLive && <span>LIVE</span>}
        </div>
        <div className="creator-discover-card-copy">
          <strong>{station.name}</strong>
          <small>{station.ownerName || station.owner?.displayName || station.category || 'Echoo Creator'}</small>
          <em><FaHeadphones /> {formatCount(station.listenerCount)} listening</em>
        </div>
        <button type="button" className={isFollowing ? 'following' : ''} disabled={actionId === stationId} onClick={() => toggleFollow(station)}>
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      </article>
    );
  };

  return (
    <div className="creator-discover" aria-busy={loading}>
      <div className="creator-discover-main">
        <header className="creator-discover-heading">
          <h1>Discover <FaBroadcastTower aria-hidden="true" /></h1>
          <p>Explore live conversations and audio communities across Echoo.</p>
        </header>

        <div className="creator-discover-searchbar">
          <label>
            <FaSearch aria-hidden="true" />
            <span className="sr-only">Search public stations</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stations, creators, topics..." />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><FaTimes /></button>}
          </label>
          <label>
            <span className="sr-only">Station category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option>All categories</option>
              {categories.map(([name]) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => { setQuery(''); setCategory('All categories'); }}><FaFilter /> Filters</button>
        </div>

        {error && <p className="creator-discover-error" role="alert">{error}</p>}

        <section className="creator-discover-section creator-discover-live">
          <header><h2>Live now <span>{live.length} live station{live.length === 1 ? '' : 's'}</span></h2><button type="button" onClick={() => { setQuery(''); setCategory('All categories'); setFilteredStations(live); }}>View all live <FaArrowRight /></button></header>
          {live.length ? <div className="creator-discover-live-grid">{live.slice(0, 5).map(card)}</div> : <div className="creator-discover-empty"><FaBroadcastTower /><strong>No stations are live right now.</strong><span>Browse public stations below and follow creators you want to hear from.</span></div>}
        </section>

        <div className="creator-discover-columns">
          <section className="creator-discover-section"><header><h2>Popular stations</h2><span>This week</span></header>{popular.length ? <ol className="creator-discover-list">{popular.map((station, index) => <li key={idOf(station)}><b>{index + 1}</b><StationArtwork station={station} /><div><strong>{station.name}</strong><small>{station.category || 'Station'}</small></div><span><FaHeadphones /> {formatCount(station.listenerCount || station.followerCount)}</span><button type="button" onClick={() => toggleFollow(station)}>{followingIds.has(idOf(station)) ? 'Following' : 'Follow'}</button></li>)}</ol> : <div className="creator-discover-empty compact">Public stations will appear here.</div>}</section>
          <section className="creator-discover-section"><header><h2>New &amp; rising</h2><button type="button" onClick={() => { setQuery(''); setCategory('All categories'); }}>View all <FaArrowRight /></button></header>{rising.length ? <ol className="creator-discover-list creator-discover-rising">{rising.map((station) => <li key={idOf(station)}><StationArtwork station={station} /><div><strong>{station.name}</strong><small>{station.category || 'Station'} · {formatCount(station.listenerCount)} listeners</small></div><button type="button" aria-label={`Follow ${station.name}`} onClick={() => toggleFollow(station)}><FaPlus /></button></li>)}</ol> : <div className="creator-discover-empty compact">New public stations will appear here.</div>}</section>
        </div>

        <section className="creator-discover-explore"><FaUsers /><div><h2>Explore all stations</h2><p>Find more creators, live conversations, and shows across Echoo.</p></div><button type="button" onClick={() => { setQuery(''); setCategory('All categories'); }}>Explore all stations <FaArrowRight /></button></section>
      </div>

      <aside className="creator-discover-side" aria-label="Discover more">
        <section><header><h2>Who to follow</h2><span>From Echoo</span></header>{creators.length ? creators.map(([creatorId, creator]) => <article className="creator-discover-person" key={creatorId}><div>{creator.avatar ? <img src={creator.avatar} alt="" /> : <FaUsers />}</div><p><strong>{creator.displayName || creator.username || 'Echoo Creator'}</strong><small>{creator.username ? `@${creator.username}` : 'Creator'}</small></p></article>) : <p className="creator-discover-side-empty">Creators will appear as stations are published.</p>}</section>
        <section><header><h2>Browse by category</h2></header><div className="creator-discover-categories">{categories.map(([name, count]) => <button type="button" key={name} onClick={() => setCategory(name)}><i><FaBroadcastTower /></i><strong>{name}</strong><span>{count} station{count === 1 ? '' : 's'}</span></button>)}</div></section>
        {topics.length > 0 && <section><header><h2>Trending topics</h2></header><ul className="creator-discover-topics">{topics.map((topic) => <li key={topic}><FaFire /> {topic}</li>)}</ul></section>}
      </aside>
    </div>
  );
}
