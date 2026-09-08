import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiRadio, FiSearch, FiUsers } from 'react-icons/fi';

import listenerService from '../../services/listenerService';
import audioService from '../../services/audioService';
import playlistService from '../../services/playlistService';
import { isAuthenticated } from '../../services/guestSession';
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
  const [recordings, setRecordings] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) setError('');
      const requests = [
        audioService.getAll({ public: true, page: 1, limit: 8 }),
        playlistService.getAll({ page: 1, limit: 6 }),
      ];
      if (isAuthenticated()) requests.unshift(listenerService.getDashboard());
      const results = await Promise.allSettled(requests);
      const dashboardResult = isAuthenticated() ? results.shift() : null;
      const [audioResult, playlistResult] = results;
      const dashboard = dashboardResult?.status === 'fulfilled' ? dashboardResult.value?.data || {} : {};
      setLiveNow(Array.isArray(dashboard.liveNow) ? dashboard.liveNow : []);
      if (audioResult.status === 'fulfilled') setRecordings((audioResult.value?.data || []).slice(0, 8));
      if (playlistResult.status === 'fulfilled') setPlaylists((playlistResult.value?.data || []).slice(0, 6));
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
            <h1>Discover</h1>
            <p>Listen first. Sign in only when you want to save, follow, or join the conversation.</p>
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

      <section className="echoo-listener-target-section" aria-labelledby="discover-recordings">
        <header className="echoo-listener-target-section-head"><div><h2 id="discover-recordings">Trending recordings</h2><p>Public audio from Echoo creators.</p></div></header>
        {recordings.length ? <div className="echoo-listener-target-live-grid">{recordings.slice(0, 5).map((track) => (
          <article className="echoo-listener-target-live-card" key={idOf(track)}>
            <button type="button" className="echoo-listener-target-live-art" onClick={() => navigate(`/listen/audio/${idOf(track)}`)}><Artwork src={artworkOf(track)} /></button>
            <button type="button" className="echoo-listener-target-live-copy" onClick={() => navigate(`/listen/audio/${idOf(track)}`)}><strong>{titleOf(track)}</strong><span>{stationNameOf(track)}</span></button>
          </article>
        ))}</div> : <div className="echoo-listener-target-empty"><strong>Recordings will appear here.</strong><span>Browse channels while Echoo loads the latest public audio.</span></div>}
      </section>

      <section className="echoo-listener-target-section" aria-labelledby="discover-playlists">
        <header className="echoo-listener-target-section-head"><div><h2 id="discover-playlists">Popular playlists</h2><p>Play openly; save them when you are ready.</p></div></header>
        {playlists.length ? <div className="echoo-listener-target-live-grid">{playlists.slice(0, 5).map((playlist) => (
          <article className="echoo-listener-target-live-card" key={idOf(playlist)}>
            <button type="button" className="echoo-listener-target-live-art" onClick={() => navigate('/listen/playlist')}><Artwork src={artworkOf(playlist)} /></button>
            <button type="button" className="echoo-listener-target-live-copy" onClick={() => navigate('/listen/playlist')}><strong>{playlist.name || 'Playlist'}</strong><span>{playlist.description || 'Public playlist'}</span></button>
          </article>
        ))}</div> : <div className="echoo-listener-target-empty"><strong>Public playlists will appear here.</strong></div>}
      </section>
    </div>
  );
};

export default ListenerHome;
