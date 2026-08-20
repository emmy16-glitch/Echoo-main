import { useEffect, useRef, useState } from 'react';
import {
  NavLink,
  Outlet,
  useNavigate,
} from 'react-router-dom';
import {
  FaBell,
  FaBookOpen,
  FaCompass,
  FaListUl,
  FaBroadcastTower,
  FaCog,
  FaDownload,
  FaHeart,
  FaHistory,
  FaHome,
  FaPause,
  FaPlay,
  FaRandom,
  FaRedoAlt,
  FaSearch,
  FaStepBackward,
  FaStepForward,
  FaTimes,
  FaVolumeMute,
  FaVolumeUp,
  FaHeadphones,
} from 'react-icons/fa';

import echooLogo from '../Assets/echoo-logo.jpg';
import ListenerProfileMenu from './ListenerProfileMenu';
import EchoSignal from '../EchooSystem/EchoSignal';
import audioService from '../../services/audioService';
import listenerService from '../../services/listenerService';
import notificationService from '../../services/notificationService';
import { buildMediaUrl } from '../../services/api';
import './ListenerLayout.css';
import './ListenerLayout.figma.css';
import './ListenerPlaybackFix.css';
import '../../styles/echoo-identity-reset.css';
import '../../styles/echoo-asset-system.css';

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
  const [user, setUser] = useState(readUser);
  const displayName =
    user.displayName || user.fullname || user.username || 'Listener';
  const profileImage =
    buildMediaUrl(user.profileImage || user.avatar || localStorage.getItem('profileImage'));

  const audioRef = useRef(null);
  const searchRef = useRef(null);
  const searchAreaRef = useRef(null);
  const progressSyncRef = useRef(false);
  const pendingSeekRef = useRef(null);
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

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const navigation = [
    { name: 'Home', path: '/listen', icon: <FaHome />, end: true },
    { name: 'Live now', path: '/listen/live', icon: <FaBroadcastTower /> },
    { name: 'Discover', path: '/listen/stations', icon: <FaCompass /> },
    { name: 'Stations', path: '/listen/stations', icon: <FaHeadphones /> },
    { name: 'Audio library', path: '/listen/library', icon: <FaBookOpen /> },
    { name: 'My playlist', path: '/listen/library', icon: <FaListUl /> },
    { name: 'Following', path: '/listen/library/following', icon: <FaHeart /> },
    { name: 'History', path: '/listen/history', icon: <FaHistory /> },
    { name: 'Downloads', path: '/listen/downloads', icon: <FaDownload /> },
    { name: 'Notifications', path: '/listen/notifications', icon: <FaBell /> },
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

  const loadAndPlay = (track) => {
    const audio = audioRef.current;
    if (!audio || !track?.fileUrl) {
      setPlayerError('This audio does not have a playable file attached to it.');
      setIsPlaying(false);
      return false;
    }

    try {
      const requestedUrl = new URL(track.fileUrl, window.location.href).href;
      if (audio.src !== requestedUrl) {
        audio.src = track.fileUrl;
        audio.load();
      }

      audio.volume = volume;
      audio.muted = isMuted;
      setPlayerError('');

      const playPromise = audio.play();
      if (playPromise?.then) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setPlayerError('');
          })
          .catch((error) => {
            console.warn('Audio playback:', error);
            setIsPlaying(false);
            setPlayerError(playbackErrorMessage(error));
          });
      }

      return true;
    } catch (error) {
      console.warn('Audio playback:', error);
      setIsPlaying(false);
      setPlayerError(playbackErrorMessage(error));
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

  const progressPercentage =
    duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <div className="listener-layout echoo-listener-shell">
      <aside className="layout-sidebar">
        <button
          type="button"
          className="layout-brand"
          onClick={() => navigate('/listen')}
          style={{ border: 0, background: 'transparent', cursor: 'pointer' }}
        >
          <img src={echooLogo} alt="Echoo" />
          <span>Echoo</span>
        </button>

        <nav className="layout-navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'layout-nav-item active' : 'layout-nav-item'
              }
            >
              <span className="layout-nav-icon">{item.icon}</span>
              <span className="layout-nav-label">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <ListenerProfileMenu
          displayName={displayName}
          profileImage={profileImage}
        />
      </aside>

      <div className="layout-main echoo-listener-main">
        <header className="layout-topbar">
          <div className="beautiful-search-wrapper" ref={searchAreaRef}>
            <div className={`beautiful-search ${searchOpen ? 'active' : ''}`}>
              <FaSearch className="beautiful-search-icon" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search public Echoo audio..."
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchOpen(true);
                }}
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="beautiful-search-clear"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setSearchError('');
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <FaTimes />
                </button>
              ) : (
                <span className="beautiful-search-shortcut">/</span>
              )}
            </div>

            {searchOpen && (
              <div className="beautiful-search-panel">
                {!searchQuery.trim() ? (
                  <div className="search-panel-section">
                    <span className="search-panel-label">Try searching</span>
                    <div className="search-suggestion-list">
                      {SEARCH_SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setSearchQuery(suggestion)}
                        >
                          <FaSearch /> <span>{suggestion}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : searchLoading ? (
                  <div className="beautiful-search-empty">
                    <strong>Searching Echoo...</strong>
                  </div>
                ) : searchError ? (
                  <div className="beautiful-search-empty">
                    <strong>Search unavailable</strong>
                    <span>{searchError}</span>
                  </div>
                ) : searchResults.length ? (
                  <div className="beautiful-results">
                    {searchResults.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="beautiful-result-row"
                        onClick={() => {
                          playTrack(item, searchResults);
                          setSearchOpen(false);
                          setSearchQuery('');
                        }}
                      >
                        <div className="beautiful-result-art">
                          {item.coverArt ? (
                            <img
                              src={item.coverArt}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                            />
                          ) : (
                            <FaHeadphones />
                          )}
                        </div>
                        <div className="beautiful-result-info">
                          <strong>{item.title}</strong>
                          <span>{item.subtitle}</span>
                        </div>
                        <span className="beautiful-result-type">{item.genre || 'Audio'}</span>
                        <span className="beautiful-result-play"><FaPlay /></span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="beautiful-search-empty">
                    <strong>No results found</strong>
                    <span>No public audio matches “{searchQuery}”.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="layout-top-actions">
            <button
              type="button"
              className="layout-top-button notification"
              onClick={() => {
                setUnreadNotifications(0);
                navigate('/listen/notifications');
              }}
              title="Notifications"
            >
              <FaBell />
              {unreadNotifications > 0 && (
                <span title={`${unreadNotifications} unread`} />
              )}
            </button>

            <button
              type="button"
              className="layout-top-button"
              title="Settings"
              onClick={() => navigate('/listen/settings')}
            >
              <FaCog />
            </button>
          </div>
        </header>

        <main className="layout-content echoo-listener-scroll">
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
            }}
          />
        </main>
      </div>

      <div className={`layout-player echoo-persistent-player ${playerError ? 'has-playback-error' : ''}`}>
        <audio
          ref={audioRef}
          preload="metadata"
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
          onLoadedMetadata={() => {
            const nextDuration = Number.isFinite(audioRef.current?.duration)
              ? audioRef.current.duration
              : currentTrack?.duration || 0;
            setDuration(nextDuration);
            applyPendingSeek();
          }}
          onDurationChange={() => {
            const nextDuration = Number.isFinite(audioRef.current?.duration)
              ? audioRef.current.duration
              : currentTrack?.duration || 0;
            setDuration(nextDuration);
            applyPendingSeek();
          }}
          onCanPlay={() => {
            setPlayerError('');
            applyPendingSeek();
          }}
          onEnded={() => {
            syncProgress(true);
            if (repeatMode === 'one' && audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch((error) => {
                setPlayerError(playbackErrorMessage(error));
              });
            } else {
              playNext();
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            setPlayerError('');
          }}
          onPause={() => setIsPlaying(false)}
          onError={() => {
            setIsPlaying(false);
            setPlayerError('Echoo could not load this uploaded audio file.');
          }}
        />

        <div className="layout-player-track">
          <EchoSignal
            size="sm"
            active={isPlaying}
            className="layout-player-signal"
            label={isPlaying ? 'Echoo playback active' : 'Echoo playback signal'}
          />

          <div className="layout-player-cover">
            {currentTrack?.coverArt ? (
              <img
                src={currentTrack.coverArt}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
              />
            ) : (
              <FaHeadphones />
            )}
          </div>

          <div className="layout-player-info">
            <strong>{currentTrack?.title || 'Choose something to play'}</strong>
            <span className={playerError ? 'layout-player-error-copy' : ''}>
              {playerError || currentTrack?.subtitle || 'Echoo'}
            </span>
          </div>
        </div>

        <div className="layout-player-controls">
          <button
            type="button"
            className={shuffle ? 'active' : ''}
            onClick={() => setShuffle((value) => !value)}
            disabled={!queue.length}
            aria-label="Shuffle"
          >
            <FaRandom />
          </button>
          <button type="button" onClick={playPrevious} disabled={!queue.length} aria-label="Previous">
            <FaStepBackward />
          </button>
          <button
            type="button"
            className="layout-player-main-button"
            onClick={togglePlay}
            disabled={!currentTrack?.fileUrl}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <FaPause /> : <FaPlay />}
          </button>
          <button type="button" onClick={playNext} disabled={!queue.length} aria-label="Next">
            <FaStepForward />
          </button>
          <button
            type="button"
            className={repeatMode !== 'off' ? 'active' : ''}
            onClick={() =>
              setRepeatMode((current) =>
                current === 'off' ? 'all' : current === 'all' ? 'one' : 'off'
              )
            }
            disabled={!queue.length}
            aria-label={`Repeat ${repeatMode}`}
          >
            <FaRedoAlt />
          </button>
        </div>

        <div className="layout-player-volume">
          <span>{formatTime(currentTime)}</span>
          <div
            className="layout-player-progress"
            onClick={(event) => {
              if (!duration) return;
              const rect = event.currentTarget.getBoundingClientRect();
              seekTo(((event.clientX - rect.left) / rect.width) * duration);
            }}
            role="slider"
            aria-label="Audio progress"
            aria-valuemin="0"
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={0}
          >
            <div style={{ width: `${progressPercentage}%` }} />
          </div>
          <span>{formatTime(duration)}</span>

          <button
            type="button"
            onClick={() => {
              const next = !isMuted;
              setIsMuted(next);
              if (audioRef.current) audioRef.current.muted = next;
            }}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              setIsMuted(next === 0);
              if (audioRef.current) {
                audioRef.current.volume = next;
                audioRef.current.muted = next === 0;
              }
            }}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
};

export default ListenerLayout;
