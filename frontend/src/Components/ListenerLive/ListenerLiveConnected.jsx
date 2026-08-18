import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBroadcastTower,
  FaClock,
  FaHeadphones,
  FaPlay,
  FaSyncAlt,
  FaUsers,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import '../../styles/listener-reference-pages.css';

const LIVE_SYNC_INTERVAL_MS = 10000;

const formatStart = (value) => {
  if (!value) return 'Time not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time not set';
  return date.toLocaleString([], {
    weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit',
  });
};

const artworkOf = (item) => item?.station?.brandCover || item?.coverArt || item?.artwork || null;

const ListenerLiveConnected = () => {
  const navigate = useNavigate();
  const [live, setLive] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ refresh = false, silent = false } = {}) => {
    try {
      if (!silent) {
        refresh ? setRefreshing(true) : setLoading(true);
        setError('');
      }
      const data = await batch3Service.getDiscovery();
      setLive(Array.isArray(data.live) ? data.live : []);
      setScheduled(Array.isArray(data.scheduled) ? data.scheduled : []);
    } catch (loadError) {
      if (!silent) setError(loadError?.message || 'Live discovery could not be loaded.');
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent:true });
    const interval = window.setInterval(sync, LIVE_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const totalListeners = useMemo(
    () => live.reduce((total, item) => total + (Number(item.listenerCount) || 0), 0),
    [live]
  );
  const peakAcrossLive = useMemo(
    () => live.reduce((peak, item) => Math.max(peak, Number(item.peakListeners) || 0), 0),
    [live]
  );
  const featured = live[0] || null;

  return (
    <main className="echoo-reference-page ref-live-page">
      <header className="ref-page-heading ref-live-heading">
        <div>
          <span className="ref-kicker">LIVE NOW</span>
          <h1>Hear it while it happens.</h1>
          <p>Creator broadcasts appear here from the same live state used by Broadcast Studio.</p>
        </div>
        <button type="button" className="ref-secondary-action" disabled={refreshing} onClick={() => load({ refresh:true })}>
          <FaSyncAlt /> {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && <div className="ref-inline-error">{error}</div>}

      {loading ? (
        <div className="ref-state-card"><FaBroadcastTower /><strong>Checking who is live...</strong></div>
      ) : (
        <>
          {featured ? (
            <section className="ref-live-feature">
              <div className="ref-live-feature-copy">
                <span className="ref-live-status"><i /> LIVE NOW</span>
                <h2>{featured.title}</h2>
                <p>{featured.stationName} · {featured.creatorName || featured.station?.ownerName || 'Echoo Creator'}</p>
                <div className="ref-live-feature-metrics">
                  <span><FaUsers /> {Number(featured.listenerCount) || 0} listening</span>
                  <span><FaHeadphones /> {Number(featured.peakListeners) || 0} peak</span>
                </div>
                <button type="button" onClick={() => navigate(`/listen/live/${featured.id}`)}><FaPlay /> Join live</button>
              </div>
              <button type="button" className="ref-live-feature-art" onClick={() => navigate(`/listen/live/${featured.id}`)} aria-label={`Join ${featured.title}`}>
                {artworkOf(featured) ? <img src={artworkOf(featured)} alt="" /> : <FaBroadcastTower />}
                <span className="ref-live-rings"><i /><i /><i /></span>
              </button>
            </section>
          ) : (
            <section className="ref-live-offline">
              <div className="ref-live-offline-signal"><FaBroadcastTower /><span /><span /><span /></div>
              <div><span className="ref-kicker">QUIET RIGHT NOW</span><h2>No creator is live at the moment.</h2><p>Scheduled broadcasts below are connected to the creator scheduling system and will move here when they go live.</p></div>
            </section>
          )}

          <section className="ref-live-summary">
            <article><FaBroadcastTower /><div><strong>{live.length}</strong><span>Live broadcasts</span></div></article>
            <article><FaUsers /><div><strong>{totalListeners}</strong><span>Listening now</span></div></article>
            <article><FaHeadphones /><div><strong>{peakAcrossLive}</strong><span>Highest current peak</span></div></article>
            <article><FaClock /><div><strong>{scheduled.length}</strong><span>Scheduled next</span></div></article>
          </section>

          {live.length > 1 && (
            <section className="ref-live-section">
              <div className="ref-section-heading"><div><h2>Happening now</h2><p>Other broadcasts currently on air.</p></div><span className="ref-count-pill">{live.length - 1}</span></div>
              <div className="ref-live-grid">
                {live.slice(1).map((item) => (
                  <article className="ref-live-card" key={item.id}>
                    <button type="button" className="ref-live-card-art" onClick={() => navigate(`/listen/live/${item.id}`)}>
                      {artworkOf(item) ? <img src={artworkOf(item)} alt="" /> : <FaBroadcastTower />}
                      <span className="ref-live-chip"><i /> LIVE NOW</span>
                    </button>
                    <div><span>{item.category || item.station?.category || 'Live'}</span><strong>{item.title}</strong><small>{item.stationName}</small></div>
                    <div className="ref-live-card-bottom"><span><FaUsers /> {Number(item.listenerCount) || 0}</span><button type="button" onClick={() => navigate(`/listen/live/${item.id}`)}><FaPlay /> Join</button></div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="ref-live-section">
            <div className="ref-section-heading"><div><h2>Starting soon</h2><p>Real broadcasts scheduled by Echoo creators.</p></div><span className="ref-count-pill">{scheduled.length}</span></div>
            {scheduled.length ? (
              <div className="ref-upcoming-list">
                {scheduled.slice(0,12).map((item) => (
                  <article key={item.id}>
                    <div className="ref-upcoming-art">{artworkOf(item) ? <img src={artworkOf(item)} alt="" /> : <FaClock />}</div>
                    <div className="ref-upcoming-copy"><strong>{item.title}</strong><span>{item.stationName}</span></div>
                    <time>{formatStart(item.startTime)}</time>
                    <button type="button" onClick={() => item.stationId ? navigate(`/listen/stations/${item.stationId}`) : navigate('/listen/live')}>View station</button>
                  </article>
                ))}
              </div>
            ) : <div className="ref-state-card compact"><FaClock /><strong>No upcoming broadcasts yet.</strong></div>}
          </section>
        </>
      )}
    </main>
  );
};

export default ListenerLiveConnected;
