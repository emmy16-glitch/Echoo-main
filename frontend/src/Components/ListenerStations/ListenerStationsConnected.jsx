import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaChevronDown,
  FaFilter,
  FaHeadphones,
  FaPlay,
  FaSearch,
  FaUsers,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import followService from '../../services/followService';
import '../../styles/listener-reference-pages.css';

const STATION_SYNC_INTERVAL_MS = 15000;

const ListenerStationsConnected = () => {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [liveOnly, setLiveOnly] = useState(false);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [sort, setSort] = useState('featured');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setFailed(false);
      if (!silent) setError('');

      const [stationResult, followedResult] = await Promise.allSettled([
        batch3Service.getStations(),
        followService.getFollowingStations(),
      ]);

      if (stationResult.status !== 'fulfilled') throw stationResult.reason;

      const realStations = Array.isArray(stationResult.value?.data)
        ? stationResult.value.data.filter(
            (station) => station?.id && station.isPublic !== false
          )
        : [];
      setStations(realStations);

      if (followedResult.status === 'fulfilled') {
        setFollowingIds(
          new Set(
            (followedResult.value?.data || [])
              .filter((station) => station?.id)
              .map((station) => String(station.id))
          )
        );
      }
    } catch (loadError) {
      console.error('Real stations:', loadError);
      if (!silent) setFailed(true);
      setError(loadError?.message || 'Stations could not be loaded.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, STATION_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const categories = useMemo(() => {
    const values = Array.from(
      new Set(stations.map((station) => station.category).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return ['All', ...values];
  }, [stations]);

  useEffect(() => {
    if (!categories.includes(category)) setCategory('All');
  }, [categories, category]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = stations.filter((station) => {
      const matchesTerm = !term ||
        station.name?.toLowerCase().includes(term) ||
        station.category?.toLowerCase().includes(term) ||
        station.description?.toLowerCase().includes(term) ||
        station.ownerName?.toLowerCase().includes(term) ||
        station.tags?.some((tag) => String(tag).toLowerCase().includes(term));
      const matchesCategory = category === 'All' || station.category === category;
      const matchesLive = !liveOnly || station.isLive;
      const matchesFollowing = !followingOnly || followingIds.has(String(station.id));
      return matchesTerm && matchesCategory && matchesLive && matchesFollowing;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      if (sort === 'listeners') return Number(b.listenerCount || 0) - Number(a.listenerCount || 0);
      if (sort === 'followers') return Number(b.followerCount || 0) - Number(a.followerCount || 0);
      return Number(b.isLive) - Number(a.isLive) ||
        Number(b.listenerCount || 0) - Number(a.listenerCount || 0);
    });
  }, [stations, query, category, liveOnly, followingOnly, followingIds, sort]);

  const toggleFollow = async (station) => {
    if (!station?.id || actionId) return;
    const key = String(station.id);
    const isFollowing = followingIds.has(key);

    try {
      setActionId(key);
      setError('');
      const response = isFollowing
        ? await followService.unfollowStation(station.id)
        : await followService.followStation(station.id);

      setFollowingIds((current) => {
        const next = new Set(current);
        if (isFollowing) next.delete(key);
        else next.add(key);
        return next;
      });

      const followerCount = Number(
        response?.station?.followerCount ?? response?.followerCount
      );
      if (Number.isFinite(followerCount)) {
        setStations((current) =>
          current.map((item) =>
            String(item.id) === key ? { ...item, followerCount } : item
          )
        );
      }
    } catch (followError) {
      setError(followError?.message || 'Could not update station follow status.');
    } finally {
      setActionId('');
    }
  };

  const listenLive = async (station) => {
    try {
      const response = await batch3Service.getLiveBroadcastForStation(station.id);
      if (response?.data?.id) {
        navigate(`/listen/live/${response.data.id}`);
        return;
      }
    } catch {
      // If a broadcast ends between refreshes, the station profile is still valid.
    }
    navigate(`/listen/stations/${station.id}`);
  };

  if (!loading && failed) {
    return (
      <main className="echoo-reference-page ref-stations-page">
        <div className="ref-state-card">
          <FaHeadphones />
          <strong>Stations could not be loaded.</strong>
          <span>{error || 'Echoo could not reach the Station service.'}</span>
          <button type="button" onClick={() => load()}>Try again</button>
        </div>
      </main>
    );
  }

  return (
    <main className="echoo-reference-page ref-stations-page">
      <header className="ref-page-heading ref-stations-heading">
        <div>
          <span className="ref-kicker">STATIONS DIRECTORY</span>
          <h1>Voices with a home.</h1>
          <p>Public stations exactly as their creators configured them.</p>
        </div>

        <div className="ref-station-tools">
          <label className="ref-search-control">
            <FaSearch />
            <input
              value={query}
              placeholder="Search stations..."
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="ref-filter-wrap">
            <button
              type="button"
              className={`ref-filter-button ${filtersOpen ? 'active' : ''}`}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <FaFilter /> Filters <FaChevronDown />
            </button>
            {filtersOpen && (
              <div className="ref-filter-popover">
                <label>
                  <input
                    type="checkbox"
                    checked={liveOnly}
                    onChange={(event) => setLiveOnly(event.target.checked)}
                  />
                  Live now only
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={followingOnly}
                    onChange={(event) => setFollowingOnly(event.target.checked)}
                  />
                  Stations I follow
                </label>
                <label className="ref-filter-select">
                  <span>Sort by</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="featured">Live & popular</option>
                    <option value="listeners">Listeners</option>
                    <option value="followers">Followers</option>
                    <option value="name">Name</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="ref-category-tabs" aria-label="Station categories">
        {categories.map((item) => (
          <button
            type="button"
            key={item}
            className={category === item ? 'active' : ''}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {error && !failed && <div className="ref-inline-error">{error}</div>}

      {loading ? (
        <div className="ref-station-grid ref-loading-grid" aria-label="Loading stations">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="ref-station-skeleton" key={index} />
          ))}
        </div>
      ) : visible.length ? (
        <section className="ref-station-grid">
          {visible.map((station) => {
            const key = String(station.id);
            const isFollowing = followingIds.has(key);
            const artwork = station.brandCover || station.coverArt || station.logo || null;
            const description = station.description?.trim() ||
              (station.ownerName ? `Public station by ${station.ownerName}.` : 'Public Echoo station.');

            return (
              <article className="ref-station-card" key={station.id}>
                <button
                  type="button"
                  className="ref-station-art"
                  aria-label={`Open ${station.name}`}
                  onClick={() => navigate(`/listen/stations/${station.id}`)}
                >
                  {artwork ? <img src={artwork} alt="" /> : <FaHeadphones />}
                  {station.isLive && (
                    <span className="ref-live-chip"><i /> LIVE NOW</span>
                  )}
                </button>

                <div className="ref-station-card-body">
                  <span className="ref-card-category">{station.category || 'Other'}</span>
                  <h2>{station.name}</h2>
                  <p>{description}</p>

                  <div className="ref-station-metrics">
                    <span><FaHeadphones /> {Number(station.listenerCount) || 0} listening</span>
                    <span><FaUsers /> {Number(station.followerCount) || 0} followers</span>
                  </div>

                  <div className="ref-station-actions">
                    <button
                      type="button"
                      onClick={() => station.isLive
                        ? listenLive(station)
                        : navigate(`/listen/stations/${station.id}`)}
                    >
                      {station.isLive ? <><FaPlay /> Listen live</> : 'View station'}
                    </button>
                    <button
                      type="button"
                      className={isFollowing ? 'following' : 'follow'}
                      disabled={actionId === key}
                      onClick={() => toggleFollow(station)}
                    >
                      {actionId === key
                        ? 'Updating...'
                        : isFollowing
                          ? 'Following'
                          : 'Follow'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="ref-state-card compact">
          <FaSearch />
          <strong>No stations found.</strong>
          <span>
            {stations.length === 0
              ? 'There are no public stations available yet.'
              : 'Try another category, search term, or filter.'}
          </span>
        </div>
      )}
    </main>
  );
};

export default ListenerStationsConnected;
