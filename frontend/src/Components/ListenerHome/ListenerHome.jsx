import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiRadio, FiSearch, FiUsers } from 'react-icons/fi';

import listenerService from '../../services/listenerService';
import realtimeService from '../../services/realtimeService';
import { buildMediaUrl } from '../../services/api';
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
  item?.station?.name || item?.stationName || item?.creator?.displayName || item?.name || 'Echoo';

const categoryOf = (item) => item?.category || item?.station?.category || 'Live';

const artworkOf = (item) => buildMediaUrl(
  item?.station?.brandCover ||
  item?.station?.coverArt ||
  item?.brandCover ||
  item?.coverArt ||
  item?.artwork ||
  item?.image ||
  null
);

const Artwork = ({ src }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return src && !failed
    ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <img src={echooMark} alt="" className="echoo-listener-target-fallback" />;
};

const LiveTile = ({ broadcast, onOpen }) => (
  <article className="echoo-listener-target-live-card">
    <button
      type="button"
      className="echoo-listener-target-live-art"
      onClick={() => onOpen(broadcast)}
      aria-label={`Listen to ${titleOf(broadcast)} live`}
    >
      <Artwork src={artworkOf(broadcast)} />
      <span className="echoo-listener-target-live-badge">LIVE</span>
    </button>

    <button
      type="button"
      className="echoo-listener-target-live-copy"
      onClick={() => onOpen(broadcast)}
    >
      <strong>{titleOf(broadcast)}</strong>
      <span>{stationNameOf(broadcast)}</span>
      <small><FiUsers aria-hidden="true" /> {formatCount(broadcast?.listenerCount ?? broadcast?.station?.listenerCount)} listening</small>
    </button>
  </article>
);

const ListenerHome = () => {
  const navigate = useNavigate();
  const [liveNow, setLiveNow] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) setError('');
      const response = await listenerService.getDashboard();
      const dashboard = response?.data || {};
      setLiveNow(Array.isArray(dashboard.liveNow) ? dashboard.liveNow : []);
    } catch (loadError) {
      if (!silent) setError(loadError?.message || 'Echoo could not load live events right now.');
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

  if (loading) {
    return (
      <div className="echoo-listener-target-loading" role="status" aria-label="Loading live events">
        {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
      </div>
    );
  }

  return (
    <div className="echoo-home echoo-listener-target-home">
      {error && <div className="echoo-listener-target-error" role="alert">{error}</div>}

      <section className="echoo-listener-target-section echoo-listener-target-section--live-page echoo-home-welcome">
        <header className="echoo-listener-target-section-head echoo-listener-target-section-head--page">
          <div>
            <h1>Live now</h1>
            <p>What’s live right now</p>
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
            <span>{query ? 'Try another creator, station or topic.' : 'Live broadcasts will appear here as soon as creators go live.'}</span>
          </div>
        )}

        <button
          type="button"
          className="echoo-listener-target-view-all-live"
          onClick={() => navigate('/listen/live')}
        >
          View all live events
        </button>
      </section>
    </div>
  );
};

export default ListenerHome;
