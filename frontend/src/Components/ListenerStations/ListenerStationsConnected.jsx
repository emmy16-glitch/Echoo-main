import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight, FaHeadphones, FaPlay, FaSearch, FaSlidersH, FaTimes, FaUsers } from 'react-icons/fa';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding.js';
import { buildMediaUrl } from '../../services/api';
import batch2Service from '../../services/batch2Service';
import realtimeService from '../../services/realtimeService';
import followService from '../../services/followService';
import echooMark from '../Assets/echoo-logo-official.svg';
import './ListenerStations.css';

const PAGE_SIZE = 8;
const formatCount = (value) => {
  const count = Math.max(0, Number(value) || 0);
  return count >= 1000 ? `${Number((count / 1000).toFixed(1))}K` : String(Math.floor(count));
};
const idOf = (station) => String(station?.id || station?._id || '');
const coverOf = (station) => buildMediaUrl(station?.brandCover || station?.coverArt || buildGeneratedStationBrandCoverUrl(station));

const Artwork = ({ station }) => coverOf(station)
  ? <img src={coverOf(station)} alt="" loading="lazy" />
  : <img src={echooMark} alt="" className="stations-fallback-mark" />;

const ListenerStationsConnected = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchInputRef = useRef(null);
  const [stations, setStations] = useState([]);
  const [topStations, setTopStations] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(searchParams.get('category') || 'All');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('followers');
  const [page, setPage] = useState(1);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setFailed(false);
      const [stationResult, followedResult] = await Promise.allSettled([
        batch2Service.listStations({ page: 1, limit: 100 }),
        followService.getFollowingStations(),
      ]);
      if (stationResult.status === 'rejected') throw stationResult.reason;
      const list = (Array.isArray(stationResult.value?.data) ? stationResult.value.data : [])
        .filter((station) => idOf(station) && station.isPublic !== false);
      setStations(list);
      setTopStations([...list].sort((a, b) => Number(b.followerCount || 0) - Number(a.followerCount || 0)).slice(0, 4));
      if (followedResult.status === 'fulfilled') setFollowingIds(new Set((followedResult.value?.data || []).map(idOf).filter(Boolean)));
    } catch (loadError) {
      if (!silent) setFailed(true);
      setError(loadError?.message || 'Stations could not be loaded.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, 15000);
    window.addEventListener('focus', sync);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', sync); };
  }, [load]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    realtimeService.subscribeToCatalog((event) => {
      if (!event?.entity || ['broadcast', 'station'].includes(event.entity)) load({ silent: true });
    }).then((cleanup) => { if (active) unsubscribe = cleanup; else cleanup(); }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [load]);

  useEffect(() => {
    const focusSearch = (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault(); searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(stations.map((station) => station.category).filter(Boolean))).sort()], [stations]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = stations.filter((station) => {
      const matchesTerm = !term || [station.name, station.description, station.category, ...(station.tags || [])].some((value) => String(value || '').toLowerCase().includes(term));
      const matchesCategory = category === 'All' || station.category === category;
      const matchesStatus = status === 'all' || (status === 'live' ? station.isLive : !station.isLive);
      return matchesTerm && matchesCategory && matchesStatus;
    });
    return [...list].sort((a, b) => sortBy === 'listeners'
      ? Number(b.listenerCount || 0) - Number(a.listenerCount || 0)
      : sortBy === 'live'
        ? Number(b.isLive) - Number(a.isLive)
        : Number(b.followerCount || 0) - Number(a.followerCount || 0));
  }, [stations, search, category, status, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, category, status, sortBy]);

  const toggleFollow = async (station) => {
    const key = idOf(station);
    if (!key || actionId) return;
    const isFollowing = followingIds.has(key);
    try {
      setActionId(key);
      setError('');
      const response = isFollowing ? await followService.unfollowStation(key) : await followService.followStation(key);
      setFollowingIds((current) => {
        const next = new Set(current);
        if (isFollowing) next.delete(key); else next.add(key);
        return next;
      });
      const followerCount = Number(response?.station?.followerCount ?? response?.followerCount);
      if (Number.isFinite(followerCount)) {
        const patch = (list) => list.map((item) => idOf(item) === key ? { ...item, followerCount } : item);
        setStations(patch); setTopStations(patch);
      }
    } catch (followError) {
      setError(followError?.message || 'Could not update follow status.');
    } finally { setActionId(''); }
  };

  if (!loading && failed) {
    return <div className="stations-page"><div className="stations-empty"><FaHeadphones /><strong>Stations could not be loaded</strong><p>{error}</p><button type="button" onClick={() => load()}>Try again</button></div></div>;
  }

  return (
    <div className="stations-page">
      <header className="stations-heading">
        <h1>Stations</h1>
        <p>Discover live stations and incredible creators around the world.</p>
      </header>

      <div className="stations-categories" aria-label="Station categories">
        {categories.map((item) => <button type="button" key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)} aria-pressed={category === item}>{item === 'All' ? 'All stations' : item}</button>)}
      </div>

      <div className="stations-filter-row">
        <label className="stations-search">
          <FaSearch aria-hidden="true" />
          <span className="sr-only">Search stations</span>
          <input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stations" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear station search"><FaTimes /></button>}
        </label>
        <label className="stations-select"><FaSlidersH /><span className="sr-only">Station status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All stations</option><option value="live">Live now</option><option value="offline">Not live</option></select></label>
        <label className="stations-select"><span className="sr-only">Sort stations</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="followers">Top stations</option><option value="listeners">Most listeners</option><option value="live">Live first</option></select></label>
      </div>

      <section className="stations-section">
        <header className="stations-section-header"><h2>Top stations</h2><button type="button" onClick={() => { setSortBy('followers'); setCategory('All'); }}>View all</button></header>
        {loading ? <div className="stations-top-skeleton"><span /><span /><span /><span /></div> : topStations.length ? (
          <div className="stations-top-grid">
            {topStations.map((station, index) => (
              <article className="stations-top-card" key={idOf(station)}>
                <button type="button" className="stations-top-art" onClick={() => navigate(`/listen/stations/${idOf(station)}`)}>
                  <Artwork station={station} />
                  <span className="stations-rank">{index + 1}</span>
                  <span className="stations-top-overlay"><strong>{station.name || 'Unnamed station'}</strong><small>{station.category || 'Station'} · {formatCount(station.followerCount)} followers</small></span>
                  <i className="stations-top-play" aria-hidden="true"><FaPlay /></i>
                </button>
              </article>
            ))}
          </div>
        ) : <div className="stations-empty stations-empty-compact"><FaHeadphones /><strong>Top stations will appear here</strong></div>}
      </section>

      <section className="stations-section">
        <header className="stations-section-header"><h2>Explore stations</h2><span>{filtered.length} station{filtered.length === 1 ? '' : 's'}</span></header>
        {error && <div className="stations-error" role="alert">{error}</div>}
        {loading ? <div className="stations-grid stations-card-skeleton">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div> : visible.length ? (
          <div className="stations-grid">
            {visible.map((station) => {
              const following = followingIds.has(idOf(station));
              return (
                <article className="station-card" key={idOf(station)}>
                  <button type="button" className="station-card-art" onClick={() => navigate(`/listen/stations/${idOf(station)}`)}>
                    <Artwork station={station} />
                    {station.isLive && <span className="station-live"><i /> LIVE</span>}
                  </button>
                  <div className="station-card-copy">
                    <strong>{station.name || 'Unnamed station'}</strong>
                    <span>{station.creator?.displayName || station.owner?.displayName || station.category || 'Echoo creator'}</span>
                    <small>{station.category || 'Station'} · {formatCount(station.followerCount)} followers</small>
                    {station.isLive && <small className="station-listeners"><FaUsers /> {formatCount(station.listenerCount)} listening</small>}
                  </div>
                  <button type="button" className={following ? 'station-follow following' : 'station-follow'} onClick={() => toggleFollow(station)} disabled={actionId === idOf(station)} aria-pressed={following}>{following ? 'Following' : 'Follow'}</button>
                </article>
              );
            })}
          </div>
        ) : <div className="stations-empty"><FaSearch /><strong>No stations found</strong><p>Try another search or clear the filters.</p><button type="button" onClick={() => { setSearch(''); setCategory('All'); setStatus('all'); }}>Clear filters</button></div>}

        {totalPages > 1 && <nav className="stations-pagination" aria-label="Stations pages"><button type="button" disabled={safePage === 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page"><FaChevronLeft /></button><span>Page {safePage} of {totalPages}</span><button type="button" disabled={safePage === totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Next page"><FaChevronRight /></button></nav>}
      </section>
    </div>
  );
};

export default ListenerStationsConnected;
