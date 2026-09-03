import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import {
  FiArrowRight,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiHeadphones,
  FiHeart,
  FiMusic,
  FiPause,
  FiPlay,
  FiRadio,
  FiSearch,
  FiUser,
  FiUsers,
} from 'react-icons/fi';

import listenerService from '../../services/listenerService';
import followService from '../../services/followService';
import batch1Service from '../../services/batch1Service';
import batch2Service from '../../services/batch2Service';
import audioService from '../../services/audioService';
import notificationService from '../../services/notificationService';
import { buildMediaUrl } from '../../services/api';
import { getCreatorProfilePath } from '../../services/profileIdentifier';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding';
import AccountExperienceMenu from '../Shared/AccountExperienceMenu';
import echooMark from '../Assets/echoo-logo-official.svg';
import './ListenerV2.css';

const LIVE_SYNC_MS = 15000;
const CATEGORY_FALLBACK = ['Faith', 'Talk', 'Music', 'Education', 'News', 'Sports', 'Business', 'Technology'];

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const idOf = (item) => String(item?._id || item?.id || item?.broadcastId || item?.stationId || '');
const formatCount = (value) => {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1000000) return `${Number((count / 1000000).toFixed(1))}M`;
  if (count >= 1000) return `${Number((count / 1000).toFixed(1))}K`;
  return String(Math.floor(count));
};
const titleOf = (item) => item?.title || item?.station?.name || item?.stationName || item?.name || 'Live on Echoo';
const stationNameOf = (item) => item?.station?.name || item?.stationName || item?.creator?.displayName || item?.name || 'Echoo';
const categoryOf = (item) => item?.category || item?.station?.category || 'Live';
const stationArtwork = (station) => buildMediaUrl(
  station?.brandCover || station?.coverArt || buildGeneratedStationBrandCoverUrl(station)
);
const broadcastArtwork = (item) => buildMediaUrl(
  item?.station?.brandCover ||
  item?.station?.coverArt ||
  item?.brandCover ||
  item?.coverArt ||
  item?.artwork ||
  item?.image ||
  null
);

const normalizePlayable = (track) => {
  if (!track) return null;
  const normalized = typeof audioService.normalize === 'function' ? audioService.normalize(track) : track;
  const artist = typeof normalized?.artist === 'object' ? normalized.artist : null;
  return {
    ...normalized,
    id: normalized?.id || normalized?._id || track?.id || track?._id || null,
    title: normalized?.title || track?.title || 'Untitled audio',
    subtitle:
      normalized?.subtitle ||
      normalized?.artistName ||
      artist?.displayName ||
      artist?.username ||
      track?.artistName ||
      track?.station?.name ||
      'Echoo Audio',
    coverArt: buildMediaUrl(normalized?.coverArt || normalized?.artwork || track?.coverArt || track?.artwork || null),
    fileUrl: buildMediaUrl(normalized?.fileUrl || normalized?.backendFileUrl || track?.fileUrl || null),
    duration: Number(normalized?.duration || track?.duration) || 0,
  };
};

const Artwork = ({ src, className = '' }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) {
    return <img className={className} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return <img className={`${className} listener-v2-fallback-mark`.trim()} src={echooMark} alt="" />;
};

const SearchField = ({ value, onChange, placeholder, autoFocus = false, onKeyDown, className = '' }) => (
  <label className={`listener-v2-search-field ${className}`.trim()}>
    <FiSearch aria-hidden="true" />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
    />
  </label>
);

const EmptyState = ({ icon, title, copy, action, actionLabel }) => (
  <div className="listener-v2-empty">
    <span className="listener-v2-empty-icon" aria-hidden="true">{icon}</span>
    <strong>{title}</strong>
    {copy && <p>{copy}</p>}
    {action && <button type="button" onClick={action}>{actionLabel}<FiArrowRight /></button>}
  </div>
);

const SectionTitle = ({ title, copy, action, actionLabel = 'View all' }) => (
  <header className="listener-v2-section-title">
    <div>
      <h2>{title}</h2>
      {copy && <p>{copy}</p>}
    </div>
    {action && <button type="button" onClick={action}>{actionLabel}<FiChevronRight /></button>}
  </header>
);

const LiveCard = ({ broadcast, onOpen }) => {
  const art = broadcastArtwork(broadcast);
  return (
    <article className="listener-v2-live-card">
      <button type="button" className="listener-v2-live-art" onClick={() => onOpen(broadcast)}>
        <Artwork src={art} />
        <span className="listener-v2-live-badge">LIVE</span>
        <span className="listener-v2-live-listeners"><FiHeadphones /> {formatCount(broadcast?.listenerCount ?? broadcast?.station?.listenerCount)}</span>
      </button>
      <button type="button" className="listener-v2-live-meta" onClick={() => onOpen(broadcast)}>
        <strong>{titleOf(broadcast)}</strong>
        <span>{categoryOf(broadcast)}</span>
      </button>
    </article>
  );
};

const StationCard = ({ station, following, busy, onOpen, onFollow }) => {
  const live = Boolean(station?.isLive);
  return (
    <article className="listener-v2-station-card">
      <button type="button" className="listener-v2-station-art" onClick={() => onOpen(station)}>
        <Artwork src={stationArtwork(station)} />
        {live && <span className="listener-v2-live-badge">LIVE</span>}
      </button>
      <div className="listener-v2-station-meta">
        <button type="button" onClick={() => onOpen(station)}>
          <strong>{station?.name || 'Unnamed Channel'}</strong>
          <span>{station?.category || 'Channel'}</span>
        </button>
        <small>{live ? <><FiUsers /> {formatCount(station?.listenerCount)} listening</> : `${formatCount(station?.followerCount)} followers`}</small>
      </div>
      {onFollow && (
        <button
          type="button"
          className={`listener-v2-follow-button${following ? ' is-following' : ''}`}
          disabled={busy}
          onClick={() => onFollow(station)}
        >
          {busy ? '...' : following ? 'Following' : 'Follow'}
        </button>
      )}
    </article>
  );
};

const CreatorCard = ({ creator, following = true, busy, onOpen, onFollow }) => {
  const name = creator?.displayName || creator?.name || creator?.username || 'Echoo creator';
  const handle = creator?.username ? `@${String(creator.username).replace(/^@/, '')}` : 'Creator';
  return (
    <article className="listener-v2-creator-card">
      <button type="button" className="listener-v2-creator-avatar" onClick={() => onOpen(creator)}>
        {buildMediaUrl(creator?.profileImage || creator?.avatar)
          ? <Artwork src={buildMediaUrl(creator?.profileImage || creator?.avatar)} />
          : <span>{name.charAt(0).toUpperCase()}</span>}
      </button>
      <button type="button" className="listener-v2-creator-copy" onClick={() => onOpen(creator)}>
        <strong>{name}{Boolean(creator?.verified || creator?.isVerified) && <FiCheck />}</strong>
        <span>{handle}</span>
        <small>{formatCount(creator?.followerCount)} followers</small>
      </button>
      {onFollow && (
        <button
          type="button"
          className={`listener-v2-follow-button${following ? ' is-following' : ''}`}
          disabled={busy}
          onClick={() => onFollow(creator)}
        >
          {busy ? '...' : following ? 'Following' : 'Follow'}
        </button>
      )}
    </article>
  );
};

const useLiveCatalog = () => {
  const [liveNow, setLiveNow] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await listenerService.getDashboard();
      setLiveNow(Array.isArray(response?.data?.liveNow) ? response.data.liveNow : []);
      setError('');
    } catch (loadError) {
      if (!silent) setError(loadError?.message || 'Echoo could not load live events.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, LIVE_SYNC_MS);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  return { liveNow, loading, error, reload: load };
};

const ListenerV2Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(readUser);
  const audioRef = useRef(null);
  const autoplayRef = useRef(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [, setLivePlayerState] = useState(null);
  const [headerSearch, setHeaderSearch] = useState('');
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const profileImage = buildMediaUrl(user?.profileImage || user?.avatar || localStorage.getItem('profileImage'));
  const isLiveRoom = /^\/listen\/live\/[^/]+/.test(location.pathname);

  const activeKey = useMemo(() => {
    if (location.pathname.includes('/library/following')) return 'following';
    if (location.pathname === '/listen/following') return 'following';
    if (location.pathname === '/listen/search') return 'search';
    if (location.pathname === '/listen/stations' || location.pathname.startsWith('/listen/stations/')) return 'search';
    return 'live';
  }, [location.pathname]);

  const navItems = [
    { key: 'live', label: 'Live now', path: '/listen', icon: <FiRadio /> },
    { key: 'following', label: 'Following', path: '/listen/following', icon: <FiHeart /> },
  ];

  useEffect(() => {
    let active = true;
    notificationService.list({ limit: 1, unreadOnly: true })
      .then((response) => {
        if (active) setUnreadNotifications(Number(response?.data?.unreadCount) || 0);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const submitHeaderSearch = (event) => {
    if (event.key !== 'Enter' || !headerSearch.trim()) return;
    navigate(`/listen/search?q=${encodeURIComponent(headerSearch.trim())}`);
  };

  const playTrack = useCallback((track, incomingQueue = []) => {
    const normalized = normalizePlayable(track);
    if (!normalized?.fileUrl) return false;
    if (idOf(normalized) === idOf(currentTrack)) {
      const audio = audioRef.current;
      if (!audio) return false;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
      return true;
    }
    const nextQueue = (Array.isArray(incomingQueue) ? incomingQueue : [])
      .map(normalizePlayable)
      .filter((item) => item?.fileUrl);
    setQueue(nextQueue);
    autoplayRef.current = true;
    setCurrentTrack(normalized);
    setCurrentTime(0);
    setDuration(normalized.duration || 0);
    return true;
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.fileUrl || !autoplayRef.current) return;
    autoplayRef.current = false;
    audio.load();
    audio.play().catch(() => setIsPlaying(false));
  }, [currentTrack?.fileUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.fileUrl) return;
    if (audio.paused) audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [currentTrack?.fileUrl]);

  const playNext = () => {
    if (!queue.length || !currentTrack) return;
    const index = queue.findIndex((item) => idOf(item) === idOf(currentTrack));
    playTrack(queue[(index + 1 + queue.length) % queue.length], queue);
  };

  return (
    <div className={`listener-v2-root${isLiveRoom ? ' listener-v2-root--room' : ''}`}>
      {!isLiveRoom && <header className="listener-v2-header">
        <button type="button" className="listener-v2-brand" onClick={() => navigate('/listen')} aria-label="Echoo Listener home">
          <img src={echooMark} alt="" /> <span>echoo</span>
        </button>
        <nav className="listener-v2-nav" aria-label="Listener navigation">
          {navItems.map((item) => (
            <button type="button" key={item.key} className={activeKey === item.key ? 'is-active' : ''} onClick={() => navigate(item.path)} aria-current={activeKey === item.key ? 'page' : undefined}>
              {item.label}
            </button>
          ))}
        </nav>
        <SearchField value={headerSearch} onChange={setHeaderSearch} onKeyDown={submitHeaderSearch} placeholder="Search live Channels..." className="listener-v2-header-search" />
        <AccountExperienceMenu
          currentExperience="listener"
          user={user}
          profileImage={profileImage}
          variant="listener"
          onUserChange={setUser}
          unreadNotifications={unreadNotifications}
          onNotifications={() => navigate('/listen/notifications')}
          onSettings={() => navigate('/listen/settings')}
        />
      </header>}

      <main className={`listener-v2-main${currentTrack && !isLiveRoom ? ' has-player' : ''}`}>
        <Outlet context={{ playTrack, currentTrack, isPlaying, togglePlay, setLivePlayerState }} />
      </main>

      <audio
        ref={audioRef}
        src={currentTrack?.fileUrl || undefined}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(Number.isFinite(audioRef.current?.duration) ? audioRef.current.duration : currentTrack?.duration || 0)}
        onEnded={playNext}
      />

      {currentTrack && !isLiveRoom && (
        <section className="listener-v2-player" aria-label="Audio player">
          <span className="listener-v2-player-art"><Artwork src={currentTrack.coverArt} /></span>
          <div className="listener-v2-player-copy"><strong>{currentTrack.title}</strong><span>{currentTrack.subtitle}</span></div>
          <button type="button" className="listener-v2-player-play" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <FiPause /> : <FiPlay />}</button>
          <div className="listener-v2-player-progress"><span style={{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }} /></div>
        </section>
      )}
      {!isLiveRoom && <nav className="listener-v2-mobile-nav" aria-label="Listener navigation">
        {[
          { key: 'live', label: 'Live now', path: '/listen', icon: <FiRadio /> },
          { key: 'following', label: 'Following', path: '/listen/following', icon: <FiHeart /> },
          { key: 'search', label: 'Search', path: '/listen/search', icon: <FiSearch /> },
          { key: 'profile', label: 'Profile', path: '/listen/settings', icon: <FiUser /> },
        ].map((item) => <button key={item.key} type="button" className={activeKey === item.key ? 'is-active' : ''} onClick={() => navigate(item.path)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>}
    </div>
  );
};

const LiveCatalog = () => {
  const navigate = useNavigate();
  const { liveNow, loading, error, reload } = useLiveCatalog();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return liveNow.filter((item) => {
      const categoryMatches = category === 'All categories' || categoryOf(item) === category;
      const queryMatches = !needle || [titleOf(item), stationNameOf(item), categoryOf(item)]
        .some((value) => String(value || '').toLowerCase().includes(needle));
      return categoryMatches && queryMatches;
    });
  }, [liveNow, query, category]);

  const categories = useMemo(() => {
    return ['All categories', ...Array.from(new Set(liveNow.map(categoryOf).filter(Boolean))).sort()];
  }, [liveNow]);

  const openBroadcast = (item) => navigate(`/listen/live/${idOf(item)}`, { state: { show: item } });

  return (
    <div className="listener-v2-page listener-v2-live-page">
      <section className="listener-v2-live-panel">
        <div className="listener-v2-page-header">
          <div><h1>Live now</h1><p>Listen to what’s happening right now.</p></div>
        </div>
        <div className="listener-v2-discovery-tools">
          <label className="listener-v2-category-select"><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><FiChevronDown aria-hidden="true" /></label>
          <SearchField value={query} onChange={setQuery} placeholder="Search live events..." className="listener-v2-inline-search" />
        </div>
        {loading ? (
          <div className="listener-v2-live-grid listener-v2-skeleton-grid">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
        ) : error ? (
          <EmptyState icon={<FiRadio />} title="We couldn’t reach Echoo." copy="Check your connection and try again." action={reload} actionLabel="Try again" />
        ) : filtered.length ? (
          <div className="listener-v2-live-grid">
            {filtered.map((broadcast) => <LiveCard key={idOf(broadcast)} broadcast={broadcast} onOpen={openBroadcast} />)}
          </div>
        ) : (
          <EmptyState
            icon={<FiRadio />}
            title={query ? 'No live events match your search.' : category !== 'All categories' ? `Nothing is live in ${category} right now.` : 'Nothing is live right now.'}
            copy={query ? 'Try another Channel or topic.' : 'Live broadcasts will appear here as soon as creators go live.'}
          />
        )}
      </section>
    </div>
  );
};

const ListenerV2Home = () => <LiveCatalog />;
const ListenerV2Live = () => <LiveCatalog />;

const ListenerV2Following = () => {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const stationResult = await followService.getFollowingStations();
      setStations(Array.isArray(stationResult?.data) ? stationResult.data : []);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || "We couldn't load your followed Channels.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unfollowStation = async (station) => {
    const key = idOf(station);
    if (!key || busyId) return;
    try {
      setBusyId(key);
      await followService.unfollowStation(key);
      setStations((current) => current.filter((item) => idOf(item) !== key));
    } catch (actionError) {
      setError(actionError?.message || 'Could not unfollow this Channel.');
    } finally { setBusyId(''); }
  };

  const liveBroadcastIdOfStation = (station) => (
    station?.liveBroadcastId ||
    station?.currentBroadcastId ||
    station?.activeBroadcastId ||
    station?.liveBroadcast?.id ||
    station?.liveBroadcast?._id ||
    station?.activeBroadcast?.id ||
    station?.activeBroadcast?._id ||
    ''
  );

  const openStation = (station) => {
    const liveBroadcastId = station?.isLive ? liveBroadcastIdOfStation(station) : '';
    navigate(liveBroadcastId ? `/listen/live/${liveBroadcastId}` : `/listen/stations/${idOf(station)}`);
  };

  const liveStations = useMemo(
    () => stations.filter((station) => Boolean(station?.isLive)),
    [stations]
  );

  return (
    <div className="listener-v2-page listener-v2-following-page">
      <header className="listener-v2-page-title"><h1>Following</h1><p>Channels you follow and never miss.</p></header>

      {loading ? (
        <div className="listener-v2-following-skeleton" aria-label="Loading followed Channels"><span /><span /><span /></div>
      ) : error ? (
        <EmptyState icon={<FiHeadphones />} title="We couldn't load your followed Channels." copy="Check your connection and try again." action={load} actionLabel="Try again" />
      ) : stations.length ? (
        <>
          {liveStations.length > 0 && (
            <section className="listener-v2-following-live">
              <h2>Live from your following</h2>
              {liveStations.map((station) => (
                <article className="listener-v2-following-live-card" key={idOf(station)}>
                  <button type="button" className="listener-v2-following-live-art" onClick={() => openStation(station)} aria-label={`Listen to ${station?.name || 'Channel'}`}>
                    <Artwork src={stationArtwork(station)} />
                    <span className="listener-v2-live-badge">LIVE</span>
                  </button>
                  <div>
                    <strong>{station?.name || 'Unnamed Channel'}</strong>
                    <span>{station?.category || 'Channel'}</span>
                    <small><FiUsers /> {formatCount(station?.listenerCount)} listening</small>
                    <button type="button" onClick={() => openStation(station)}><FiPlay /> Listen now</button>
                  </div>
                </article>
              ))}
            </section>
          )}

          <section className="listener-v2-following-all">
            <h2>All following</h2>
            <div className="listener-v2-following-list">
              {stations.map((station) => (
                <article className="listener-v2-following-row" key={idOf(station)}>
                  <button type="button" className="listener-v2-following-art" onClick={() => openStation(station)} aria-label={`Open ${station?.name || 'Channel'}`}>
                    <Artwork src={stationArtwork(station)} />
                    {station?.isLive && <span className="listener-v2-live-badge">LIVE</span>}
                  </button>
                  <button type="button" className="listener-v2-following-copy" onClick={() => openStation(station)}>
                    <strong>{station?.name || 'Unnamed Channel'}</strong>
                    <span>
                      {station?.category || 'Channel'} · {station?.isLive ? `LIVE · ${formatCount(station?.listenerCount)} listening` : `${formatCount(station?.followerCount)} followers`}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="listener-v2-follow-button is-following"
                    disabled={busyId === idOf(station)}
                    onClick={() => unfollowStation(station)}
                    aria-label={`Unfollow ${station?.name || 'Channel'}`}
                  >
                    {busyId === idOf(station) ? '...' : 'Following'}
                  </button>
                  <button type="button" className="listener-v2-following-more" aria-label={`More options for ${station?.name || 'Channel'}`}>
                    <FiChevronDown />
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState icon={<FiHeadphones />} title="You aren't following any Channels yet." action={() => navigate('/listen/search')} actionLabel="Find Channels" />
      )}
    </div>
  );
};

const ListenerV2Categories = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [stations, setStations] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(() => new URLSearchParams(location.search).get('category') || 'All');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [stationsResult, followedResult] = await Promise.allSettled([
        batch2Service.listStations({ page: 1, limit: 100 }),
        followService.getFollowingStations(),
      ]);
      if (stationsResult.status === 'rejected') throw stationsResult.reason;
      setStations((Array.isArray(stationsResult.value?.data) ? stationsResult.value.data : []).filter((item) => item?.isPublic !== false));
      if (followedResult.status === 'fulfilled') setFollowingIds(new Set((followedResult.value?.data || []).map(idOf).filter(Boolean)));
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Channels could not be loaded.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCategory(new URLSearchParams(location.search).get('category') || 'All'); }, [location.search]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(stations.map((station) => station?.category).filter(Boolean))).sort()], [stations]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stations
      .filter((station) => (category === 'All' || station?.category === category) && (!needle || [station?.name, station?.description, station?.category, ...(station?.tags || [])].some((value) => String(value || '').toLowerCase().includes(needle))))
      .sort((a, b) => Number(b?.isLive) - Number(a?.isLive) || Number(b?.listenerCount || 0) - Number(a?.listenerCount || 0) || Number(b?.followerCount || 0) - Number(a?.followerCount || 0));
  }, [stations, category, query]);

  const toggleFollow = async (station) => {
    const key = idOf(station);
    if (!key || busyId) return;
    const following = followingIds.has(key);
    try {
      setBusyId(key);
      if (following) await followService.unfollowStation(key); else await followService.followStation(key);
      setFollowingIds((current) => {
        const next = new Set(current);
        if (following) next.delete(key); else next.add(key);
        return next;
      });
    } catch (actionError) {
      setError(actionError?.message || 'Could not update follow status.');
    } finally { setBusyId(''); }
  };

  return (
    <div className="listener-v2-page">
      <div className="listener-v2-page-header listener-v2-page-header--categories">
        <div><h1>Channels</h1><p>Find Channels by topic and community.</p></div>
        <SearchField value={query} onChange={setQuery} placeholder="Search Channels..." />
      </div>
      {error && <div className="listener-v2-error" role="alert">{error}</div>}

      <section className="listener-v2-panel">
        <SectionTitle title="Browse by category" copy="Choose what you want to listen to" />
        <div className="listener-v2-category-tabs">
          {categories.map((item) => (
            <button type="button" key={item} className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)}>{item === 'All' ? 'All Channels' : item}</button>
          ))}
        </div>
      </section>

      <section className="listener-v2-panel">
        <SectionTitle title={category === 'All' ? 'Explore Channels' : category} copy={`${visible.length} Channel${visible.length === 1 ? '' : 's'}`} />
        {loading ? <div className="listener-v2-station-grid listener-v2-skeleton-grid">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div> : visible.length ? (
          <div className="listener-v2-station-grid">
            {visible.map((station) => (
              <StationCard
                key={idOf(station)}
                station={station}
                following={followingIds.has(idOf(station))}
                busy={busyId === idOf(station)}
                onOpen={(item) => navigate(`/listen/stations/${idOf(item)}`)}
                onFollow={toggleFollow}
              />
            ))}
          </div>
        ) : <EmptyState icon={<FiSearch />} title="No Channels found" copy="Try another category or search term." action={() => { setQuery(''); setCategory('All'); }} actionLabel="Clear filters" />}
      </section>
    </div>
  );
};

const ListenerV2Search = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') || '');
  const [data, setData] = useState({ tracks: [], creators: [], stations: [], playlists: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (location.pathname !== '/listen/stations' && location.pathname !== '/listen/categories') return;
    const legacyCategory = new URLSearchParams(location.search).get('category');
    navigate(
      legacyCategory ? `/listen/search?q=${encodeURIComponent(legacyCategory)}` : '/listen/search',
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get('q') || '');
  }, [location.search]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setData({ tracks: [], creators: [], stations: [], playlists: [] });
      setLoading(false);
      setError('');
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const response = await batch1Service.globalSearch(clean, { page: 1, limit: 20 });
        if (!active) return;
        const results = response?.data?.results || {};
        setData({
          tracks: Array.isArray(results.tracks) ? results.tracks.map(normalizePlayable).filter(Boolean) : [],
          creators: Array.isArray(results.creators) ? results.creators : [],
          stations: Array.isArray(results.stations) ? results.stations : [],
          playlists: Array.isArray(results.playlists) ? results.playlists : [],
        });
        setError('');
      } catch (searchError) {
        if (active) {
          setData({ tracks: [], creators: [], stations: [], playlists: [] });
          setError(searchError?.message || 'Search failed.');
        }
      } finally { if (active) setLoading(false); }
    }, 280);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  const total = data.tracks.length + data.creators.length + data.stations.length + data.playlists.length;

  return (
    <div className="listener-v2-page listener-v2-search-page">
      <header className="listener-v2-page-title"><h1>Search</h1><p>Find live events, Channels, creators and recorded audio.</p></header>
      <SearchField value={query} onChange={setQuery} placeholder="Search Echoo..." autoFocus />
      {error && <div className="listener-v2-error" role="alert">{error}</div>}
      {loading && <div className="listener-v2-search-status">Searching Echoo…</div>}

      {!loading && query.trim().length < 2 && (
        <section className="listener-v2-panel listener-v2-search-start">
          <span><FiSearch /></span><h2>What do you want to hear?</h2><p>Search by creator, Channel, topic or audio title.</p>
          <div>{CATEGORY_FALLBACK.slice(0, 6).map((item) => <button type="button" key={item} onClick={() => setQuery(item)}>{item}</button>)}</div>
        </section>
      )}

      {!loading && query.trim().length >= 2 && total === 0 && !error && <EmptyState icon={<FiSearch />} title="No results found" copy={`Nothing on Echoo matches “${query.trim()}”.`} />}

      {data.creators.length > 0 && (
        <section className="listener-v2-panel"><SectionTitle title="Creators" copy={`${data.creators.length} result${data.creators.length === 1 ? '' : 's'}`} />
          <div className="listener-v2-creator-grid">{data.creators.map((creator) => <CreatorCard key={idOf(creator) || creator?.username} creator={creator} onOpen={(item) => { const path = getCreatorProfilePath(item); if (path) navigate(path); }} />)}</div>
        </section>
      )}

      {data.stations.length > 0 && (
        <section className="listener-v2-panel"><SectionTitle title="Channels" copy={`${data.stations.length} result${data.stations.length === 1 ? '' : 's'}`} />
          <div className="listener-v2-station-grid">{data.stations.map((station) => <StationCard key={idOf(station)} station={station} onOpen={(item) => navigate(`/listen/stations/${idOf(item)}`)} />)}</div>
        </section>
      )}

      {data.tracks.length > 0 && (
        <section className="listener-v2-panel"><SectionTitle title="Audio" copy={`${data.tracks.length} result${data.tracks.length === 1 ? '' : 's'}`} />
          <div className="listener-v2-audio-list">{data.tracks.map((track) => {
            const playing = idOf(currentTrack) === idOf(track) && isPlaying;
            return <article key={idOf(track)}><span className="listener-v2-audio-art"><Artwork src={track?.coverArt} /></span><div><strong>{track?.title}</strong><span>{track?.subtitle || 'Echoo Audio'}</span></div><button type="button" onClick={() => playing ? togglePlay() : playTrack(track, data.tracks)}>{playing ? <FiPause /> : <FiPlay />}</button></article>;
          })}</div>
        </section>
      )}

      {data.playlists.length > 0 && (
        <section className="listener-v2-panel"><SectionTitle title="Playlists" copy={`${data.playlists.length} result${data.playlists.length === 1 ? '' : 's'}`} />
          <div className="listener-v2-playlist-grid">{data.playlists.map((playlist) => <article key={idOf(playlist)}><span><FiMusic /></span><div><strong>{playlist?.name || playlist?.title || 'Playlist'}</strong><small>{playlist?.description || 'Public playlist'}</small></div></article>)}</div>
        </section>
      )}
    </div>
  );
};

export {
  ListenerV2Categories,
  ListenerV2Following,
  ListenerV2Home,
  ListenerV2Layout,
  ListenerV2Live,
  ListenerV2Search,
};
