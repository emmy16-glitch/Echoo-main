import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiArrowRight,
  FiGrid,
  FiHeart,
  FiPlay,
  FiRadio,
  FiSearch,
  FiUsers,
} from 'react-icons/fi';

import listenerService from '../../services/listenerService';
import followService from '../../services/followService';
import realtimeService from '../../services/realtimeService';
import { buildMediaUrl } from '../../services/api';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding';
import echooMark from '../Assets/echoo-logo-official.svg';
import './ListenerHome.css';

const HOME_SYNC_INTERVAL_MS = 15000;

const idOf = (item) => String(
  item?._id || item?.id || item?.broadcastId || item?.stationId || ''
);

const formatCount = (value) => {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1000) return `${Number((count / 1000).toFixed(1))}K`;
  return String(Math.floor(count));
};

const titleOf = (item) =>
  item?.title || item?.station?.name || item?.stationName || item?.name || 'Live on Echoo';

const stationNameOf = (item) =>
  item?.station?.name || item?.stationName || item?.name || item?.creator?.displayName || 'Echoo';

const categoryOf = (item) =>
  item?.category || item?.station?.category || 'Other';

const artworkOf = (item) => buildMediaUrl(
  item?.station?.brandCover ||
  item?.station?.coverArt ||
  item?.brandCover ||
  item?.coverArt ||
  item?.artwork ||
  item?.image ||
  null
);

const stationArtwork = (station) => buildMediaUrl(
  station?.brandCover || station?.coverArt || buildGeneratedStationBrandCoverUrl(station)
);

const Artwork = ({ src, alt = '' }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  return src && !failed
    ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
    : <img src={echooMark} alt="" className="echoo-listener-target-fallback" />;
};

const SectionHeader = ({ title, subtitle, action, onAction }) => (
  <header className="echoo-listener-target-section-head">
    <div>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {action && (
      <button type="button" onClick={onAction}>
        {action} <FiArrowRight aria-hidden="true" />
      </button>
    )}
  </header>
);

const LiveTile = ({ broadcast, onOpen }) => (
  <article className="echoo-listener-target-live-card">
    <button
      type="button"
      className="echoo-listener-target-live-art"
      onClick={() => onOpen(broadcast)}
      aria-label={`Listen to ${titleOf(broadcast)} live`}
    >
      <Artwork src={artworkOf(broadcast)} alt="" />
      <span className="echoo-listener-target-live-badge">LIVE</span>
      <span className="echoo-listener-target-live-count"><FiUsers aria-hidden="true" /> {formatCount(broadcast?.listenerCount ?? broadcast?.station?.listenerCount)}</span>
    </button>
    <button type="button" className="echoo-listener-target-live-copy" onClick={() => onOpen(broadcast)}>
      <strong>{titleOf(broadcast)}</strong>
      <span>{stationNameOf(broadcast)}</span>
      <small><FiRadio aria-hidden="true" /> Listen live</small>
    </button>
  </article>
);

const FollowTile = ({ station, busy, onOpen, onToggle }) => (
  <article className="echoo-listener-target-follow-card">
    <button type="button" className="echoo-listener-target-follow-art" onClick={() => onOpen(station)}>
      <Artwork src={stationArtwork(station)} alt="" />
    </button>
    <div className="echoo-listener-target-follow-copy">
      <strong>{station?.name || 'Echoo station'}</strong>
      <span>{station?.category || 'Station'}</span>
      <small>{formatCount(station?.followerCount)} followers</small>
    </div>
    <button type="button" className="echoo-listener-target-following" onClick={() => onToggle(station)} disabled={busy}>
      {busy ? 'Updating…' : 'Following'}
    </button>
  </article>
);

const ListenerHome = () => {
  const navigate = useNavigate();
  const [liveNow, setLiveNow] = useState([]);
  const [stations, setStations] = useState([]);
  const [followingStations, setFollowingStations] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const [dashboardResult, followingResult] = await Promise.allSettled([
        listenerService.getDashboard(),
        followService.getFollowingStations(),
      ]);

      if (dashboardResult.status === 'rejected') throw dashboardResult.reason;
      const dashboard = dashboardResult.value?.data || {};
      setLiveNow(Array.isArray(dashboard.liveNow) ? dashboard.liveNow : []);
      setStations(Array.isArray(dashboard.discoverStations) ? dashboard.discoverStations : []);
      setFollowingStations(
        followingResult.status === 'fulfilled' && Array.isArray(followingResult.value?.data)
          ? followingResult.value.data
          : []
      );
    } catch (loadError) {
      if (!silent) setError(loadError?.message || 'Echoo could not load live discovery right now.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, HOME_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    realtimeService.subscribeToCatalog((event) => {
      if (!event?.entity || ['broadcast', 'station'].includes(event.entity)) load({ silent: true });
    }).then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup();
    }).catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, [load]);

  const filteredLive = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return liveNow;
    return liveNow.filter((item) => [titleOf(item), stationNameOf(item), categoryOf(item)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)));
  }, [liveNow, query]);

  const categories = useMemo(() => {
    const counts = new Map();
    [...liveNow, ...stations, ...followingStations].forEach((item) => {
      const label = categoryOf(item);
      if (!label || label === 'Other') return;
      counts.set(label, (counts.get(label) || 0) + (liveNow.includes(item) ? 1 : 0));
    });
    return [...counts.entries()]
      .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
      .slice(0, 6);
  }, [followingStations, liveNow, stations]);

  const unfollow = async (station) => {
    const stationId = idOf(station);
    if (!stationId || busyId) return;
    try {
      setBusyId(stationId);
      await followService.unfollowStation(stationId);
      setFollowingStations((current) => current.filter((item) => idOf(item) !== stationId));
    } catch (followError) {
      setError(followError?.message || 'Could not update your following list.');
    } finally {
      setBusyId('');
    }
  };

  if (loading) {
    return (
      <div className="echoo-listener-target-loading" role="status" aria-label="Loading live discovery">
        {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
      </div>
    );
  }

  return (
    <div className="echoo-listener-target-home">
      {error && <div className="echoo-listener-target-error" role="alert">{error}</div>}

      <header className="echoo-listener-target-home-head">
        <div>
          <span className="echoo-listener-target-kicker"><FiRadio aria-hidden="true" /> Listener</span>
          <h1>Live now</h1>
          <p>Find something live, enter the room and be part of the moment.</p>
        </div>
        <label className="echoo-listener-target-search">
          <FiSearch aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search live events..."
            aria-label="Search live events"
          />
        </label>
      </header>

      <section className="echoo-listener-target-section">
        <SectionHeader
          title="Live now"
          subtitle="What’s live right now"
          action="View all"
          onAction={() => navigate('/listen/live')}
        />
        {filteredLive.length ? (
          <div className="echoo-listener-target-live-grid">
            {filteredLive.slice(0, 5).map((broadcast) => (
              <LiveTile
                key={idOf(broadcast)}
                broadcast={broadcast}
                onOpen={(item) => navigate(`/listen/live/${idOf(item)}`, { state: { show: item } })}
              />
            ))}
          </div>
        ) : (
          <div className="echoo-listener-target-empty">
            <FiRadio aria-hidden="true" />
            <strong>{query ? 'No live events match your search.' : 'Nothing is live right now.'}</strong>
            <span>{query ? 'Try another station, creator or topic.' : 'Follow creators you love and check back soon.'}</span>
          </div>
        )}
      </section>

      <section className="echoo-listener-target-section">
        <SectionHeader
          title="Following"
          subtitle="Creators you follow"
          action="View all"
          onAction={() => navigate('/listen/library/following')}
        />
        {followingStations.length ? (
          <div className="echoo-listener-target-follow-grid">
            {followingStations.slice(0, 5).map((station) => (
              <FollowTile
                key={idOf(station)}
                station={station}
                busy={busyId === idOf(station)}
                onOpen={(item) => navigate(`/listen/stations/${idOf(item)}`)}
                onToggle={unfollow}
              />
            ))}
          </div>
        ) : (
          <div className="echoo-listener-target-empty compact">
            <FiHeart aria-hidden="true" />
            <strong>You’re not following any stations yet.</strong>
            <button type="button" onClick={() => navigate('/listen/stations')}>Browse stations</button>
          </div>
        )}
      </section>

      <section className="echoo-listener-target-section">
        <SectionHeader
          title="Categories"
          subtitle="Browse by category"
          action="View all"
          onAction={() => navigate('/listen/stations')}
        />
        {categories.length ? (
          <div className="echoo-listener-target-category-grid">
            {categories.map(([category, liveCount]) => (
              <button
                key={category}
                type="button"
                onClick={() => navigate(`/listen/stations?category=${encodeURIComponent(category)}`)}
              >
                <span><FiGrid aria-hidden="true" /></span>
                <strong>{category}</strong>
                <small>{liveCount > 0 ? `${liveCount} live` : 'Explore'}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="echoo-listener-target-empty compact">
            <FiGrid aria-hidden="true" />
            <strong>Categories will appear as public stations are added.</strong>
          </div>
        )}
      </section>
    </div>
  );
};

export default ListenerHome;
