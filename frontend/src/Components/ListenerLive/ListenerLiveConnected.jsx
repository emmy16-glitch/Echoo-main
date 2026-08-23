import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBell,
  FaFilter,
  FaHeadphones,
  FaList,
  FaPlay,
  FaRandom,
  FaSearch,
  FaThLarge,
  FaUsers,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import notificationService from '../../services/notificationService';
import { buildMediaUrl } from '../../services/api';
import './ListenerLive.css';

const LIVE_SYNC_INTERVAL_MS = 15000;

const CATEGORY_OPTIONS = [
  'All',
  'Faith & Spirituality',
  'Business',
  'Entertainment',
  'News & Politics',
  'Music',
  'Education',
];

const SORT_OPTIONS = [
  { value: 'most', label: 'Most listeners' },
  { value: 'least', label: 'Least listeners' },
  { value: 'newest', label: 'Newest first' },
];

const categoryOf = (broadcast) =>
  broadcast?.station?.category || broadcast?.category || 'Other';

const artworkOf = (broadcast) =>
  buildMediaUrl(broadcast?.station?.brandCover || broadcast?.coverArt || null);

const sortBroadcasts = (list, sortBy) => {
  const copy = [...list];
  if (sortBy === 'most') {
    copy.sort((a, b) => (b.listenerCount || 0) - (a.listenerCount || 0));
  } else if (sortBy === 'least') {
    copy.sort((a, b) => (a.listenerCount || 0) - (b.listenerCount || 0));
  } else {
    copy.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return bTime - aTime;
    });
  }
  return copy;
};

const ListenerLiveConnected = () => {
  const navigate = useNavigate();
  const searchInputRef = useRef(null);
  const [live, setLive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('most');
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOpen, setSortOpen] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }
      const discovery = await batch3Service.getDiscovery();
      const liveList = Array.isArray(discovery?.live) ? discovery.live : [];
      setLive(liveList);
      const notifications = await notificationService.list({
        page: 1,
        limit: 1,
        unreadOnly: true,
      });
      setUnreadCount(Number(notifications?.data?.unreadCount) || 0);
    } catch (loadError) {
      if (!silent) {
        setError(loadError?.message || 'Live broadcasts could not be loaded.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, LIVE_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  useEffect(() => {
    const focusSearch = (event) => {
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const filteredLive = useMemo(() => {
    let list = live;
    if (category !== 'All') {
      list = list.filter((broadcast) => categoryOf(broadcast) === category);
    }
    if (searchQuery.trim()) {
      const needle = searchQuery.trim().toLowerCase();
      list = list.filter((broadcast) => {
        const haystack = [
          broadcast.title,
          broadcast.stationName,
          broadcast.description,
          categoryOf(broadcast),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      });
    }
    return sortBroadcasts(list, sortBy);
  }, [live, category, searchQuery, sortBy]);

  const featured = useMemo(() => {
    if (category === 'All' && !searchQuery.trim()) {
      return [...live].sort((a, b) => (b.listenerCount || 0) - (a.listenerCount || 0))[0] || null;
    }
    if (filteredLive.length > 0) return filteredLive[0];
    return null;
  }, [live, filteredLive, category, searchQuery]);

  const gridBroadcasts = useMemo(
    () => (featured && filteredLive.length > 1 ? filteredLive.slice(1) : filteredLive),
    [featured, filteredLive]
  );

  const categoryOptions = useMemo(() => {
    const available = new Set(live.map(categoryOf).filter(Boolean));
    return CATEGORY_OPTIONS.filter(
      (option) => option === 'All' || available.has(option)
    );
  }, [live]);

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (query) {
      navigate(`/listen/search?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className="listener-live">
      <header className="listener-live-header">
        <div className="listener-live-header-left">
          <h1>Live now</h1>
          <p>Listen to creators who are live right now across Echoo.</p>
        </div>
        <div className="listener-live-header-right">
          <div className="listener-live-search">
            <FaSearch className="listener-live-search-icon" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search stations, shows or audio..."
              aria-label="Search live broadcasts"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
            />
            <span className="listener-live-search-kbd" aria-hidden="true">Ctrl/⌘ K</span>
          </div>
          <button
            type="button"
            className="listener-live-notifications"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            onClick={() => navigate('/listen/notifications')}
          >
            <FaBell aria-hidden="true" />
            {unreadCount > 0 && <span className="listener-live-badge">{unreadCount}</span>}
          </button>
        </div>
      </header>

      {error && <div className="listener-live-error" role="alert">{error}</div>}

      <div className="listener-live-chip-row">
        <div className="listener-live-chips" role="tablist" aria-label="Category filters">
          {categoryOptions.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={category === option}
              className={`listener-live-chip${category === option ? ' active' : ''}`}
              onClick={() => setCategory(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="listener-live-sort">
          <button
            type="button"
            className="listener-live-sort-button"
            aria-label="Sort broadcasts"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen((open) => !open)}
          >
            <FaFilter aria-hidden="true" />
            <span>{SORT_OPTIONS.find((option) => option.value === sortBy)?.label || 'Sort'}</span>
          </button>
          {sortOpen && (
            <div className="listener-live-sort-menu">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`listener-live-sort-option${sortBy === option.value ? ' active' : ''}`}
                  onClick={() => {
                    setSortBy(option.value);
                    setSortOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="listener-live-state">Loading live broadcasts...</div>
      ) : (
        <>
          {featured ? (
            <button
              type="button"
              className="listener-live-featured"
              onClick={() => navigate(`/listen/live/${featured.id}`)}
              aria-label={`Join ${featured.title}`}
            >
              <div className="listener-live-featured-copy">
                <span className="listener-live-featured-label">FEATURED LIVE</span>
                <span className="listener-live-featured-status">
                  <i aria-hidden="true" /> LIVE NOW
                </span>
                <h2>{featured.title}</h2>
                <div className="listener-live-featured-chips">
                  <span className="listener-live-featured-chip">
                    {categoryOf(featured)}
                  </span>
                  <span className="listener-live-featured-chip listeners">
                    <FaUsers aria-hidden="true" />
                    {Number(featured.listenerCount) || 0} listening
                  </span>
                </div>
                {featured.description && (
                  <p className="listener-live-featured-description">
                    {featured.description}
                  </p>
                )}
                <span className="listener-live-featured-join">
                  <FaPlay aria-hidden="true" /> Join live
                </span>
              </div>
              <span className="listener-live-featured-art" aria-hidden="true">
                {artworkOf(featured) ? (
                  <img src={artworkOf(featured)} alt="" />
                ) : (
                  <FaHeadphones />
                )}
              </span>
            </button>
          ) : (
            <section className="listener-live-offline">
              <FaHeadphones aria-hidden="true" />
              <h2>No creators are live right now.</h2>
              <p>
                Broadcasts will appear here as soon as creators start streaming.
              </p>
              <button type="button" onClick={() => navigate('/listen/stations')}>
                Explore stations
              </button>
            </section>
          )}

          <section className="listener-live-section">
            <div className="listener-live-section-heading">
              <h2>All live broadcasts</h2>
              <div className="listener-live-view-controls" aria-hidden="true">
                <span className="listener-live-view-control" title="Shuffle view"><FaRandom /></span>
                <span className="listener-live-view-control active" title="Grid view"><FaThLarge /></span>
                <span className="listener-live-view-control" title="List view"><FaList /></span>
              </div>
            </div>

            {gridBroadcasts.length > 0 ? (
              <div className="listener-live-grid">
                {gridBroadcasts.map((broadcast) => (
                  <article key={broadcast.id} className="listener-live-card">
                    <button
                      type="button"
                      className="listener-live-card-art"
                      onClick={() => navigate(`/listen/live/${broadcast.id}`)}
                      aria-label={`Join ${broadcast.title}`}
                    >
                      {artworkOf(broadcast) ? (
                        <img src={artworkOf(broadcast)} alt="" />
                      ) : (
                        <FaHeadphones />
                      )}
                      <span className="listener-live-card-live"><i aria-hidden="true" /> LIVE</span>
                      <span className="listener-live-card-listeners"><FaUsers aria-hidden="true" /> {Number(broadcast.listenerCount) || 0}</span>
                    </button>
                    <div className="listener-live-card-body">
                      <h3>{broadcast.title}</h3>
                      <span className="listener-live-card-category">{categoryOf(broadcast)}</span>
                      {broadcast.description && <p className="listener-live-card-description">{broadcast.description}</p>}
                      <div className="listener-live-card-bottom">
                        <span className="listener-live-card-now"><i aria-hidden="true" /> Live now</span>
                        <button
                          type="button"
                          className="listener-live-card-play"
                          aria-label={`Join ${broadcast.title}`}
                          onClick={() => navigate(`/listen/live/${broadcast.id}`)}
                        >
                          <FaPlay aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="listener-live-empty">
                <FaHeadphones aria-hidden="true" />
                <p>{category === 'All' ? 'No live broadcasts match your search.' : `No live broadcasts in ${category} right now.`}</p>
              </div>
            )}
          </section>

          <section className="listener-live-promo">
            <span className="listener-live-promo-icon" aria-hidden="true"><FaHeadphones /></span>
            <div className="listener-live-promo-copy">
              <h3>Don't miss a live broadcast</h3>
              <p>Follow your favorite stations and get notified when they go live.</p>
            </div>
            <button type="button" className="listener-live-promo-button" onClick={() => navigate('/listen/stations')}>
              Explore stations
            </button>
          </section>
        </>
      )}
    </div>
  );
};

export default ListenerLiveConnected;