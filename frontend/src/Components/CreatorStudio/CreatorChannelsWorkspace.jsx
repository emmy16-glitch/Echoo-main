import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiChevronUp,
  FiGlobe,
  FiGrid,
  FiList,
  FiPlay,
  FiRadio,
  FiRefreshCw,
  FiSearch,
  FiSliders,
  FiUsers,
  FiX,
} from 'react-icons/fi';

import batch3Service from '../../services/batch3Service';
import realtimeService from '../../services/realtimeService';
import { getPublicStationPath } from '../../services/stationPublicUrl';
import { useCreatorStudioState } from './CreatorStudioState';
import {
  audienceCeiling,
  buildChannelRows,
  CHANNEL_LANGUAGE_NAMES,
  filterAndSortChannels,
} from './creatorChannelsModel';
import './CreatorChannelsWorkspace.css';

const REFERENCE_CATEGORIES = ['Faith', 'Talk', 'Education', 'Music', 'News', 'Sports', 'Lifestyle', 'Business'];
const REFERENCE_LANGUAGES = ['en', 'pcm', 'yo', 'ha'];

const formatCount = (value) => new Intl.NumberFormat(undefined, {
  notation: Number(value) >= 1000 ? 'compact' : 'standard',
  maximumFractionDigits: 1,
}).format(Math.max(0, Number(value) || 0));

const ChannelCard = memo(function ChannelCard({ row, view, onListen }) {
  const open = () => onListen(row);
  return (
    <article
      className={`channels-card ${view === 'list' ? 'is-list' : ''}`}
      role="link"
      tabIndex="0"
      aria-label={`Open ${row.name}`}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
    >
      <div className="channels-card-art">
        {row.artwork ? (
          <img src={row.artwork} alt={`${row.name} artwork`} loading="lazy" />
        ) : (
          <div className="channels-card-fallback"><FiRadio aria-hidden="true" /><span>{row.name}</span></div>
        )}
        {row.isLive && <span className="channels-live-badge">LIVE</span>}
        {row.isLive && (
          <span className="channels-art-audience"><FiUsers aria-hidden="true" /> {formatCount(row.listenerCount)}</span>
        )}
      </div>
      <div className="channels-card-body">
        <strong title={row.name}>{row.name}</strong>
        <p title={row.description}>{row.description || row.category || 'Echoo station'}</p>
        {row.tags.length > 0 && <div className="channels-card-tags">{row.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        <footer>
          <span className="channels-listener-count"><i className="channels-wave-icon" aria-hidden="true" /> {formatCount(row.listenerCount)} listening</span>
          <button type="button" onClick={(event) => { event.stopPropagation(); open(); }} aria-label={`Listen to ${row.name}`}>
            <FiPlay aria-hidden="true" />
          </button>
        </footer>
      </div>
    </article>
  );
});

const FilterGroup = ({ icon, title, children }) => (
  <section className="channels-filter-group">
    <header><span>{icon}</span><strong>{title}</strong><FiChevronUp aria-hidden="true" /></header>
    {children}
  </section>
);

export default function CreatorChannelsWorkspace() {
  const navigate = useNavigate();
  const { currentUser, ownedStations, refreshedAt } = useCreatorStudioState();
  const [stations, setStations] = useState([]);
  const [liveBroadcasts, setLiveBroadcasts] = useState([]);
  const [presenceCounts, setPresenceCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('live');
  const [view, setView] = useState('grid');
  const [category, setCategory] = useState('All');
  const [language, setLanguage] = useState('All');
  const [status, setStatus] = useState('live');
  const [minimumAudience, setMinimumAudience] = useState(0);
  const [maximumAudience, setMaximumAudience] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadChannels = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const discovery = await batch3Service.getDiscovery();
      setStations(Array.isArray(discovery?.stations) ? discovery.stations : []);
      setLiveBroadcasts(Array.isArray(discovery?.live) ? discovery.live : []);
    } catch {
      setError('Unable to load channels.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);
  useEffect(() => {
    if (!refreshedAt) return;
    loadChannels({ silent: true });
  }, [loadChannels, refreshedAt]);

  useEffect(() => {
    const broadcastIds = liveBroadcasts.map((item) => item.id).filter(Boolean);
    if (!broadcastIds.length) return undefined;
    let disposed = false;
    let socket = null;

    const refreshPresence = async (broadcastId) => {
      try {
        const next = await batch3Service.getPresence(broadcastId);
        if (!disposed) {
          setPresenceCounts((current) => ({
            ...current,
            [broadcastId]: Math.max(0, Number(next?.listenerCount) || 0),
          }));
        }
      } catch {
        // Keep the canonical discovery count if live presence sync is unavailable.
      }
    };

    Promise.all(broadcastIds.map((broadcastId) => realtimeService.joinBroadcast(broadcastId)))
      .then((connections) => {
        if (disposed) return;
        socket = connections[0] || null;
        const onPresence = (payload) => {
          if (payload?.broadcastId && broadcastIds.includes(String(payload.broadcastId))) {
            refreshPresence(String(payload.broadcastId));
          }
        };
        const onStatus = (payload) => {
          if (!payload?.broadcastId || !broadcastIds.includes(String(payload.broadcastId))) return;
          if (['completed', 'cancelled', 'failed'].includes(payload.status)) loadChannels({ silent: true });
          else if (payload.listenerCount !== undefined) {
            setPresenceCounts((current) => ({ ...current, [payload.broadcastId]: Number(payload.listenerCount) || 0 }));
          }
        };
        socket?.on('presence:changed', onPresence);
        socket?.on('listener_count_updated', onStatus);
        socket?.on('broadcast:status', onStatus);
        socket.__echooChannelsCleanup = () => {
          socket?.off('presence:changed', onPresence);
          socket?.off('listener_count_updated', onStatus);
          socket?.off('broadcast:status', onStatus);
        };
        broadcastIds.forEach(refreshPresence);
      })
      .catch(() => {
        broadcastIds.forEach(refreshPresence);
      });

    return () => {
      disposed = true;
      socket?.__echooChannelsCleanup?.();
      broadcastIds.forEach((broadcastId) => realtimeService.leaveBroadcast(broadcastId).catch(() => {}));
    };
  }, [liveBroadcasts, loadChannels]);

  const broadcastsWithPresence = useMemo(() => liveBroadcasts.map((broadcast) => ({
    ...broadcast,
    listenerCount: presenceCounts[broadcast.id] ?? broadcast.listenerCount,
  })), [liveBroadcasts, presenceCounts]);

  const rows = useMemo(() => buildChannelRows({
    stations,
    liveBroadcasts: broadcastsWithPresence,
    currentUserId: currentUser?.id || currentUser?._id,
    ownedStationIds: ownedStations.map((station) => station.id || station._id),
  }), [broadcastsWithPresence, currentUser, ownedStations, stations]);

  const audienceMaximum = useMemo(() => audienceCeiling(rows), [rows]);
  const effectiveMaximum = maximumAudience ?? audienceMaximum;
  const categories = useMemo(() => {
    const liveCategories = rows.map((row) => row.category).filter(Boolean);
    return [...new Set([...REFERENCE_CATEGORIES, ...liveCategories])];
  }, [rows]);
  const languages = useMemo(() => {
    const liveLanguages = rows.map((row) => row.languageCode).filter((code) => CHANNEL_LANGUAGE_NAMES[code]);
    return [...new Set([...REFERENCE_LANGUAGES, ...liveLanguages])];
  }, [rows]);

  const results = useMemo(() => filterAndSortChannels(rows, {
    query,
    category,
    language,
    minimumAudience,
    maximumAudience: effectiveMaximum,
    status,
    sort,
  }), [category, effectiveMaximum, language, minimumAudience, query, rows, sort, status]);

  const clearFilters = () => {
    setQuery('');
    setCategory('All');
    setLanguage('All');
    setMinimumAudience(0);
    setMaximumAudience(null);
    setStatus('live');
    setSort('live');
  };

  const listen = useCallback((row) => {
    const path = getPublicStationPath(row.station);
    if (path) navigate(path);
  }, [navigate]);

  return (
    <section className="channels-page">
      <header className="channels-page-heading">
        <h1>Channels</h1>
        <p>Discover and listen to live stations on Echoo.</p>
      </header>

      <section className="channels-surface">
        <div className="channels-toolbar">
          <label className="channels-search">
            <FiSearch aria-hidden="true" />
            <span className="channels-sr-only">Search channels or topics</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels or topics..." />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear channel search"><FiX /></button>}
          </label>

          <div className="channels-toolbar-actions">
            <label className="channels-sort">
              <span className="channels-sr-only">Sort channels</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="live">Sort by: Live now</option>
                <option value="listeners">Sort by: Most listeners</option>
                <option value="newest">Sort by: Newest</option>
              </select>
            </label>
            <div className="channels-view-toggle" aria-label="Channel view">
              <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}><FiGrid /></button>
              <button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}><FiList /></button>
            </div>
            <button type="button" className="channels-filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><FiSliders /> Filters</button>
          </div>
        </div>

        <div className="channels-layout">
          <main className="channels-results">
            <header className="channels-section-heading">
              <span><FiRadio /></span>
              <div><h2>Live now</h2><p>Stations that are currently live</p></div>
            </header>

            {error ? (
              <div className="channels-state error" role="alert"><strong>Unable to load channels.</strong><p>Please try again.</p><button type="button" onClick={() => loadChannels()}>Try again</button></div>
            ) : loading ? (
              <div className="channels-grid is-loading" aria-label="Loading channels">{Array.from({ length: 8 }, (_, index) => <div className="channels-skeleton" key={index}><i /><span /><span /><span /></div>)}</div>
            ) : results.length ? (
              <div className={`channels-grid ${view === 'list' ? 'is-list' : ''}`}>{results.map((row) => <ChannelCard key={row.id} row={row} view={view} onListen={listen} />)}</div>
            ) : (
              <div className="channels-state">
                <FiRadio aria-hidden="true" />
                <strong>{rows.some((row) => row.isLive) ? 'No channels found.' : 'No channels are live right now.'}</strong>
                <p>{rows.some((row) => row.isLive) ? 'Try adjusting your search or filters.' : 'Check back soon.'}</p>
                {(query || category !== 'All' || language !== 'All' || minimumAudience > 0) && <button type="button" onClick={clearFilters}>Clear filters</button>}
              </div>
            )}
          </main>

          <aside className={`channels-filters ${filtersOpen ? 'open' : ''}`} aria-label="Channel filters">
            <h2>Filters</h2>
            <FilterGroup icon={<FiGrid />} title="Categories">
              <div className="channels-filter-pills">
                <button type="button" className={category === 'All' ? 'active' : ''} aria-pressed={category === 'All'} onClick={() => setCategory('All')}>All</button>
                {categories.map((item) => <button type="button" key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
              </div>
            </FilterGroup>

            <FilterGroup icon={<FiGlobe />} title="Language">
              <div className="channels-filter-pills">
                <button type="button" className={language === 'All' ? 'active' : ''} aria-pressed={language === 'All'} onClick={() => setLanguage('All')}>All</button>
                {languages.map((code) => <button type="button" key={code} className={language === code ? 'active' : ''} aria-pressed={language === code} onClick={() => setLanguage(code)}>{CHANNEL_LANGUAGE_NAMES[code] || code}</button>)}
              </div>
            </FilterGroup>

            <FilterGroup icon={<FiUsers />} title="Audience size">
              <div className="channels-audience">
                <label><span className="channels-sr-only">Minimum audience size</span><input type="range" min="0" max={audienceMaximum} value={Math.min(minimumAudience, effectiveMaximum)} onChange={(event) => setMinimumAudience(Math.min(Number(event.target.value), effectiveMaximum))} /></label>
                <label><span className="channels-sr-only">Maximum audience size</span><input type="range" min="0" max={audienceMaximum} value={effectiveMaximum} onChange={(event) => setMaximumAudience(Math.max(Number(event.target.value), minimumAudience))} /></label>
                <div><span>{formatCount(minimumAudience)}</span><span>{formatCount(effectiveMaximum)}{effectiveMaximum === audienceMaximum ? '+' : ''}</span></div>
              </div>
            </FilterGroup>

            <FilterGroup icon={<FiRadio />} title="Status">
              <div className="channels-filter-pills">
                <button type="button" className={status === 'all' ? 'active' : ''} aria-pressed={status === 'all'} onClick={() => setStatus('all')}>All</button>
                <button type="button" className={status === 'live' ? 'active' : ''} aria-pressed={status === 'live'} onClick={() => setStatus('live')}>Live now</button>
              </div>
            </FilterGroup>

            <button type="button" className="channels-clear" onClick={clearFilters}><FiRefreshCw /> Clear all filters</button>
          </aside>
        </div>
      </section>
    </section>
  );
}
