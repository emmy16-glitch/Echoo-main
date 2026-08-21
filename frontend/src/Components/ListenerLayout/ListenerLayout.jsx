import { useEffect, useRef, useState } from 'react';
import {
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  FaBell,
  FaBookOpen,
  FaCompass,
  FaListUl,
  FaBroadcastTower,
  FaDownload,
  FaHeart,
  FaHistory,
  FaHome,
} from 'react-icons/fa';

import ProfileMenu from '../Shared/ProfileMenu';
import PlayerBar from '../Shared/PlayerBar';
import SearchBar from '../Shared/SearchBar';
import audioService from '../../services/audioService';
import listenerService from '../../services/listenerService';
import notificationService from '../../services/notificationService';
import { buildMediaUrl } from '../../services/api';
import '../../styles/echoo-identity-reset.css';
import '../../styles/echoo-asset-system.css';
import './ListenerLayout.css';
import './ListenerLayout.figma.css';
import './ListenerPlaybackFix.css';
import './ListenerPlayerBlue.css';
import '../../styles/listener-typography-unified.css';
import EchooAppShell from '../Shared/EchooAppShell';
import '../../styles/listener-creator-ui.css';

const SEARCH_SUGGESTIONS = [
  'Podcast',
  'Technology',
  'Spiritual',
  'Education',
];

const formatTime = (seconds) => {
  const safe = Number.isFinite(Number(seconds)) ? Number(seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remaining = Math.floor(safe % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
};

const backendTrackId = (id) => /^[a-f\d]{24}$/i.test(String(id || ''));

const getRandomQueueIndex = (length, currentIndex) => {
  if (length <= 1) return 0;
  let next = currentIndex;
  while (next === currentIndex) {
    next = Math.floor(Math.random() * length);
  }
  return next;
};

const normalizeTrack = (track) => {
  if (!track) return null;

  const artist = typeof track.artist === 'object' ? track.artist : null;

  return {
    ...track,
    id: track.id || track._id || null,
    title: track.title || 'Untitled Audio',
    subtitle:
      track.subtitle ||
      track.artistName ||
      artist?.displayName ||
      artist?.username ||
      (typeof track.artist === 'string' ? track.artist : '') ||
      'Echoo Audio',
    coverArt: buildMediaUrl(track.coverArt || track.artwork || null),
    fileUrl: buildMediaUrl(track.fileUrl || track.backendFileUrl || null),
    duration: Number(track.duration) || 0,
  };
};

const normalizeSearchResults = (response) => {
  const data = response?.data;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.tracks)
      ? data.tracks
      : [];

  return list.map(normalizeTrack).filter(Boolean);
};

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const playbackErrorMessage = (error) => {
  if (error?.name === 'NotAllowedError') {
    return 'Playback was blocked by the browser. Press Play again.';
  }
  if (error?.name === 'NotSupportedError') {
    return 'This uploaded audio format cannot be played by this browser.';
  }
  return 'Echoo could not play this audio. Check that the uploaded file is still available.';
};

const ListenerLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(readUser);
  const displayName =
    user.displayName || user.fullname || user.username || 'Listener';
  const userEmail = user.email || user.emailAddress || '';
  const profileImage =
    buildMediaUrl(user.profileImage || user.avatar || localStorage.getItem('profileImage'));

  const audioRef = useRef(null);
  const searchRef = useRef(null);
  const searchAreaRef = useRef(null);
  const progressSyncRef = useRef(false);
  const pendingSeekRef = useRef(null);
  const streamRequestRef = useRef(0);
  const playerPreferencesReadyRef = useRef(false);

  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off');
  const [playerError, setPlayerError] = useState('');
  const [livePlayerState, setLivePlayerState] = useState({ active: false, track: null, isPlaying: false, playerError: '' });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const navigation = [
    { name: 'Home', path: '/listen', icon: <FaHome />, end: true },
    { name: 'Live now', path: '/listen/live', icon: <FaBroadcastTower /> },
    { name: 'Stations', path: '/listen/stations', icon: <FaCompass />, end: true },
    { name: 'Audio library', path: '/listen/library', icon: <FaBookOpen />, end: true },
    { name: 'Following', path: '/listen/library/following', icon: <FaHeart />, end: true },
  ];
  const navigationLibrary = [
    { name: 'My playlist', path: '/listen/playlist', icon: <FaListUl /> },
    { name: 'History', path: '/listen/history', icon: <FaHistory /> },
    { name: 'Downloads', path: '/listen/downloads', icon: <FaDownload />, end: true },
  ];

  useEffect(() => {
    const refreshProfile = (event) => {
      const nextUser = event?.detail && typeof event.detail === 'object'
        ? event.detail
        : readUser();
      setUser(nextUser);
    };

    const storageChanged = (event) => {
      if (event.key === 'user' || event.key === 'profileImage') {
        setUser(readUser());
      }
    };

    window.addEventListener('echoo-profile-updated', refreshProfile);
    window.addEventListener('storage', storageChanged);

    return () => {
      window.removeEventListener('echoo-profile-updated', refreshProfile);
      window.removeEventListener('storage', storageChanged);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const hydratePlayerPreferences = async () => {
      try {
        const response = await listenerService.getPlayerState();
        if (!active) return;
        const state = response?.data || {};
        const savedVolume = Number(state.volume);
        if (Number.isFinite(savedVolume)) {
          setVolume(Math.max(0, Math.min(1, savedVolume)));
        }
        setIsMuted(Boolean(state.isMuted));
        setShuffle(Boolean(state.isShuffled));
        setRepeatMode(
          state.repeatMode === 'one' || state.repeatMode === 'all'
            ? state.repeatMode
            : 'off'
        );
      } catch {
        // Playback still works with local defaults when preference hydration fails.
      } finally {
        if (active) playerPreferencesReadyRef.current = true;
      }
    };

    hydratePlayerPreferences();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!playerPreferencesReadyRef.current) return undefined;

    const timer = window.setTimeout(() => {
      listenerService.updatePreferences({
        volume,
        isMuted,
        isShuffled: shuffle,
        repeatMode: repeatMode === 'off' ? 'none' : repeatMode,
      }).catch((error) => {
        console.warn('Player preference sync:', error);
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [volume, isMuted, shuffle, repeatMode]);

  const syncProgress = async (completed = false) => {
    const audio = audioRef.current;
    if (
      progressSyncRef.current ||
      !audio ||
      !backendTrackId(currentTrack?.id) ||
      !Number.isFinite(audio.currentTime)
    ) {
      return;
    }

    progressSyncRef.current = true;
    try {
      await listenerService.updateProgress({
        trackId: currentTrack.id,
        progress: Math.floor(audio.currentTime),
        duration: Math.floor(
          audio.duration || duration || currentTrack.duration || 0
        ),
        completed,
      });
    } catch (error) {
      console.warn('Playback progress sync:', error);
    } finally {
      progressSyncRef.current = false;
    }
  };

  const applyPendingSeek = () => {
    const audio = audioRef.current;
    const pending = pendingSeekRef.current;

    if (
      !audio ||
      pending === null ||
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0
    ) {
      return;
    }

    const target = Math.max(0, Math.min(Number(pending) || 0, audio.duration));
    audio.currentTime = target;
    setCurrentTime(target);
    pendingSeekRef.current = null;
  };

  const loadAndPlay = async (track) => {
    const audio = audioRef.current;
    if (!audio || !track?.fileUrl) {
      setPlayerError('This audio does not have a playable file attached to it.');
      setIsPlaying(false);
      return false;
    }

    const requestId = streamRequestRef.current + 1;
    streamRequestRef.current = requestId;
    let sourceUrl = track.fileUrl;

    try {
      // Audio records store a private upload path. Public Listener playback must
      // use a fresh short-lived stream grant so stale catalog responses and raw
      // /uploads/audio URLs can never reach the media element.
      if (backendTrackId(track.id)) {
        const stream = await audioService.getStreamUrl(track.id);
        sourceUrl = stream.streamUrl;
      }

      if (requestId !== streamRequestRef.current) return false;

      const requestedUrl = new URL(sourceUrl, window.location.href).href;
      if (audio.src !== requestedUrl) {
        audio.src = sourceUrl;
        audio.load();
      }

      audio.volume = volume;
      audio.muted = isMuted;
      setPlayerError('');

      await audio.play();
      if (requestId === streamRequestRef.current) {
        setIsPlaying(true);
        setPlayerError('');
      }
      return true;
    } catch (error) {
      console.warn('Audio playback:', error);
      if (requestId === streamRequestRef.current) {
        setIsPlaying(false);
        setPlayerError(playbackErrorMessage(error));
      }
      return false;
    }
  };

  const playTrack = (track, incomingQueue = null) => {
    const normalized = normalizeTrack(track);
    if (!normalized?.fileUrl) {
      setPlayerError('This audio does not have a playable file attached to it.');
      return;
    }

    if (currentTrack?.id && currentTrack.id !== normalized.id) {
      syncProgress(false);
    }

    if (Array.isArray(incomingQueue) && incomingQueue.length) {
      const nextQueue = incomingQueue.map(normalizeTrack).filter((item) => item?.fileUrl);
      setQueue(nextQueue);
      const index = nextQueue.findIndex(
        (item) => item.id === normalized.id || item.title === normalized.title
      );
      setQueueIndex(index >= 0 ? index : 0);
    } else {
      setQueue((current) => {
        const existing = current.findIndex((item) => item.id === normalized.id);
        if (existing >= 0) {
          setQueueIndex(existing);
          return current;
        }
        const next = [...current, normalized];
        setQueueIndex(next.length - 1);
        return next;
      });
    }

    pendingSeekRef.current = null;
    setCurrentTrack(normalized);
    setCurrentTime(0);
    setDuration(normalized.duration || 0);
    loadAndPlay(normalized);

    if (backendTrackId(normalized.id)) {
      listenerService.addToContinueListening(normalized.id).catch(() => {});
      audioService.play(normalized.id).catch(() => {});
    }
  };

  const playQueueIndex = (index) => {
    if (index < 0 || index >= queue.length) return;
    const track = queue[index];
    pendingSeekRef.current = null;
    setQueueIndex(index);
    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(track.duration || 0);
    loadAndPlay(track);

    if (backendTrackId(track.id)) {
      listenerService.addToContinueListening(track.id).catch(() => {});
      audioService.play(track.id).catch(() => {});
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.fileUrl) {
      if (!currentTrack?.fileUrl) {
        setPlayerError('Choose an audio track first.');
      }
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
        setPlayerError('');
      } catch (error) {
        console.warn('Audio playback:', error);
        setIsPlaying(false);
        setPlayerError(playbackErrorMessage(error));
      }
    } else {
      audio.pause();
      setIsPlaying(false);
      syncProgress(false);
    }
  };

  const playNext = () => {
    if (!queue.length) return;

    let next = queueIndex + 1;
    if (shuffle && queue.length > 1) {
      next = getRandomQueueIndex(queue.length, queueIndex);
    } else if (next >= queue.length) {
      if (repeatMode === 'all') next = 0;
      else {
        setIsPlaying(false);
        return;
      }
    }

    syncProgress(false);
    playQueueIndex(next);
  };

  const playPrevious = () => {
    const audio = audioRef.current;
    if (audio?.currentTime > 5) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    if (!queue.length) return;
    let previous = queueIndex - 1;
    if (previous < 0 && repeatMode === 'all') previous = queue.length - 1;
    if (previous < 0) return;
    syncProgress(false);
    playQueueIndex(previous);
  };

  const seekTo = (seconds) => {
    const audio = audioRef.current;
    if (!audio) return 0;

    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      pendingSeekRef.current = Math.max(0, Number(seconds) || 0);
      return pendingSeekRef.current;
    }

    const target = Math.max(0, Math.min(Number(seconds) || 0, audio.duration));
    audio.currentTime = target;
    setCurrentTime(target);
    pendingSeekRef.current = null;
    return target;
  };

  const playTrackAt = (track, seconds, incomingQueue = null) => {
    const normalized = normalizeTrack(track);
    if (!normalized?.fileUrl) {
      setPlayerError('This audio does not have a playable file attached to it.');
      return;
    }

    const requestedSeek = Math.max(0, Number(seconds) || 0);

    if (currentTrack?.id === normalized.id && audioRef.current) {
      pendingSeekRef.current = requestedSeek;
      applyPendingSeek();
      loadAndPlay(normalized);
      return;
    }

    if (currentTrack?.id && currentTrack.id !== normalized.id) {
      syncProgress(false);
    }

    if (Array.isArray(incomingQueue) && incomingQueue.length) {
      const nextQueue = incomingQueue.map(normalizeTrack).filter((item) => item?.fileUrl);
      setQueue(nextQueue);
      const index = nextQueue.findIndex(
        (item) => item.id === normalized.id || item.title === normalized.title
      );
      setQueueIndex(index >= 0 ? index : 0);
    }

    pendingSeekRef.current = requestedSeek;
    setCurrentTrack(normalized);
    setCurrentTime(0);
    setDuration(normalized.duration || 0);
    loadAndPlay(normalized);

    if (backendTrackId(normalized.id)) {
      listenerService.addToContinueListening(normalized.id).catch(() => {});
      audioService.play(normalized.id).catch(() => {});
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.fileUrl) return;

    const requestedUrl = new URL(currentTrack.fileUrl, window.location.href).href;
    if (audio.src !== requestedUrl) {
      audio.src = currentTrack.fileUrl;
      audio.load();
    }
  }, [currentTrack?.fileUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError('');
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError('');
        const response = await audioService.getAll({
          search: query,
          public: true,
          page: 1,
          limit: 12,
        });
        if (active) setSearchResults(normalizeSearchResults(response));
      } catch (error) {
        if (active) {
          setSearchResults([]);
          setSearchError(error?.message || 'Search failed.');
        }
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    let active = true;

    const loadNotifications = async () => {
      try {
        const response = await notificationService.list({ limit: 1 });
        if (active) setUnreadNotifications(response?.data?.unreadCount || 0);
      } catch {
        if (active) setUnreadNotifications(0);
      }
    };

    loadNotifications();
    const interval = window.setInterval(loadNotifications, 15000);
    window.addEventListener('focus', loadNotifications);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', loadNotifications);
    };
  }, []);

  useEffect(() => {
    const outside = (event) => {
      if (
        searchAreaRef.current &&
        !searchAreaRef.current.contains(event.target)
      ) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  useEffect(() => {
    const keyDown = (event) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if (event.key === '/' && !typing) {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }

      if (event.key === 'Escape') setSearchOpen(false);
      if (event.code === 'Space' && !typing) {
        event.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });

  useEffect(() => {
    const unload = () => syncProgress(false);
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  });

  const handleLogout = () => {
    [
      'accessToken', 'refreshToken', 'token', 'user', 'profileImage', 'profileBio',
      'echooRole', 'echooProfileCompleted', 'echooOnboardingCompleted', 'creatorSetup',
    ].forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();
    window.location.replace('/');
  };

  const livePlayerActive = Boolean(livePlayerState?.active && livePlayerState?.track);
  const renderedPlayerTrack = livePlayerActive ? livePlayerState.track : currentTrack;
  const renderedPlayerPlaying = livePlayerActive ? Boolean(livePlayerState.isPlaying) : isPlaying;
  const renderedPlayerError = livePlayerActive ? livePlayerState.playerError : playerError;

  useEffect(() => {
    if (!livePlayerActive || !audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
  }, [livePlayerActive]);

  const progressPercentage =
    duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <EchooAppShell
      role="listener"
      roleLabel="Listener"
      className="listener-layout echoo-listener-shell"
      navItems={navigation}
      navGroups={[{ key: 'library', items: navigationLibrary }]}
      activeKey={location.pathname}
      search={(
        <SearchBar
          ref={searchAreaRef}
          inputRef={searchRef}
          className="echoo-app-search"
          value={searchQuery}
          placeholder="Search public Echoo audio..."
          open={searchOpen}
          suggestions={SEARCH_SUGGESTIONS}
          results={searchResults}
          loading={searchLoading}
          error={searchError}
          onFocus={() => setSearchOpen(true)}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setSearchOpen(true);
          }}
          onSuggestion={(suggestion) => {
            setSearchQuery(suggestion);
            setSearchOpen(true);
            searchRef.current?.focus();
          }}
          onResult={(item) => {
            playTrack(item, searchResults);
            setSearchOpen(false);
            setSearchQuery('');
          }}
          onClear={() => {
            setSearchQuery('');
            setSearchResults([]);
            setSearchError('');
            searchRef.current?.focus();
          }}
        />
      )}
      topActions={(
        <>
          <button
            type="button"
            className="notification-button"
            onClick={() => {
              setUnreadNotifications(0);
              navigate('/listen/notifications');
            }}
            title="Notifications"
            aria-label="Notifications"
          >
            <FaBell />
            {unreadNotifications > 0 && <span title={`${unreadNotifications} unread`} />}
          </button>
          <ProfileMenu
            displayName={displayName}
            email={userEmail}
            profileImage={profileImage}
            roleLabel="Listener"
            placement="top"
            onSettings={() => navigate('/listen/settings')}
            onLogout={handleLogout}
          />
        </>
      )}
      persistentSlot={(
        <PlayerBar
          audioRef={audioRef}
          audioProps={{
            onTimeUpdate: () => setCurrentTime(audioRef.current?.currentTime || 0),
            onLoadedMetadata: () => {
              const nextDuration = Number.isFinite(audioRef.current?.duration)
                ? audioRef.current.duration
                : currentTrack?.duration || 0;
              setDuration(nextDuration);
              applyPendingSeek();
            },
            onDurationChange: () => {
              const nextDuration = Number.isFinite(audioRef.current?.duration)
                ? audioRef.current.duration
                : currentTrack?.duration || 0;
              setDuration(nextDuration);
              applyPendingSeek();
            },
            onCanPlay: () => {
              setPlayerError('');
              applyPendingSeek();
            },
            onEnded: () => {
              syncProgress(true);
              if (repeatMode === 'one' && audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch((error) => {
                  setPlayerError(playbackErrorMessage(error));
                });
              } else {
                playNext();
              }
            },
            onPlay: () => {
              setIsPlaying(true);
              setPlayerError('');
            },
            onPause: () => setIsPlaying(false),
            onError: () => {
              setIsPlaying(false);
              setPlayerError('Echoo could not load this uploaded audio file.');
            },
          }}
          currentTrack={renderedPlayerTrack}
          isPlaying={renderedPlayerPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={livePlayerActive ? (livePlayerState.volume ?? volume) : volume}
          isMuted={livePlayerActive ? (livePlayerState.isMuted ?? isMuted) : isMuted}
          queue={queue}
          shuffle={shuffle}
          repeatMode={repeatMode}
          playerError={renderedPlayerError}
          progressPercentage={livePlayerActive ? 0 : progressPercentage}
          onTogglePlay={livePlayerActive ? livePlayerState.onTogglePlay : togglePlay}
          onPlayNext={playNext}
          onPlayPrevious={playPrevious}
          onSeek={seekTo}
          onToggleShuffle={() => setShuffle((value) => !value)}
          onToggleRepeat={() => setRepeatMode((current) => (
            current === 'off' ? 'all' : current === 'all' ? 'one' : 'off'
          ))}
          onToggleMute={livePlayerActive ? livePlayerState.onToggleMute : () => {
            const next = !isMuted;
            setIsMuted(next);
            if (audioRef.current) audioRef.current.muted = next;
          }}
          onVolumeChange={livePlayerActive ? livePlayerState.onVolumeChange : (next) => {
            setVolume(next);
            setIsMuted(next === 0);
            if (audioRef.current) {
              audioRef.current.volume = next;
              audioRef.current.muted = next === 0;
            }
          }}
        />
      )}
    >
      <div className="layout-content echoo-listener-scroll">
        <Outlet
          context={{
            playTrack,
            currentTrack,
            isPlaying,
            togglePlay,
            seekTo,
            playTrackAt,
            currentTime,
            duration,
            queue,
            playNext,
            playPrevious,
            playerError,
            setLivePlayerState,
          }}
        />
      </div>
    </EchooAppShell>
  );
};

export default ListenerLayout;
