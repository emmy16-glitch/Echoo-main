import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBell,
  FaChevronLeft,
  FaChevronRight,
  FaEllipsisH,
  FaHeadphones,
  FaList,
  FaPlus,
  FaSearch,
  FaSlidersH,
  FaTimes,
  FaThLarge,
  FaTrophy,
} from 'react-icons/fa';

import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding.js';

import batch2Service from '../../services/batch2Service';
import followService from '../../services/followService';
import './ListenerStations.css';

const PAGE_SIZE = 8;
const CLUSTER_COUNT = 6;
const HERO_CLUSTER_CIRCLE = {
  0: { size: 58, top: '8%', left: '40%' },
  1: { size: 52, top: '2%', left: '60%' },
  2: { size: 72, top: '24%', left: '56%' },
  3: { size: 60, top: '34%', left: '38%' },
  4: { size: 50, top: '38%', left: '68%' },
  5: { size: 44, top: '52%', left: '46%' },
};

const formatCount = (value) => {
  const n = Number(value) || 0;
  if (n >= 1000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return String(n);
};

const ListenerStationsConnected = () => {
  const navigate = useNavigate();
  const listRef = useRef(null);

  const stationCover = (station) =>
    station?.brandCover ||
    station?.coverArt ||
    (station?.branding?.mode === 'generated' ? buildGeneratedStationBrandCoverUrl(station) : null);

  const [allStations, setAllStations] = useState([]);
  const [total, setTotal] = useState(0);
  const [topStations, setTopStations] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('followers');
  const [view, setView] = useState('list');

  const [pendingCategory, setPendingCategory] = useState('All');
  const [pendingStatus, setPendingStatus] = useState('all');
  const [pendingSort, setPendingSort] = useState('followers');
  const [pendingSearch, setPendingSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setFailed(false);
      if (!silent) setError('');

      const [stationResult, topResult, followedResult] = await Promise.allSettled([
        batch2Service.listStations({ page: 1, limit: 100 }),
        batch2Service.listStations({ page: 1, limit: 8 }),
        followService.getFollowingStations(),
      ]);

      if (stationResult.status !== 'fulfilled') throw stationResult.reason;
      const realStations = Array.isArray(stationResult.value?.data)
        ? stationResult.value.data.filter(
            (station) => station?.id && station.isPublic !== false
          )
        : [];
      setAllStations(realStations);
      setTotal(Number(stationResult.value?.pagination?.total) || realStations.length);

      if (topResult.status === 'fulfilled' && Array.isArray(topResult.value?.data)) {
        const ordered = [...topResult.value.data]
          .filter((station) => station?.id)
          .sort(
            (a, b) => Number(b.followerCount || 0) - Number(a.followerCount || 0)
          )
          .slice(0, 5);
        setTopStations(ordered);
      }

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
    const interval = window.setInterval(sync, 15000);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const categories = useMemo(() => {
    const values = Array.from(
      new Set(allStations.map((station) => station.category).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return ['All', ...values];
  }, [allStations]);

  useEffect(() => {
    if (!categories.includes(category)) setCategory('All');
  }, [categories, category]);

  const applied = useMemo(() => {
    const term = pendingSearch.trim().toLowerCase();
    const list = allStations.filter((station) => {
      const matchesTerm =
        !term ||
        station.name?.toLowerCase().includes(term) ||
        station.description?.toLowerCase().includes(term) ||
        station.category?.toLowerCase().includes(term) ||
        station.tags?.some((tag) => String(tag).toLowerCase().includes(term));
      const matchesCategory =
        pendingCategory === 'All' || station.category === pendingCategory;
      const matchesStatus =
        pendingStatus === 'all' ||
        (pendingStatus === 'live' && station.isLive) ||
        (pendingStatus === 'offline' && !station.isLive);
      return matchesTerm && matchesCategory && matchesStatus;
    });

    return [...list].sort((a, b) => {
      if (pendingSort === 'followers') {
        return Number(b.followerCount || 0) - Number(a.followerCount || 0);
      }
      if (pendingSort === 'listening') {
        return Number(b.listenerCount || 0) - Number(a.listenerCount || 0);
      }
      return Number(b.isLive) - Number(a.isLive) ||
        Number(b.listenerCount || 0) - Number(a.listenerCount || 0);
    });
  }, [allStations, pendingSearch, pendingCategory, pendingStatus, pendingSort]);

  const totalPages = Math.max(1, Math.ceil(applied.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => applied.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [applied, safePage]
  );

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const heroCluster = useMemo(
    () =>
      [...topStations]
        .concat([...allStations])
        .filter((station, index, self) => index === self.findIndex((item) => item.id === station.id))
        .filter((station) => station?.id)
        .slice(0, CLUSTER_COUNT),
    [topStations, allStations]
  );

  const applyFilters = () => {
    setCategory(pendingCategory);
    setStatus(pendingStatus);
    setSortBy(pendingSort);
    setFiltersOpen(false);
    setPage(1);
    if (listRef.current) {
      listRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const clearAll = () => {
    setPendingCategory('All');
    setPendingStatus('all');
    setPendingSort('followers');
    setPendingSearch('');
    setSearch('');
  };

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
        const patch = (list) =>
          list.map((item) =>
            String(item.id) === key ? { ...item, followerCount } : item
          );
        setAllStations(patch);
        setTopStations(patch);
      }
    } catch (followError) {
      setError(followError?.message || 'Could not update station follow status.');
    } finally {
      setActionId('');
    }
  };

  const openStation = (station) => {
    if (station.isLive) {
      batch2Service
        .getLiveBroadcast(station.id)
        .then((response) => {
          if (response?.data?.id) navigate(`/listen/live/${response.data.id}`);
          else navigate(`/listen/stations/${station.id}`);
        })
        .catch(() => navigate(`/listen/stations/${station.id}`));
    } else {
      navigate(`/listen/stations/${station.id}`);
    }
  };

  const scrollToExplore = () => {
    if (listRef.current) {
      listRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const pageNumbers = useMemo(() => {
    const numbers = [];
    if (totalPages <= 7) {
      for (let index = 1; index <= totalPages; index += 1) numbers.push(index);
    } else {
      numbers.push(1);
      if (safePage > 3) numbers.push('...');
      const start = Math.max(2, safePage - 1);
      const end = Math.min(totalPages - 1, safePage + 1);
      for (let index = start; index <= end; index += 1) numbers.push(index);
      if (safePage < totalPages - 2) numbers.push('...');
      numbers.push(totalPages);
    }
    return numbers;
  }, [totalPages, safePage]);

  if (!loading && failed) {
    return (
      <main className="ls-page">
        <div className="ls-state-card">
          <FaHeadphones />
          <strong>Stations could not be loaded.</strong>
          <span>{error || 'Echoo could not reach the Station service.'}</span>
          <button type="button" className="ls-btn-primary" onClick={() => load()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="ls-page">
      <header className="ls-header">
        <div className="ls-header-text">
          <h1>Stations</h1>
          <p>Browse and follow stations from creators across Echoo.</p>
        </div>
        <div className="ls-header-actions">
          <label className="ls-search-field ls-search-large">
            <FaSearch className="ls-search-icon" />
            <input
              type="text"
              value={pendingSearch}
              placeholder="Search stations, shows or audio..."
              aria-label="Search stations"
              onChange={(event) => setPendingSearch(event.target.value)}
            />
            {pendingSearch && (
              <button
                type="button"
                className="ls-search-clear"
                aria-label="Clear search"
                onClick={() => setPendingSearch('')}
              >
                <FaTimes />
              </button>
            )}
            <span className="ls-k-chip" aria-hidden>
              K
            </span>
          </label>
          <button
            type="button"
            className="ls-icon-btn"
            aria-label="Notifications"
            onClick={() => navigate('/listen/notifications')}
          >
            <FaBell />
            <span className="ls-badge" aria-hidden />
          </button>
        </div>
      </header>

      <div className="ls-chips" aria-label="Station categories">
        {categories.map((item) => (
          <button
            type="button"
            key={item}
            className={`ls-chip ${category === item ? 'active' : ''}`}
            onClick={() => setCategory(item)}
          >
            {item === 'All' ? 'All stations' : item}
          </button>
        ))}
        <button
          type="button"
          className="ls-chip ls-chip-more"
          aria-label="More categories"
          onClick={() => {
            if (listRef.current) {
              listRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
        >
          <FaChevronRight />
        </button>
      </div>

      <section className="ls-hero" aria-label="Explore stations">
        <div className="ls-hero-content">
          <h2>
            Your next favorite voice is <span>here.</span>
          </h2>
          <p>Follow stations and get notified when they go live.</p>
          <button type="button" className="ls-btn-primary" onClick={scrollToExplore}>
            Explore stations
          </button>
        </div>
        <div className="ls-hero-cluster" aria-hidden>
          {heroCluster.map((station, index) => {
            const style = HERO_CLUSTER_CIRCLE[index % CLUSTER_COUNT];
            const art = stationCover(station);
            return (
              <span
                key={station.id}
                className="ls-cluster-circle"
                style={{
                  width: style.size,
                  height: style.size,
                  top: style.top,
                  left: style.left,
                }}
              >
                {art ? (
                  <img src={art} alt="" aria-hidden loading="lazy" />
                ) : (
                  <FaHeadphones />
                )}
              </span>
            );
          })}
        </div>
      </section>

      <section className="ls-body" ref={listRef}>
        <div className="ls-main">
          <header className="ls-section-header">
            <h2>All stations</h2>
            <div className="ls-section-tools">
              <label className="ls-search-field">
                <FaSearch className="ls-search-icon" />
                <input
                  type="text"
                  value={search}
                  placeholder="Search stations..."
                  aria-label="Search stations"
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
                {search && (
                  <button
                    type="button"
                    className="ls-search-clear"
                    aria-label="Clear search"
                    onClick={() => setSearch('')}
                  >
                    <FaTimes />
                  </button>
                )}
              </label>
              <select
                className="ls-select"
                value={sortBy}
                aria-label="Sort stations"
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="followers">Most followers</option>
                <option value="listening">Most listening now</option>
                <option value="live">Live &amp; popular</option>
              </select>
              <div className="ls-view-toggle" role="group" aria-label="View style">
                <button
                  type="button"
                  className={view === 'list' ? 'active' : ''}
                  aria-pressed={view === 'list'}
                  aria-label="List view"
                  onClick={() => setView('list')}
                >
                  <FaList />
                </button>
                <button
                  type="button"
                  className={view === 'grid' ? 'active' : ''}
                  aria-pressed={view === 'grid'}
                  aria-label="Grid view"
                  onClick={() => setView('grid')}
                >
                  <FaThLarge />
                </button>
              </div>
            </div>
          </header>

          {loading ? (
            <div className={`ls-list ${view}`}>
              {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                <div className="ls-row ls-row-skeleton" key={index} />
              ))}
            </div>
          ) : paged.length === 0 ? (
            <div className="ls-state-card compact">
              <FaSearch />
              <strong>No stations found.</strong>
              <span>
                {allStations.length === 0
                  ? 'There are no public stations available yet.'
                  : 'Try another category, search term, or filter.'}
              </span>
            </div>
          ) : (
            <div className={`ls-list ${view}`}>
              {paged.map((station) => {
                const key = String(station.id);
                const isFollowing = followingIds.has(key);
                const art = stationCover(station);
                const description =
                  station.description?.trim() ||
                  (station.owner?.displayName
                    ? `Public station by ${station.owner.displayName}.`
                    : 'Public Echoo station.');
                return (
                  <article className="ls-row" key={station.id}>
                    <button
                      type="button"
                      className="ls-row-art"
                      aria-label={`Open ${station.name}`}
                      onClick={() => openStation(station)}
                    >
                      {art ? (
                        <img src={art} alt="" aria-hidden loading="lazy" />
                      ) : (
                        <FaHeadphones />
                      )}
                      {station.isLive && (
                        <span className="ls-live-chip" aria-hidden>
                          <i /> LIVE
                        </span>
                      )}
                    </button>
                    <div className="ls-row-info">
                      <button
                        type="button"
                        className="ls-row-name"
                        onClick={() => openStation(station)}
                      >
                        {station.name}
                      </button>
                      <span className="ls-row-category">
                        {station.category || 'Other'}
                      </span>
                      <span className="ls-row-description">{description}</span>
                    </div>
                    <div className="ls-row-stats">
                      <span className="ls-stat">
                        <strong>{formatCount(station.followerCount)}</strong>
                        <span>Followers</span>
                      </span>
                      <span className="ls-stat">
                        <strong>{formatCount(station.listenerCount)}</strong>
                        <span>Listening now</span>
                      </span>
                    </div>
                    <div className="ls-row-actions">
                      <button
                        type="button"
                        className="ls-follow-btn"
                        disabled={actionId === key}
                        onClick={() => toggleFollow(station)}
                      >
                        <FaPlus />
                        {actionId === key
                          ? 'Updating...'
                          : isFollowing
                            ? 'Following'
                            : 'Follow'}
                      </button>
                      <button
                        type="button"
                        className="ls-more-btn"
                        aria-label={`More options for ${station.name}`}
                        onClick={() => openStation(station)}
                      >
                        <FaEllipsisH />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!loading && totalPages > 1 && (
            <nav className="ls-pagination" aria-label="Stations pages">
              <button
                type="button"
                className="ls-page-btn"
                aria-label="Previous page"
                disabled={safePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <FaChevronLeft />
              </button>
              {pageNumbers.map((value) =>
                value === '...' ? (
                  <span className="ls-page-ellipsis" key="ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    type="button"
                    key={value}
                    className={`ls-page-btn ${value === safePage ? 'active' : ''}`}
                    aria-current={value === safePage ? 'page' : undefined}
                    onClick={() => setPage(value)}
                  >
                    {value}
                  </button>
                )
              )}
              <button
                type="button"
                className="ls-page-btn"
                aria-label="Next page"
                disabled={safePage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                <FaChevronRight />
              </button>
            </nav>
          )}
        </div>

        <aside className="ls-sidebar">
          <section className="ls-filters-card">
            <header className="ls-filters-header">
              <span>
                <FaSlidersH /> Filters
              </span>
              <button type="button" className="ls-clear-all" onClick={clearAll}>
                Clear all
              </button>
            </header>

            <div className="ls-filter-group">
              <label>Category</label>
              <select
                className="ls-select"
                value={pendingCategory}
                onChange={(event) => setPendingCategory(event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item === 'All' ? 'All categories' : item}
                  </option>
                ))}
              </select>
            </div>

            <div className="ls-filter-group">
              <label>Language</label>
              <select className="ls-select" defaultValue="all" aria-label="Language">
                <option value="all">All languages</option>
              </select>
            </div>

            <div className="ls-filter-group ls-radio-group">
              <label>Status</label>
              {[
                { value: 'all', label: 'All stations' },
                { value: 'live', label: 'Live now' },
                { value: 'offline', label: 'Offline' },
              ].map((option) => (
                <label key={option.value} className="ls-radio">
                  <input
                    type="radio"
                    name="ls-status"
                    checked={pendingStatus === option.value}
                    onChange={() => setPendingStatus(option.value)}
                  />
                  <span className="ls-radio-mark" />
                  {option.label}
                </label>
              ))}
            </div>

            <div className="ls-filter-group">
              <label>Sort by</label>
              <select
                className="ls-select"
                value={pendingSort}
                onChange={(event) => setPendingSort(event.target.value)}
              >
                <option value="followers">Most followers</option>
                <option value="listening">Most listening now</option>
                <option value="live">Live &amp; popular</option>
              </select>
            </div>

            <button type="button" className="ls-btn-primary ls-apply-btn" onClick={applyFilters}>
              Apply filters
            </button>
          </section>

          <section className="ls-top-card">
            <header className="ls-top-header">
              <h3>
                <FaTrophy /> Top stations
              </h3>
              <button
                type="button"
                className="ls-view-all"
                aria-label="View all stations"
                onClick={() => {
                  setCategory('All');
                  setSortBy('followers');
                  scrollToExplore();
                }}
              >
                View all
              </button>
            </header>
            {topStations.length === 0 ? (
              <p className="ls-top-empty">Top stations will appear here.</p>
            ) : (
              <ul className="ls-top-list">
                {topStations.map((station, index) => {
                  const key = String(station.id);
                  const isFollowing = followingIds.has(key);
                  const art = stationCover(station);
                  return (
                    <li className="ls-top-row" key={station.id}>
                      <span className="ls-rank">{index + 1}</span>
                      <button
                        type="button"
                        className="ls-top-art"
                        aria-label={`Open ${station.name}`}
                        onClick={() => openStation(station)}
                      >
                        {art ? (
                          <img src={art} alt="" aria-hidden loading="lazy" />
                        ) : (
                          <FaHeadphones />
                        )}
                      </button>
                      <div className="ls-top-info">
                        <button
                          type="button"
                          className="ls-top-name"
                          onClick={() => openStation(station)}
                        >
                          {station.name}
                        </button>
                        <span>{formatCount(station.followerCount)} followers</span>
                      </div>
                      <button
                        type="button"
                        className={`ls-top-follow ${isFollowing ? 'following' : ''}`}
                        disabled={actionId === key}
                        onClick={() => toggleFollow(station)}
                      >
                        {isFollowing ? 'Following' : '+ Follow'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="ls-create-card">
            <FaHeadphones className="ls-create-icon" aria-hidden />
            <h3>Create your own station</h3>
            <p>Share your voice with the world. It only takes a few minutes.</p>
            <button type="button" className="ls-btn-outline" onClick={() => navigate('/creator-studio')}>
              Start broadcasting
            </button>
          </section>
        </aside>
      </section>

      {error && <div className="ls-inline-error">{error}</div>}
    </main>
  );
};

export default ListenerStationsConnected;
