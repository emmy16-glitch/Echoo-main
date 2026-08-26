import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiPlay, FiRadio, FiUsers } from 'react-icons/fi';
import listenerService from '../../services/listenerService';
import realtimeService from '../../services/realtimeService';
import followService from '../../services/followService';
import { buildMediaUrl } from '../../services/api';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding';
import echooMark from '../Assets/echoo-logo-official.svg';
import listeningLounge from '../Assets/echoo-listener-listening-lounge.png';
import './ListenerHome.css';

const HOME_SYNC_INTERVAL_MS = 15000;

const idOf = (item) => String(
  item?._id || item?.id || item?.broadcastId || item?.stationId || item?.audioId || item?.trackId || ''
);

const artworkOf = (item) => buildMediaUrl(
  item?.station?.brandCover || item?.station?.coverArt || item?.brandCover ||
  item?.coverArt || item?.artwork || item?.image || null
);

const stationArtwork = (station) => buildMediaUrl(
  station?.brandCover || station?.coverArt || buildGeneratedStationBrandCoverUrl(station)
);

const formatCount = (count) => {
  const value = Math.max(0, Number(count) || 0);
  if (value >= 1000) return `${Number((value / 1000).toFixed(1))}K`;
  return String(Math.floor(value));
};

const formatRemaining = (duration, progress) => {
  const seconds = Math.max(0, (Number(duration) || 0) - (Number(progress) || 0));
  if (!seconds) return '';
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m left`;
};

const readDisplayName = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.displayName || user.fullname || user.username || 'Listener';
  } catch {
    return 'Listener';
  }
};

const titleOf = (item) => item?.title || item?.station?.name || item?.stationName || item?.name || 'Echoo audio';
const subtitleOf = (item) => item?.station?.owner?.displayName || item?.creator?.displayName || item?.station?.name || item?.stationName || item?.artistName || item?.artist?.displayName || item?.category || 'Echoo';

const Artwork = ({ src, alt = '' }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  return src && !failed
    ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
    : <img src={echooMark} alt="" className="echoo-home-fallback-mark" />;
};

const LiveCard = ({ broadcast, onOpen }) => (
  <article className="echoo-home-live-card">
    <button type="button" className="echoo-home-live-art" onClick={() => onOpen(broadcast)} aria-label={`Join ${titleOf(broadcast)}`}>
      <Artwork src={artworkOf(broadcast)} />
      <span className="echoo-home-live-badge"><i aria-hidden="true" /> LIVE</span>
      <span className="echoo-home-live-play" aria-hidden="true"><FiPlay /></span>
    </button>
    <div className="echoo-home-live-copy">
      <strong>{titleOf(broadcast)}</strong>
      <span>{subtitleOf(broadcast)}</span>
      <small><FiUsers aria-hidden="true" /> {formatCount(broadcast?.listenerCount ?? broadcast?.station?.listenerCount)} listening</small>
    </div>
  </article>
);

const StationCard = ({ station, following, busy, onOpen, onToggle }) => {
  const stationId = idOf(station);
  const isFollowing = following.has(stationId);
  return (
    <article className="echoo-home-station-card">
      <button type="button" className="echoo-home-station-art" onClick={() => onOpen(station)} aria-label={`Open ${station.name || 'station'}`}>
        <Artwork src={stationArtwork(station)} />
      </button>
      <div className="echoo-home-station-copy">
        <strong title={station.name}>{station.name || 'Unnamed station'}</strong>
        <span>{station.category || 'Station'} · {formatCount(station.followerCount)} followers</span>
      </div>
      <button
        type="button"
        className={isFollowing ? 'echoo-home-follow is-following' : 'echoo-home-follow'}
        onClick={() => onToggle(station)}
        disabled={busy}
        aria-pressed={isFollowing}
      >
        {busy ? 'Updating…' : isFollowing ? 'Following' : 'Follow'}
      </button>
    </article>
  );
};

const ContinueCard = ({ item, onOpen }) => {
  const duration = Number(item.duration) || 0;
  const progress = Number(item.progress) || 0;
  const ratio = duration > 0 ? Math.max(0, Math.min(100, (progress / duration) * 100)) : 0;
  return (
    <button type="button" className="echoo-home-continue-card" onClick={() => onOpen(item)}>
      <span className="echoo-home-continue-art">
        <Artwork src={artworkOf(item)} />
        <i aria-hidden="true"><FiPlay /></i>
      </span>
      <span className="echoo-home-continue-copy">
        <strong>{titleOf(item)}</strong>
        <span>{subtitleOf(item)}</span>
        {duration > 0 && <span className="echoo-home-progress"><i style={{ width: `${ratio}%` }} /></span>}
      </span>
      <small>{formatRemaining(duration, progress)}</small>
    </button>
  );
};

const SectionHeader = ({ title, onViewAll }) => (
  <header className="echoo-home-section-header">
    <h2>{title}</h2>
    <button type="button" onClick={onViewAll}>View all</button>
  </header>
);

const NowPlayingHero = ({ item, onOpen }) => {
  const duration = Number(item?.duration) || 0;
  const progress = Number(item?.progress) || 0;
  const ratio = duration > 0 ? Math.max(0, Math.min(100, (progress / duration) * 100)) : 38;

  return (
    <section className="echoo-home-now-playing" aria-label="Now playing">
      <img src={listeningLounge} alt="A calm listening room" className="echoo-home-now-playing-scene" />
      <div className="echoo-home-now-playing-shade" aria-hidden="true" />
      <div className="echoo-home-now-playing-content">
        <div className="echoo-home-now-playing-cover">
          <Artwork src={artworkOf(item)} alt="" />
        </div>
        <div className="echoo-home-now-playing-copy">
          <span className="echoo-home-now-playing-kicker"><i aria-hidden="true" /> Now playing</span>
          <h2>{titleOf(item)}</h2>
          <p>{subtitleOf(item)}</p>
          <span className="echoo-home-now-playing-time">{formatRemaining(duration, progress) || 'Pick up where you left off'}</span>
          <button type="button" onClick={() => onOpen(item)}>
            <FiPlay aria-hidden="true" /> Continue listening
          </button>
        </div>
      </div>
      <div className="echoo-home-now-playing-wave" aria-hidden="true">
        {Array.from({ length: 34 }, (_, index) => <i key={index} style={{ '--wave-height': `${18 + ((index * 17) % 46)}%`, '--wave-delay': `${index * -0.09}s` }} />)}
      </div>
      <div className="echoo-home-now-playing-progress" aria-label={`${Math.round(ratio)} percent complete`}>
        <span style={{ width: `${ratio}%` }} />
      </div>
    </section>
  );
};

const ListenerHome = () => {
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');
  const [liveNow, setLiveNow] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [continueListening, setContinueListening] = useState([]);
  const [followedStationIds, setFollowedStationIds] = useState(new Set());
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const syncTimerRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) { setLoading(true); setError(''); }
      const [dashboardResult, followsResult] = await Promise.allSettled([
        listenerService.getDashboard(),
        followService.getFollowingStations(),
      ]);
      if (dashboardResult.status === 'rejected') throw dashboardResult.reason;
      const dashboard = dashboardResult.value?.data || {};
      setGreeting(dashboard.greeting || `Good morning, ${readDisplayName().split(' ')[0]}`);
      setLiveNow(Array.isArray(dashboard.liveNow) ? dashboard.liveNow : []);
      setRecommended(Array.isArray(dashboard.discoverStations) ? dashboard.discoverStations : []);
      setContinueListening(Array.isArray(dashboard.continueListening) ? dashboard.continueListening : []);
      if (followsResult.status === 'fulfilled') {
        setFollowedStationIds(new Set((followsResult.value?.data || []).map(idOf).filter(Boolean)));
      }
    } catch (loadError) {
      if (!silent) setError(loadError?.message || 'The listener home could not be loaded.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    syncTimerRef.current = window.setInterval(sync, HOME_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(syncTimerRef.current);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    realtimeService.subscribeToCatalog((event) => {
      if (!event?.entity || ['audio', 'broadcast', 'station'].includes(event.entity)) load({ silent: true });
    }).then((cleanup) => { if (active) unsubscribe = cleanup; else cleanup(); }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [load]);

  const toggleStationFollow = async (station) => {
    const stationId = idOf(station);
    if (!stationId || busyId) return;
    const isFollowing = followedStationIds.has(stationId);
    try {
      setBusyId(stationId);
      if (isFollowing) await followService.unfollowStation(stationId);
      else await followService.followStation(stationId);
      setFollowedStationIds((current) => {
        const next = new Set(current);
        if (isFollowing) next.delete(stationId); else next.add(stationId);
        return next;
      });
    } catch (followError) {
      setError(followError?.message || 'Could not update follow status.');
    } finally {
      setBusyId('');
    }
  };

  if (loading) {
    return <div className="echoo-home-loading" role="status" aria-label="Loading Listener home">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>;
  }

  return (
    <div className="echoo-home">
      {error && <div className="echoo-home-error" role="alert">{error}</div>}
      <header className="echoo-home-welcome">
        <h1>{greeting}</h1>
        <p>Let’s find the perfect sound for your day.</p>
      </header>

      <NowPlayingHero
        item={continueListening[0] || liveNow[0] || recommended[0]}
        onOpen={(track) => navigate(`/listen/audio/${idOf(track)}`)}
      />

      <section className="echoo-home-section" aria-labelledby="listener-home-live">
        <SectionHeader title="Live now" onViewAll={() => navigate('/listen/live')} />
        {liveNow.length ? (
          <div className="echoo-home-live-grid" id="listener-home-live">
            {liveNow.slice(0, 4).map((broadcast) => <LiveCard key={idOf(broadcast)} broadcast={broadcast} onOpen={(item) => navigate(`/listen/live/${idOf(item)}`)} />)}
          </div>
        ) : (
          <div className="echoo-home-empty">
            <span><FiRadio aria-hidden="true" /></span>
            <strong>Nothing live right now</strong>
            <p>Follow stations you love and we’ll let you know when they go live.</p>
            <button type="button" onClick={() => navigate('/listen/stations')}>Explore stations <FiArrowRight /></button>
          </div>
        )}
      </section>

      <section className="echoo-home-section" aria-labelledby="listener-home-stations">
        <SectionHeader title="Recommended stations for you" onViewAll={() => navigate('/listen/stations')} />
        {recommended.length ? (
          <div className="echoo-home-station-grid" id="listener-home-stations">
            {recommended.slice(0, 5).map((station) => (
              <StationCard key={idOf(station)} station={station} following={followedStationIds} busy={busyId === idOf(station)} onOpen={(item) => navigate(`/listen/stations/${idOf(item)}`)} onToggle={toggleStationFollow} />
            ))}
          </div>
        ) : <p className="echoo-home-inline-empty">Recommended stations will appear as you listen and follow creators.</p>}
      </section>

      {continueListening.length > 0 && (
        <section className="echoo-home-section" aria-labelledby="listener-home-continue">
          <SectionHeader title="Recent replays" onViewAll={() => navigate('/listen/history')} />
          <div className="echoo-home-continue-grid" id="listener-home-continue">
            {continueListening.slice(1, 5).map((item) => <ContinueCard key={idOf(item)} item={item} onOpen={(track) => navigate(`/listen/audio/${idOf(track)}`)} />)}
          </div>
        </section>
      )}
    </div>
  );
};

export default ListenerHome;
