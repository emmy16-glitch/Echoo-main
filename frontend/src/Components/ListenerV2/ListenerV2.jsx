import { readListenerVolume, saveListenerVolume } from '../../services/listenerVolume';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import {
  FiArrowRight,
  FiCalendar,
  FiBookOpen,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiHeadphones,
  FiHeart,
  FiMusic,
  FiPause,
  FiRotateCcw,
  FiRotateCw,
  FiPlay,
  FiRadio,
  FiSearch,
  FiSkipBack,
  FiSkipForward,
  FiUser,
  FiUsers,
  FiX,
} from 'react-icons/fi';

import listenerService from '../../services/listenerService';
import followService from '../../services/followService';
import batch1Service from '../../services/batch1Service';
import batch2Service from '../../services/batch2Service';
import audioService from '../../services/audioService';
import notificationService from '../../services/notificationService';
import { apiRequest, buildMediaUrl } from '../../services/api';
import { getGuestSession, isAuthenticated, recordGuestPlayback, saveGuestPreferences } from '../../services/guestSession';
import { useGuestAuth } from '../Auth/GuestAuthGate';
import { getCreatorProfilePath } from '../../services/profileIdentifier';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding';
import AccountExperienceMenu from '../Shared/AccountExperienceMenu';
import FollowingRecordings from './FollowingRecordings';
import ContinueListening from './ContinueListening';
import LiveKitListenerPlayer from '../ListenerLiveExperience/LiveKitListenerPlayer';
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

const formatPlaybackTime = (seconds) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
};

const releaseDateOf = (track) => track?.publishedAt || track?.createdAt || track?.updatedAt || null;
const formatReleaseLabel = (track) => {
  const raw = releaseDateOf(track);
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const releaseDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((today - releaseDay) / 86400000);
  if (days === 0) return 'Released today';
  if (days === 1) return 'Released yesterday';
  return `Released ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
};
const isRecentRelease = (track) => {
  const raw = releaseDateOf(track);
  const stamp = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(stamp) && Date.now() - stamp <= 7 * 86400000 && Date.now() >= stamp;
};
const formatUpcomingDate = (broadcast) => {
  const date = broadcast?.startTime ? new Date(broadcast.startTime) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Scheduled';
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const playbackErrorMessage = (error) => {
  if (error?.name === 'NotAllowedError') {
    return 'Playback was blocked by the browser. Press Play again.';
  }
  if (error?.name === 'NotSupportedError') {
    return 'This audio format cannot be played by this browser.';
  }
  return 'Echoo could not play this audio. Check your connection and try again.';
};
const liveMiniStatusLabel = (session, state) => {
  if (!session?.isLive) return 'Broadcast ended';
  if (state?.needsAudioStart) return 'Tap Play to hear audio';
  if (state?.isPlaying) return 'Audio live';

  switch (state?.status) {
    case 'holding':
      return 'Weak connection — staying live';
    case 'reconnecting':
      return 'Reconnecting audio…';
    case 'recovering_audio':
      return 'Recovering audio…';
    case 'waiting_for_program':
    case 'connected':
      return 'Waiting for creator';
    case 'connecting':
      return 'Creator connecting';
    case 'disconnected':
    case 'failed':
      return 'Audio disconnected';
    case 'idle':
      return 'Broadcast ended';
    default:
      return 'Connecting…';
  }
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
      aria-label={placeholder}
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
  const title = titleOf(broadcast);
  const station = stationNameOf(broadcast);
  const listenerCount = broadcast?.listenerCount ?? broadcast?.station?.listenerCount;
  const duplicateStation = String(title || '').trim().toLowerCase() === String(station || '').trim().toLowerCase();

  return (
    <article className="listener-v2-live-card">
      <button
        type="button"
        className="listener-v2-live-art"
        onClick={() => onOpen(broadcast)}
        aria-label={`Listen to ${title}`}
      >
        <Artwork src={art} />
        <span className="listener-v2-live-badge">LIVE</span>
      </button>
      <button type="button" className="listener-v2-live-meta" onClick={() => onOpen(broadcast)}>
        <span className="listener-v2-live-copy">
          <strong>{title}</strong>
          {!duplicateStation && <span>{station}</span>}
          {listenerCount != null && (
            <small className="listener-v2-live-count"><FiHeadphones /> {formatCount(listenerCount)} listening</small>
          )}
        </span>
        <span className="listener-v2-live-cta">Listen <FiChevronRight aria-hidden="true" /></span>
      </button>
    </article>
  );
};

const UpcomingCard = ({ broadcast, onOpen }) => (
  <article className="listener-v2-upcoming-card">
    <button type="button" className="listener-v2-upcoming-art" onClick={() => onOpen(broadcast)}>
      <Artwork src={broadcastArtwork(broadcast)} />
      <span><FiCalendar /> Upcoming</span>
    </button>
    <button type="button" className="listener-v2-upcoming-copy" onClick={() => onOpen(broadcast)}>
      <strong>{titleOf(broadcast)}</strong>
      <span>{stationNameOf(broadcast)}</span>
      <small>{formatUpcomingDate(broadcast)}</small>
    </button>
  </article>
);

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
        {(live ? station?.listenerCount : station?.followerCount) != null && <small>{live ? <><FiUsers /> {formatCount(station.listenerCount)} listening</> : `${formatCount(station.followerCount)} followers`}</small>}
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
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (isAuthenticated()) {
        const response = await listenerService.getDashboard();
        setLiveNow(Array.isArray(response?.data?.liveNow) ? response.data.liveNow : []);
        setUpcoming(
          (Array.isArray(response?.data?.upcoming) ? response.data.upcoming : [])
            .slice()
            .sort((a, b) => new Date(a?.startTime || 0) - new Date(b?.startTime || 0))
        );
      } else {
        const [liveResult, upcomingResult] = await Promise.allSettled([
          batch2Service.listBroadcasts({
            status: 'live',
            page: 1,
            limit: 100,
            cache: 'no-store',
          }),
          batch2Service.listBroadcasts({
            status: 'scheduled',
            page: 1,
            limit: 24,
            cache: 'no-store',
          }),
        ]);
        if (liveResult.status === 'rejected') throw liveResult.reason;
        setLiveNow(
          (Array.isArray(liveResult.value?.data) ? liveResult.value.data : [])
            .filter((broadcast) => broadcast?.isPublic !== false)
        );
        setUpcoming(
          upcomingResult.status === 'fulfilled'
            ? (Array.isArray(upcomingResult.value?.data) ? upcomingResult.value.data : [])
                .filter((broadcast) => broadcast?.isPublic !== false)
                .sort((a, b) => new Date(a?.startTime || 0) - new Date(b?.startTime || 0))
            : []
        );
      }
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

  return { liveNow, upcoming, loading, error, reload: load };
};

const ListenerV2Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(readUser);
  const audioRef = useRef(null);
  const autoplayRef = useRef(false);
  const pendingSeekRef = useRef(null);
  const lastProgressRef = useRef({ id: null, time: 0 });
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerError, setPlayerError] = useState('');
  const [playbackState, setPlaybackState] = useState('idle');
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [livePlayerState, setLivePlayerState] = useState(null);
  const [liveSession, setLiveSession] = useState(null);
  const [listenerVolume, setListenerVolume] = useState(readListenerVolume);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = listenerVolume; }, [listenerVolume]);
  useEffect(() => {
    const syncVolume = () => setListenerVolume(readListenerVolume());
    window.addEventListener('echoo:listener-volume', syncVolume);
    return () => window.removeEventListener('echoo:listener-volume', syncVolume);
  }, []);
  const [headerSearch, setHeaderSearch] = useState('');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { requestAuth, isGuest } = useGuestAuth();

  const profileImage = buildMediaUrl(user?.profileImage || user?.avatar);
  const isLiveRoom = /^\/listen\/live\/[^/]+/.test(location.pathname);

  const activeKey = useMemo(() => {
    if (location.pathname.includes('/library/following')) return 'following';
    if (location.pathname === '/listen/following') return 'following';
    // Live and Channel/category pages are subviews of existing Listener destinations,
    // not separate primary navigation items. Keep one truthful primary tab active so
    // users never lose orientation after opening Live or browsing Channels.
    if (location.pathname === '/listen/live' || location.pathname.startsWith('/listen/live/')) return 'discover';
    if (['/listen/settings', '/listen/profile', '/listen/notifications'].includes(location.pathname)) return 'profile';
    if (
      ['/listen/library', '/listen/history', '/listen/downloads', '/listen/playlist', '/listen/saved-moments'].includes(location.pathname) ||
      location.pathname.startsWith('/listen/audio/') ||
      location.pathname.startsWith('/listen/collections/')
    ) return 'library';
    if (
      location.pathname === '/listen/search' ||
      location.pathname.startsWith('/listen/creator/')
    ) return 'search';
    if (
      location.pathname === '/listen/channels' ||
      location.pathname.startsWith('/listen/channels/') ||
      location.pathname === '/listen/stations' ||
      location.pathname.startsWith('/listen/stations/') ||
      location.pathname === '/listen/categories'
    ) return 'search';
    return 'discover';
  }, [location.pathname]);

  useEffect(() => {
    const id = liveSession?.broadcastId;
    if (!id || !liveSession?.isLive) return;
    let active = true;
    const check = () => apiRequest(`/broadcasts/${encodeURIComponent(id)}/public`, { cache: 'no-store', skipAuth: true }).then(response => {
      const status = response?.data?.status;
      if (active && status && status !== 'live') setLiveSession(current => current?.broadcastId === id ? { ...current, isLive: false } : current);
    }).catch(() => { /* A failed presence request must not interrupt healthy audio. */ });
    const interval = window.setInterval(check, LIVE_SYNC_MS);
    window.addEventListener('focus', check);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', check); };
  }, [liveSession?.broadcastId, liveSession?.isLive]);

  const navItems = [
    { key: 'discover', label: 'Discover', path: '/listen', icon: <FiMusic /> },
    { key: 'following', label: 'Following', path: '/listen/following', icon: <FiHeart /> },
    { key: 'library', label: 'Library', path: '/listen/library', icon: <FiBookOpen /> },
    { key: 'search', label: 'Search', path: '/listen/search', icon: <FiSearch /> },
    { key: 'profile', label: 'Profile', path: '/listen/profile', icon: <FiUser /> },
  ];

  useEffect(() => {
    if (isGuest) getGuestSession();
  }, [isGuest]);

  useEffect(() => {
    let active = true;
    if (isGuest) return () => { active = false; };
    notificationService.list({ limit: 1, unreadOnly: true })
      .then((response) => {
        if (active) setUnreadNotifications(Number(response?.data?.unreadCount) || 0);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [isGuest]);

  const submitHeaderSearch = (event) => {
    if (event.key !== 'Enter' || !headerSearch.trim()) return;
    navigate(`/listen/search?q=${encodeURIComponent(headerSearch.trim())}`);
  };

  const playAudioElement = useCallback(async (audio) => {
    if (!audio) return false;
    try {
      setPlayerError('');
      setPlaybackState('loading');
      await audio.play();
      setIsPlaying(true);
      setPlaybackState('playing');
      return true;
    } catch (error) {
      setIsPlaying(false);
      setPlaybackState('error');
      setPlayerError(playbackErrorMessage(error));
      return false;
    }
  }, []);

  const playTrack = useCallback((track, incomingQueue = []) => {
    const normalized = normalizePlayable(track);
    if (!normalized?.fileUrl) {
      setPlayerError('This audio does not have a playable file attached to it.');
      setPlaybackState('error');
      return false;
    }
    setLiveSession(null);
    if (idOf(normalized) === idOf(currentTrack)) {
      const audio = audioRef.current;
      if (!audio) return false;
      if (audio.paused) void playAudioElement(audio);
      else audio.pause();
      return true;
    }
    const nextQueue = (Array.isArray(incomingQueue) ? incomingQueue : [])
      .map(normalizePlayable)
      .filter((item) => item?.fileUrl);
    setQueue(nextQueue);
    pendingSeekRef.current = null;
    autoplayRef.current = true;
    setPlayerError('');
    setPlaybackState('loading');
    setCurrentTrack(normalized);
    setCurrentTime(0);
    setDuration(normalized.duration || 0);
    if (isGuest) recordGuestPlayback(normalized, 0, nextQueue);
    return true;
  }, [currentTrack, isGuest, playAudioElement]);

  useEffect(() => {
    if (!isGuest) return;
    saveGuestPreferences({ lastVolume: audioRef.current?.volume ?? 1 });
  }, [isGuest]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.fileUrl || !autoplayRef.current) return;
    autoplayRef.current = false;
    audio.load();
    void playAudioElement(audio);
  }, [currentTrack?.fileUrl, playAudioElement]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.fileUrl) {
      setPlayerError('Choose an audio track first.');
      return;
    }
    if (audio.paused) {
      if (playbackState === 'error') audio.load();
      void playAudioElement(audio);
    } else {
      audio.pause();
    }
  }, [currentTrack?.fileUrl, playbackState, playAudioElement]);

  const seekTo = useCallback((seconds) => {
    const audio = audioRef.current;
    const requested = Math.max(0, Number(seconds) || 0);
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      pendingSeekRef.current = requested;
      setCurrentTime(requested);
      return requested;
    }
    const target = Math.min(requested, audio.duration);
    audio.currentTime = target;
    pendingSeekRef.current = null;
    setCurrentTime(target);
    return target;
  }, []);

  const playTrackAt = useCallback((track, seconds, incomingQueue = []) => {
    const normalized = normalizePlayable(track);
    const requested = Math.max(0, Number(seconds) || 0);
    if (!normalized?.fileUrl) {
      setPlayerError('This audio does not have a playable file attached to it.');
      setPlaybackState('error');
      return false;
    }

    if (idOf(normalized) === idOf(currentTrack) && audioRef.current) {
      seekTo(requested);
      if (audioRef.current.paused) void playAudioElement(audioRef.current);
      return true;
    }

    const played = playTrack(normalized, incomingQueue);
    if (played) pendingSeekRef.current = requested;
    return played;
  }, [currentTrack, playAudioElement, playTrack, seekTo]);

  const seekBy = useCallback((deltaSeconds) => {
    const base = Number(audioRef.current?.currentTime) || 0;
    return seekTo(base + Number(deltaSeconds || 0));
  }, [seekTo]);

  const playNext = useCallback(() => {
    if (!queue.length || !currentTrack) return;
    const index = queue.findIndex((item) => idOf(item) === idOf(currentTrack));
    playTrack(queue[(index + 1 + queue.length) % queue.length], queue);
  }, [currentTrack, playTrack, queue]);

  const playPrevious = useCallback(() => {
    if (!queue.length || !currentTrack) return;
    const index = queue.findIndex((item) => idOf(item) === idOf(currentTrack));
    playTrack(queue[(index - 1 + queue.length) % queue.length], queue);
  }, [currentTrack, playTrack, queue]);

  useEffect(() => {
    if (!playerExpanded) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPlayerExpanded(false);
    };
    document.documentElement.classList.add('listener-v2-full-player-open');
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.documentElement.classList.remove('listener-v2-full-player-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [playerExpanded]);

  useEffect(() => {
    if (!isLiveRoom) return;
    setPlayerExpanded(false);
    if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
  }, [isLiveRoom]);

  useEffect(() => {
    if (liveSession?.isLive || !currentTrack || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return undefined;
    try {
      if (typeof window.MediaMetadata === 'function') {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: currentTrack.title || 'Echoo audio',
          artist: currentTrack.subtitle || 'Echoo Creator',
          album: 'Echoo',
          artwork: currentTrack.coverArt ? [{ src: currentTrack.coverArt, sizes: '512x512' }] : [],
        });
      }
      navigator.mediaSession.setActionHandler('play', () => { void playAudioElement(audioRef.current); });
      navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
      navigator.mediaSession.setActionHandler('seekbackward', (details) => seekBy(-(Number(details?.seekOffset) || 15)));
      navigator.mediaSession.setActionHandler('seekforward', (details) => seekBy(Number(details?.seekOffset) || 15));
      navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
    } catch {
      // Media Session is an enhancement; the HTML audio player remains authoritative.
    }
    return () => {
      try {
        for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack']) {
          navigator.mediaSession.setActionHandler(action, null);
        }
      } catch {
        // Already unsupported or cleared.
      }
    };
  }, [currentTrack, liveSession?.isLive, playAudioElement, playNext, playPrevious, seekBy]);

  useEffect(() => {
    try {
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && currentTrack) {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      }
    } catch {
      // Best-effort lock-screen state.
    }
  }, [currentTrack, isPlaying]);

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
        {activeKey !== 'search' && <SearchField value={headerSearch} onChange={setHeaderSearch} onKeyDown={submitHeaderSearch} placeholder="Search Echoo..." className="listener-v2-header-search" />}
        {isGuest ? (
          <div className="listener-v2-guest-actions">
            <button type="button" className="listener-v2-sign-in" onClick={() => requestAuth({
              action: 'Sign in',
              title: 'Make Echoo yours',
              message: 'Create an account to follow creators, save audio and keep listening across devices.',
            })}>Sign in</button>
          </div>
        ) : (
          <AccountExperienceMenu
            currentExperience="listener"
            user={user}
            profileImage={profileImage}
            variant="listener"
            onUserChange={setUser}
            unreadNotifications={unreadNotifications}
            onNotifications={() => navigate('/listen/notifications')}
            onSettings={() => navigate('/listen/settings')}
            onHelp={() => navigate('/listen/settings?section=help')}
          />
        )}
      </header>}

      <main className={`listener-v2-main${(currentTrack || liveSession) && !isLiveRoom ? ' has-player' : ''}`}>
        <Outlet
          context={{
            playTrack,
            playTrackAt,
            seekTo,
            seekBy,
            playPrevious,
            playNext,
            currentTrack,
            currentTime,
            duration,
            queue,
            isPlaying,
            togglePlay,
            playerError,
            playbackState,
            livePlayerState,
            setLiveSession,
          }}
        />
      </main>

      <div hidden aria-hidden="true">
        <LiveKitListenerPlayer broadcastId={liveSession?.broadcastId} isLive={Boolean(liveSession?.isLive)} track={liveSession?.track} guest={Boolean(liveSession?.guest)} onStateChange={setLivePlayerState} />
      </div>
      {liveSession && !isLiveRoom && <section className="listener-v2-player listener-v2-live-mini" aria-label="Live mini player">
        <button type="button" className="listener-v2-player-art" aria-label="Open live room" onClick={() => navigate(`/listen/live/${liveSession.broadcastId}`)}><Artwork src={liveSession.track?.coverArt} /></button>
        <button type="button" className="listener-v2-player-copy" onClick={() => navigate(`/listen/live/${liveSession.broadcastId}`)}><strong>{liveSession.isLive ? 'LIVE' : 'ENDED'} · {liveSession.track?.title}</strong><span>{liveMiniStatusLabel(liveSession, livePlayerState)} · {liveSession.track?.subtitle}</span></button>
        <button type="button" className="listener-v2-player-play" onClick={livePlayerState?.onTogglePlay} disabled={!liveSession.isLive} aria-label={livePlayerState?.isPlaying ? 'Pause live audio' : 'Resume live audio'}>{livePlayerState?.isPlaying ? <FiPause /> : <FiPlay />}</button>
        <button type="button" aria-label="Stop live audio" onClick={() => setLiveSession(null)}><FiX /></button>
      </section>}
      <audio
        ref={audioRef}
        src={currentTrack?.fileUrl || undefined}
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
          setPlaybackState('playing');
          setPlayerError('');
        }}
        onPause={() => {
          setIsPlaying(false);
          if (!audioRef.current?.ended) setPlaybackState('paused');
        }}
        onWaiting={() => {
          if (!audioRef.current?.paused) setPlaybackState('buffering');
        }}
        onPlaying={() => {
          setIsPlaying(true);
          setPlaybackState('playing');
          setPlayerError('');
        }}
        onTimeUpdate={() => {
          const position = audioRef.current?.currentTime || 0;
          setCurrentTime(position);
          if (isGuest && currentTrack) recordGuestPlayback(currentTrack, position, queue);
          const id = idOf(currentTrack);
          if (!isGuest && /^[a-f\d]{24}$/i.test(id) && duration > 0 && (lastProgressRef.current.id !== id || Math.abs(position - lastProgressRef.current.time) >= 10)) {
            lastProgressRef.current = { id, time: position };
            listenerService.updateProgress({ trackId: id, progress: position, duration }).catch(() => {});
          }
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          const resolvedDuration = Number.isFinite(audio?.duration)
            ? audio.duration
            : currentTrack?.duration || 0;
          setDuration(resolvedDuration);
          if (audio && pendingSeekRef.current !== null && resolvedDuration > 0) {
            const target = Math.min(Math.max(0, Number(pendingSeekRef.current) || 0), resolvedDuration);
            audio.currentTime = target;
            setCurrentTime(target);
            pendingSeekRef.current = null;
          }
        }}
        onCanPlay={() => {
          const audio = audioRef.current;
          if (audio && pendingSeekRef.current !== null && Number.isFinite(audio.duration) && audio.duration > 0) {
            const target = Math.min(Math.max(0, Number(pendingSeekRef.current) || 0), audio.duration);
            audio.currentTime = target;
            setCurrentTime(target);
            pendingSeekRef.current = null;
          }
          if (audio?.paused && playbackState === 'buffering') setPlaybackState('paused');
        }}
        onError={() => {
          setIsPlaying(false);
          setPlaybackState('error');
          setPlayerError('Echoo could not load this audio. Check your connection and try again.');
        }}
        onEnded={() => {
          setIsPlaying(false);
          setPlaybackState('ended');
          if (!isGuest && currentTrack) listenerService.updateProgress({ trackId: idOf(currentTrack), progress: duration, duration, completed: true }).catch(() => {});
          playNext();
        }}
      />

      {currentTrack && !liveSession && !isLiveRoom && (
        <>
          <section className={`listener-v2-player${playerError ? ' has-error' : ''}`} aria-label="Audio player">
            <button type="button" className="listener-v2-player-track" onClick={() => setPlayerExpanded(true)} aria-label="Open full player">
              <span className="listener-v2-player-art"><Artwork src={currentTrack.coverArt} /></span>
              <span className="listener-v2-player-copy">
                <strong>{currentTrack.title}</strong>
                <span role={playerError ? 'alert' : undefined}>
                  {playerError || (playbackState === 'buffering' ? 'Buffering…' : currentTrack.subtitle)}
                </span>
              </span>
            </button>
            <div className="listener-v2-player-transport">
              <button type="button" onClick={() => seekBy(-15)} aria-label="Back 15 seconds"><FiRotateCcw /></button>
              <button
                type="button"
                className="listener-v2-player-play"
                onClick={togglePlay}
                aria-label={playerError ? 'Retry playback' : isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <FiPause /> : <FiPlay />}
              </button>
              <button type="button" onClick={() => seekBy(15)} aria-label="Forward 15 seconds"><FiRotateCw /></button>
            </div>
            <label className="listener-v2-player-seek">
              <span>{formatPlaybackTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={Math.max(1, duration)}
                step="1"
                value={Math.min(currentTime, Math.max(1, duration))}
                onChange={(event) => seekTo(Number(event.target.value))}
                aria-label="Playback position"
              />
              <span>{formatPlaybackTime(duration)}</span>
            </label>
          </section>

          {playerExpanded && (
            <div className="listener-v2-full-player">
              <button type="button" className="listener-v2-full-player-backdrop" aria-label="Minimize player" onClick={() => setPlayerExpanded(false)} />
              <section className="listener-v2-full-player-sheet" role="dialog" aria-modal="true" aria-label="Now playing">
                <header>
                  <div><span>NOW PLAYING</span><strong>{currentTrack.title}</strong></div>
                  <button type="button" onClick={() => setPlayerExpanded(false)} aria-label="Minimize player"><FiX /></button>
                </header>
                <div className="listener-v2-full-player-body">
                  <div className="listener-v2-full-player-art"><Artwork src={currentTrack.coverArt} /></div>
                  <div className="listener-v2-full-player-copy">
                    <h2>{currentTrack.title}</h2>
                    <p>{currentTrack.subtitle}</p>
                    {playerError && <small role="alert">{playerError}</small>}
                  </div>
                  <label className="listener-v2-full-player-seek">
                    <input
                      type="range"
                      min="0"
                      max={Math.max(1, duration)}
                      step="1"
                      value={Math.min(currentTime, Math.max(1, duration))}
                      onChange={(event) => seekTo(Number(event.target.value))}
                      aria-label="Playback position"
                    />
                    <span><b>{formatPlaybackTime(currentTime)}</b><b>{formatPlaybackTime(duration)}</b></span>
                  </label>
                  <div className="listener-v2-full-player-controls">
                    <button type="button" onClick={playPrevious} disabled={queue.length < 2} aria-label="Previous track"><FiSkipBack /></button>
                    <button type="button" onClick={() => seekBy(-15)} aria-label="Back 15 seconds"><FiRotateCcw /><span>15</span></button>
                    <button type="button" className="primary" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <FiPause /> : <FiPlay />}</button>
                    <button type="button" onClick={() => seekBy(15)} aria-label="Forward 15 seconds"><FiRotateCw /><span>15</span></button>
                    <button type="button" onClick={playNext} disabled={queue.length < 2} aria-label="Next track"><FiSkipForward /></button>
                  </div>
                  <label className="listener-volume-control">Volume <input type="range" min="0" max="1" step="0.01" value={listenerVolume} aria-label="Playback volume" onChange={(event) => setListenerVolume(saveListenerVolume(event.target.value))} /></label>
                  <p className="listener-v2-full-player-hint">Minimize this player and Echoo keeps the audio playing while you browse Listener.</p>
                </div>
              </section>
            </div>
          )}
        </>
      )}
      {!isLiveRoom && <nav className="listener-v2-mobile-nav" aria-label="Listener navigation">
        {[
          { key: 'discover', label: 'Discover', path: '/listen', icon: <FiMusic /> },
          { key: 'following', label: 'Following', path: '/listen/following', icon: <FiHeart /> },
          { key: 'library', label: 'Library', path: '/listen/library', icon: <FiBookOpen /> },
          { key: 'search', label: 'Search', path: '/listen/search', icon: <FiSearch /> },
          { key: 'profile', label: 'Profile', path: '/listen/profile', icon: <FiUser /> },
        ].map((item) => <button key={item.key} type="button" className={activeKey === item.key ? 'is-active' : ''} aria-current={activeKey === item.key ? 'page' : undefined} onClick={() => {
          if (isGuest && item.key === 'profile') {
            requestAuth({
              action: 'Open Profile',
              title: 'Save your listening setup',
              message: 'Sign in to manage your profile, preferences and notifications.',
              destination: item.path,
            });
            return;
          }
          navigate(item.path);
        }}><span>{item.icon}</span>{item.label}</button>)}
      </nav>}
    </div>
  );
};

const LiveCatalog = () => {
  const navigate = useNavigate();
  const { liveNow, upcoming, loading, error, reload } = useLiveCatalog();
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

      <section className="listener-v2-live-upcoming">
        <div className="listener-v2-page-header listener-v2-page-header--compact">
          <div><h2>Upcoming</h2><p>Scheduled public broadcasts, earliest first.</p></div>
        </div>
        {upcoming.length ? (
          <div className="listener-v2-upcoming-grid">
            {upcoming.slice(0, 8).map((broadcast) => (
              <UpcomingCard key={idOf(broadcast)} broadcast={broadcast} onOpen={openBroadcast} />
            ))}
          </div>
        ) : (
          <div className="listener-v2-upcoming-empty"><FiCalendar /><span>No scheduled broadcasts yet.</span></div>
        )}
      </section>
    </div>
  );
};

const DiscoverCatalog = () => {
  const navigate = useNavigate();
  const { playTrack } = useOutletContext();
  const { liveNow, upcoming, loading: liveLoading, error: liveError, reload } = useLiveCatalog();
  const [recordings, setRecordings] = useState([]);
  const [recordingsLoading, setRecordingsLoading] = useState(true);
  const [recordingsError, setRecordingsError] = useState('');

  useEffect(() => {
    let active = true;
    audioService.getAll({ public: true, page: 1, limit: 8 })
      .then((result) => {
        if (!active) return;
        setRecordings(
          (result?.data || [])
            .map(normalizePlayable)
            .filter(Boolean)
            .sort((a, b) => new Date(releaseDateOf(b) || 0) - new Date(releaseDateOf(a) || 0))
        );
        setRecordingsError('');
      })
      .catch(() => {
        if (active) setRecordingsError('Recordings could not load. Refresh to try again.');
      })
      .finally(() => {
        if (active) setRecordingsLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="listener-v2-page listener-v2-discover-page">
      <header className="listener-v2-page-title"><h1>Discover</h1></header>

      <section className="listener-v2-panel">
        <SectionTitle title="Live now" action={() => navigate('/listen/live')} />
        {liveLoading ? <div className="listener-v2-row-skeleton" role="status" aria-label="Loading live broadcasts"><span /><span /><span /></div> : liveError ? <EmptyState icon={<FiRadio />} title="Live broadcasts are unavailable" copy={liveError} action={reload} actionLabel="Try again" /> : liveNow.length ? (
          <div className="listener-v2-live-grid">{liveNow.slice(0, 5).map((item) => <LiveCard key={idOf(item)} broadcast={item} onOpen={(broadcast) => navigate(`/listen/live/${idOf(broadcast)}`, { state: { show: broadcast } })} />)}</div>
        ) : (
          <EmptyState icon={<FiRadio />} title="Nothing live right now" />
        )}
      </section>

      {upcoming.length > 0 && <section className="listener-v2-panel">
        <SectionTitle title="Upcoming broadcasts" copy="Starting soon" action={() => navigate('/listen/live')} actionLabel="See schedule" />
        {upcoming.length ? (
          <div className="listener-v2-upcoming-grid">
            {upcoming.slice(0, 6).map((broadcast) => (
              <UpcomingCard
                key={idOf(broadcast)}
                broadcast={broadcast}
                onOpen={(item) => navigate(`/listen/live/${idOf(item)}`, { state: { show: item } })}
              />
            ))}
          </div>
        ) : (
          <div className="listener-v2-upcoming-empty"><FiCalendar /><span>No public broadcasts are scheduled yet.</span></div>
        )}
      </section>}

      <ContinueListening />
      <section className="listener-v2-panel">
        <SectionTitle title="Latest recordings" action={() => navigate('/listen/search')} actionLabel="Search" />
        {recordingsLoading ? <div className="listener-v2-row-skeleton" role="status" aria-label="Loading recordings"><span /><span /><span /></div> : recordingsError ? <p role="alert">{recordingsError}</p> : recordings.length ? (
          <div className="listener-v2-audio-list listener-v2-release-list">
            {recordings.slice(0, 8).map((track) => (
              <article key={idOf(track)}>
                <span className="listener-v2-audio-art"><Artwork src={track.coverArt} /></span>
                <div className="listener-v2-release-copy">
                  <strong>{track.title}</strong>
                  <span>{track.subtitle}</span>
                  <small>
                    {isRecentRelease(track) && <b>NEW</b>}
                    {formatReleaseLabel(track)}
                    {track.duration > 0 ? ` · ${formatPlaybackTime(track.duration)}` : ''}
                  </small>
                </div>
                <button type="button" aria-label={`Play ${track.title}`} onClick={() => playTrack(track, recordings)}><FiPlay /></button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={<FiMusic />} title="No recordings yet" />
        )}
      </section>

      <FollowingRecordings excludeIds={recordings.map(idOf)} />

    </div>
  );
};

const ListenerV2Home = () => <DiscoverCatalog />;
const ListenerV2Live = () => <LiveCatalog />;

const ListenerV2Following = () => {
  const navigate = useNavigate();
  const { isGuest } = useGuestAuth();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    // Logged-out visitors have no follow list to fetch — a 401 here is "not
    // signed in", not a connection failure, so skip the request entirely and
    // render the sign-in state instead of an error banner.
    if (isGuest) {
      setStations([]);
      setError('');
      setLoading(false);
      return;
    }
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
  }, [isGuest]);

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
    navigate(liveBroadcastId ? `/listen/live/${liveBroadcastId}` : `/listen/channels/${idOf(station)}`);
  };

  const liveStations = useMemo(
    () => stations.filter((station) => Boolean(station?.isLive)),
    [stations]
  );
  const offlineStations = useMemo(
    () => stations.filter((station) => !station?.isLive),
    [stations]
  );

  return (
    <div className="listener-v2-page listener-v2-following-page">
      <header className="listener-v2-page-title"><h1>Following</h1></header>

      {loading ? (
        <div className="listener-v2-following-skeleton" aria-label="Loading followed Channels"><span /><span /><span /></div>
      ) : isGuest ? (
        <EmptyState icon={<FiHeadphones />} title="Sign in to see followed Channels" copy="Following is personal — sign in and the Channels you follow will appear here." action={() => navigate('/login')} actionLabel="Sign in" />
      ) : error ? (
        <EmptyState icon={<FiHeadphones />} title="Following couldn’t load" copy="Check your connection and try again." action={load} actionLabel="Try again" />
      ) : stations.length ? (
        <>
          {liveStations.length > 0 && (
            <section className="listener-v2-following-live">
              <h2>Live from creators you follow</h2>
              {liveStations.map((station) => (
                <article className="listener-v2-following-live-card" key={idOf(station)}>
                  <button type="button" className="listener-v2-following-live-art" onClick={() => openStation(station)} aria-label={`Listen to ${station?.name || 'Channel'}`}>
                    <Artwork src={stationArtwork(station)} />
                    <span className="listener-v2-live-badge">LIVE</span>
                  </button>
                  <div>
                    <strong>{station?.name || 'Unnamed Channel'}</strong>
                    <span>{station?.category || 'Channel'}</span>
                    {station?.listenerCount != null && <small><FiUsers /> {formatCount(station.listenerCount)} listening</small>}
                    <button type="button" onClick={() => openStation(station)}><FiPlay /> Listen now</button>
                  </div>
                </article>
              ))}
            </section>
          )}

          {offlineStations.length > 0 && (
            <section className="listener-v2-following-all">
              <h2>Creators you follow</h2>
              <div className="listener-v2-following-list">
                {offlineStations.map((station) => (
                  <article className="listener-v2-following-row" key={idOf(station)}>
                    <button type="button" className="listener-v2-following-art" onClick={() => openStation(station)} aria-label={`Open ${station?.name || 'Channel'}`}>
                      <Artwork src={stationArtwork(station)} />
                    </button>
                    <button type="button" className="listener-v2-following-copy" onClick={() => openStation(station)}>
                      <strong>{station?.name || 'Unnamed Channel'}</strong>
                      <span>
                        {station?.category || 'Channel'}{station?.followerCount != null ? ` · ${formatCount(station.followerCount)} followers` : ''}
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
                  </article>
                ))}
              </div>
            </section>
          )}
          <FollowingRecordings />
        </>
      ) : (
        <EmptyState icon={<FiHeadphones />} title="No channels followed yet" copy="Discover creators and follow channels to keep up with new broadcasts." action={() => navigate('/listen/search')} actionLabel="Find creators" />
      )}
    </div>
  );
};

const ListenerV2Categories = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { requestAuth, isGuest } = useGuestAuth();
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
      const requests = [batch2Service.listStations({ page: 1, limit: 100 })];
      if (!isGuest) requests.push(followService.getFollowingStations());
      const [stationsResult, followedResult] = await Promise.allSettled(requests);
      if (stationsResult.status === 'rejected') throw stationsResult.reason;
      setStations((Array.isArray(stationsResult.value?.data) ? stationsResult.value.data : []).filter((item) => item?.isPublic !== false));
      // Guests only issue the stations request, so followedResult is undefined
      // for them — guard before reading .status (previously threw
      // "Cannot read properties of undefined" and rendered as an error banner).
      if (followedResult && followedResult.status === 'fulfilled') setFollowingIds(new Set((followedResult.value?.data || []).map(idOf).filter(Boolean)));
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Channels could not be loaded.');
    } finally { setLoading(false); }
  }, [isGuest]);

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
    if (isGuest) {
      requestAuth({
        action: 'Follow channel',
        title: 'Follow your favourite creators',
        message: 'Create an Echoo account to follow Channels, receive updates and build your library.',
        resume: async () => {
          await followService.followStation(key);
          setFollowingIds((current) => new Set([...current, key]));
        },
      });
      return;
    }
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
                onOpen={(item) => navigate(`/listen/channels/${idOf(item)}`)}
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
  const [data, setData] = useState({ tracks: [], creators: [], stations: [] });
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
      setData({ tracks: [], creators: [], stations: [] });
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
        });
        setError('');
      } catch (searchError) {
        if (active) {
          setData({ tracks: [], creators: [], stations: [] });
          setError(searchError?.message || 'Search failed.');
        }
      } finally { if (active) setLoading(false); }
    }, 280);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  const total = data.tracks.length + data.creators.length + data.stations.length;

  return (
    <div className="listener-v2-page listener-v2-search-page">
      <header className="listener-v2-page-title"><h1>Search</h1></header>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search Echoo..."
        autoFocus
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !query.trim()) return;
          // Replace so repeated searches don't stack history entries —
          // Back always leaves search instead of cycling old queries.
          navigate(`/listen/search?q=${encodeURIComponent(query.trim())}`, { replace: true });
        }}
      />
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
          <div className="listener-v2-station-grid">{data.stations.map((station) => <StationCard key={idOf(station)} station={station} onOpen={(item) => navigate(`/listen/channels/${idOf(item)}`)} />)}</div>
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
