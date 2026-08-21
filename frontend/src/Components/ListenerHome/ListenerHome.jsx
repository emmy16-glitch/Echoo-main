import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiArrowRight,
  FiBookOpen,
  FiGrid,
  FiHeadphones,
  FiMic,
  FiPlay,
  FiRepeat,
  FiStar,
  FiTrendingUp,
  FiTv,
  FiUsers,
} from 'react-icons/fi';
import listenerService from '../../services/listenerService';
import realtimeService from '../../services/realtimeService';
import notificationService from '../../services/notificationService';
import batch2Service from '../../services/batch2Service';
import followService from '../../services/followService';
import { buildMediaUrl } from '../../services/api';
import './ListenerHome.css';

const HOME_SYNC_INTERVAL_MS = 15000;

const idOf = (item) => {
  if (!item) return '';
  const value = item._id || item.id || item.broadcastId || item.stationId || item.audioId || item.trackId || null;
  return value ? String(value) : '';
};

const heroTitle = (hero, isLive) => {
  if (isLive) {
    return hero.station?.name || hero.stationName || hero.title || 'Live on Echoo';
  }
  return hero.title || hero.name || hero.station?.name || 'Untitled';
};

const heroSubtitle = (hero, isLive) => {
  if (isLive) {
    return (
      hero.station?.owner?.displayName ||
      hero.creator?.displayName ||
      hero.station?.creator?.displayName ||
      ''
    );
  }
  if (hero.station?.name || hero.stationName) return hero.station?.name || hero.stationName;
  if (typeof hero.artist === 'string') return hero.artist;
  return (
    hero.artist?.displayName ||
    hero.artist?.username ||
    hero.artist?.creatorProfile?.artistName ||
    hero.artist?.creatorProfile?.organizationName ||
    hero.creator?.displayName ||
    hero.creator?.username ||
    ''
  );
};

const artworkOf = (item) =>
  buildMediaUrl(
    item?.station?.brandCover ||
      item?.station?.coverArt ||
      item?.brandCover ||
      item?.coverArt ||
      item?.artwork ||
      item?.image ||
      item?.avatar ||
      null
  );

const formatDuration = (totalSeconds) => {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(remaining)}`
    : `${minutes}:${pad(remaining)}`;
};

const formatCount = (count) => {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  if (value >= 1000) {
    const display = value / 1000;
    return `${display % 1 === 0 ? display : display.toFixed(1)}K`;
  }
  return String(value);
};

const categoryIcon = (category) => {
  const map = {
    'Faith & Spirituality': FiStar,
    Business: FiTrendingUp,
    Entertainment: FiTv,
    Music: FiHeadphones,
    'News & Politics': FiRepeat,
    Education: FiBookOpen,
    Technology: FiGrid,
  };
  return map[category] || FiMic;
};

const greetingOf = (dashboardGreeting) => {
  // Keep the backend greeting ("Good evening, Name") but make it compact;
  // the page-level subtitle carries the welcome message.
  return dashboardGreeting || 'Welcome back';
};

/* ---------------- Live room card ---------------- */

const LiveCard = ({ broadcast, onOpen }) => {
  const station = broadcast?.station || broadcast;
  return (
    <button
      type="button"
      className="echoo-home-live-card"
      onClick={() => onOpen(broadcast)}
      aria-label={`Join ${station.name || broadcast.stationName || 'live broadcast'}`}
    >
      <div className="echoo-home-live-art">
        {artworkOf(broadcast) ? (
          <img src={artworkOf(broadcast)} alt="" loading="lazy" />
        ) : (
          <span className="echoo-home-art-placeholder">
            <FiMic aria-hidden="true" />
          </span>
        )}
        <span className="echoo-home-live-badge">
          <span className="echoo-home-live-dot" aria-hidden="true" />
          LIVE
        </span>
        <span className="echoo-home-live-overlay" aria-hidden="true" />
        <span className="echoo-home-live-listeners">
          <FiUsers aria-hidden="true" />
          {formatCount(station.listenerCount ?? 0)} listening
        </span>
      </div>
      <div className="echoo-home-live-info">
        <span className="echoo-home-live-name">{station.name || broadcast.stationName || 'Live on Echoo'}</span>
        <span className="echoo-home-live-meta">
          {station.category || broadcast.creator?.displayName || ''}
          <span className="echoo-home-live-join-pill" aria-hidden="true">
            Join
          </span>
        </span>
      </div>
    </button>
  );
};

/* ---------------- Continue listening card ---------------- */

const ContinueCard = ({ item, isLive, onOpen }) => {
  const duration = Math.max(0, Math.floor(item.duration || 0));
  const progress = Math.max(0, Math.floor(item.progress || 0));
  const ratio = duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
  const remaining = duration > 0 ? duration - progress : 0;
  return (
    <button
      type="button"
      className="echoo-home-continue-card"
      onClick={() => onOpen(item)}
      aria-label={`${isLive ? 'Join' : 'Resume'} ${heroTitle(item, isLive)}`}
    >
      <div className="echoo-home-continue-art">
        {artworkOf(item) ? (
          <img src={artworkOf(item)} alt="" loading="lazy" />
        ) : (
          <span className="echoo-home-art-placeholder echoo-home-art-placeholder--sm">
            <FiHeadphones aria-hidden="true" />
          </span>
        )}
        {isLive && (
          <span className="echoo-home-continue-badge" aria-label="Live now">
            <span className="echoo-home-live-dot echoo-home-live-dot--small" aria-hidden="true" />
          </span>
        )}
        <span className="echoo-home-continue-play" aria-hidden="true">
          <FiPlay aria-hidden="true" />
        </span>
      </div>
      <div className="echoo-home-continue-info">
        <span className="echoo-home-continue-name">{heroTitle(item, isLive)}</span>
        <span className="echoo-home-continue-sub">
          {item.station?.name || item.stationName || item.category || 'Echoo'}
          {isLive
            ? ` · ${formatCount(item.station?.listenerCount ?? 0)} listening`
            : remaining > 0
              ? ` · ${formatDuration(remaining)} left`
              : ''}
        </span>
        {!isLive && duration > 0 && (
          <span className="echoo-home-continue-progress" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span className="echoo-home-continue-progress-fill" style={{ width: `${ratio * 100}%` }} aria-hidden="true" />
          </span>
        )}
      </div>
    </button>
  );
};

/* ---------------- Discovery (recommended) card ---------------- */

const DiscoverCard = ({ station, following, busy, onOpen, onToggleFollow }) => {
  const stationId = idOf(station);
  const isFollowing = following.has(stationId);
  return (
    <div className="echoo-home-discover-card">
      <button
        type="button"
        className="echoo-home-discover-art"
        onClick={() => onOpen(station)}
        aria-label={`Open ${station.name || 'station'}`}
      >
        {artworkOf(station) ? (
          <img src={artworkOf(station)} alt="" loading="lazy" />
        ) : (
          <span className="echoo-home-art-placeholder echoo-home-art-placeholder--sm">
            <FiHeadphones aria-hidden="true" />
          </span>
        )}
        <span className="echoo-home-discover-play" aria-hidden="true">
          <FiPlay aria-hidden="true" />
        </span>
      </button>
      <div className="echoo-home-discover-info">
        <span className="echoo-home-discover-name" title={station.name || 'Unnamed station'}>
          {station.name || 'Unnamed station'}
        </span>
        <span className="echoo-home-discover-sub">
          {station.category || 'Station'}
          {station.followerCount >= 0 && station.followerCount > 0
            ? ` · ${formatCount(station.followerCount)} followers`
            : ''}
        </span>
      </div>
      <button
        type="button"
        className={`echoo-home-follow-button${isFollowing ? ' echoo-home-follow-button--following' : ''}`}
        disabled={busy}
        onClick={() => onToggleFollow(station)}
        aria-label={isFollowing ? `Unfollow ${station.name || 'station'}` : `Follow ${station.name || 'station'}`}
      >
        {busy ? '…' : isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  );
};

/* ---------------- Category pill ---------------- */

const CategoryChip = ({ category, count, onOpen }) => (
  <button
    type="button"
    className="echoo-home-category-pill"
    onClick={() => onOpen(category)}
    aria-label={`Browse ${category}`}
  >
    {categoryIcon(category)({ 'aria-hidden': true })}
    <span>{category}</span>
    {count >= 0 && <span className="echoo-home-category-count">{formatCount(count)}</span>}
  </button>
);

const ListenerHome = () => {
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');
  const [continueListening, setContinueListening] = useState([]);
  const [liveNow, setLiveNow] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState([]);
  const [followedStationIds, setFollowedStationIds] = useState(new Set());
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const syncTimerRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }

      const [dashboardResult, followsResult, notificationsResult] =
        await Promise.allSettled([
          listenerService.getDashboard(),
          followService.getFollowingStations(),
          notificationService.list({ page: 1, limit: 1, unreadOnly: true }),
        ]);

      const dashboard =
        dashboardResult.status === 'fulfilled' ? dashboardResult.value?.data || {} : {};

      setGreeting(greetingOf(dashboard.greeting || ''));
      setContinueListening(
        Array.isArray(dashboard.continueListening) ? dashboard.continueListening : []
      );
      const live = Array.isArray(dashboard.liveNow) ? dashboard.liveNow : [];
      setLiveNow(live);
      setRecommended(
        Array.isArray(dashboard.discoverStations) ? dashboard.discoverStations : []
      );

      const historyResult = await listenerService.getHistory(1, 4);
      setRecentHistory(
        Array.isArray(historyResult?.data?.history) ? historyResult.data.history : []
      );

      const topCategories = Array.isArray(dashboard.topCategories)
        ? dashboard.topCategories
        : [];
      if (topCategories.length) {
        const counts = await Promise.all(
          topCategories.map(async (category) => {
            try {
              const result = await batch2Service.listStations({
                page: 1,
                limit: 1,
                category,
              });
              const total = result?.pagination?.total ?? result?.data?.pagination?.total ?? 0;
              return { category, total: Number(total) || 0 };
            } catch {
              return { category, total: 0 };
            }
          })
        );
        setCategoryCounts(counts.filter((entry) => entry.total > 0).slice(0, 6));
      }

      if (followsResult.status === 'fulfilled') {
        const followed = (followsResult.value?.data || [])
          .map((station) => String(station._id || station.id))
          .filter(Boolean);
        setFollowedStationIds(new Set(followed));
      }

      if (notificationsResult.status === 'fulfilled') {
        void notificationsResult.value;
      }

    } catch (loadError) {
      if (!silent) {
        setError(loadError?.message || 'The listener home could not be loaded.');
      }
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
      if (syncTimerRef.current) window.clearInterval(syncTimerRef.current);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const onCatalogChanged = (event) => {
      if (!event?.entity || ['audio', 'broadcast', 'profile', 'station'].includes(event.entity)) {
        void load({ silent: true });
      }
    };

    realtimeService.subscribeToCatalog(onCatalogChanged)
      .then((cleanup) => {
        if (active) unsubscribe = cleanup;
        else cleanup();
      })
      .catch(() => {
        // Polling and focus refresh remain the compatibility fallback when
        // realtime transport is unavailable.
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [load]);

  const hero = useMemo(
    () => liveNow[0] || continueListening[0] || null,
    [liveNow, continueListening]
  );
  const heroIsLive = useMemo(() => Boolean(hero && liveNow[0] && idOf(hero) === idOf(liveNow[0])), [hero, liveNow]);

  const toggleStationFollow = useCallback(
    async (station) => {
      const stationId = idOf(station);
      if (!stationId || busyId) return;
      const currentlyFollowing = followedStationIds.has(stationId);
      setBusyId(stationId);
      try {
        if (currentlyFollowing) {
          await followService.unfollowStation(stationId);
          setFollowedStationIds(
            (previous) => {
              const next = new Set(previous);
              next.delete(stationId);
              return next;
            }
          );
        } else {
          await followService.followStation(stationId);
          setFollowedStationIds((previous) => new Set([...previous, stationId]));
        }
      } catch (followError) {
        setError(followError?.message || 'Could not update follow status.');
      } finally {
        setBusyId('');
      }
    },
    [busyId, followedStationIds]
  );

  const openBroadcast = useCallback(
    (broadcast) => {
      const broadcastId = idOf(broadcast);
      if (broadcastId) navigate(`/listen/live/${broadcastId}`);
    },
    [navigate]
  );

  const openAudio = useCallback(
    (track) => {
      const audioId = idOf(track);
      if (audioId) navigate(`/listen/audio/${audioId}`);
    },
    [navigate]
  );

  const openCategory = useCallback(
    (category) => {
      navigate(`/listen/stations?category=${encodeURIComponent(category)}`);
    },
    [navigate]
  );

  if (loading) {
    return (
      <div className="echoo-home echoo-home-loading" role="status" aria-live="polite">
        <div className="echoo-home-skeleton-grid">
          {Array.from({ length: 7 }).map((_, index) => (
            <span key={index} className="echoo-home-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="echoo-home">
      {error && (
        <div className="echoo-home-error" role="alert">
          {error}
        </div>
      )}

      {/* Compact welcome header — search lives in the app shell; one search bar total. */}
      <header className="echoo-home-welcome">
        <h1 className="echoo-home-greeting">{greeting}</h1>
        <p className="echoo-home-subtitle">Discover live conversations and audio made for you.</p>
      </header>

      {/* Immersive featured hero — artwork first, badge + title + play. */}
      {hero && (
        <section className="echoo-home-hero" aria-label={heroIsLive ? 'Featured live now' : 'Continue listening'}>
          <div className="echoo-home-hero-art" aria-hidden="true">
            {artworkOf(hero) ? (
              <img src={artworkOf(hero)} alt="" />
            ) : (
              <span className="echoo-home-hero-art-placeholder">
                <FiHeadphones aria-hidden="true" />
              </span>
            )}
            <span className="echoo-home-hero-art-gradient" aria-hidden="true" />
          </div>
          <div className="echoo-home-hero-content">
            <span className="echoo-home-hero-label">
              {heroIsLive ? (
                <>
                  <span className="echoo-home-live-dot" aria-hidden="true" />
                  LIVE NOW
                </>
              ) : (
                <>
                  <FiRepeat aria-hidden="true" />
                  CONTINUE LISTENING
                </>
              )}
            </span>
            <h2 className="echoo-home-hero-title">{heroTitle(hero, heroIsLive)}</h2>
            {heroSubtitle(hero, heroIsLive) && (
              <span className="echoo-home-hero-station">{heroSubtitle(hero, heroIsLive)}</span>
            )}
            <div className="echoo-home-hero-chips">
              {(hero.station?.category || hero.category || hero.genre) && (
                <span className="echoo-home-hero-chip">
                  {hero.station?.category || hero.category || hero.genre}
                </span>
              )}
              <span className="echoo-home-hero-chip echoo-home-hero-chip--stat">
                {heroIsLive ? (
                  <>
                    <FiUsers aria-hidden="true" />
                    {formatCount(hero.station?.listenerCount ?? 0)} listening
                  </>
                ) : (
                  <>
                    <FiHeadphones aria-hidden="true" />
                    {formatDuration(Math.max(0, Math.floor(hero.duration || 0)))}
                  </>
                )}
              </span>
            </div>
            <button
              type="button"
              className="echoo-home-hero-play"
              onClick={() => (heroIsLive ? openBroadcast(hero) : openAudio(hero))}
            >
              <FiPlay aria-hidden="true" />
              {heroIsLive ? 'Join live' : 'Resume'}
            </button>
          </div>
        </section>
      )}

      {/* Live now — the most important section, artwork-first live room cards. */}
      <section className="echoo-home-section echoo-home-section--live" aria-label="Live now">
        <div className="echoo-home-section-head">
          <h2 className="echoo-home-section-title">
            <span className="echoo-home-live-dot echoo-home-live-dot--inline" aria-hidden="true" />
            Live now
          </h2>
          <button
            type="button"
            className="echoo-home-view-all"
            onClick={() => navigate('/listen/live')}
          >
            View all <FiArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="echoo-home-live-grid">
          {liveNow.length ? (
            liveNow.slice(0, 4).map((broadcast, index) => (
              <LiveCard
                key={idOf(broadcast) || `broadcast-${index}`}
                broadcast={broadcast}
                onOpen={openBroadcast}
              />
            ))
          ) : (
            <p className="echoo-home-empty">Nothing live right now — check back soon.</p>
          )}
        </div>
        {liveNow.length > 4 && (
          <div className="echoo-home-live-row">
            <div className="echoo-home-live-row-track">
              {liveNow.slice(4, 10).map((broadcast, index) => (
                <LiveCard
                  key={idOf(broadcast) || `broadcast-row-${index}`}
                  broadcast={broadcast}
                  onOpen={openBroadcast}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Continue listening — compact horizontal cards with progress. */}
      {continueListening.length > 0 && (
        <section className="echoo-home-section" aria-label="Continue listening">
          <div className="echoo-home-section-head">
            <h2 className="echoo-home-section-title">
              <FiRepeat aria-hidden="true" />
              Keep listening
            </h2>
            <button
              type="button"
              className="echoo-home-view-all"
              onClick={() => navigate('/listen/history')}
            >
              View all <FiArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="echoo-home-continue-row">
            <div className="echoo-home-continue-row-track">
              {continueListening.slice(0, 8).map((item, index) => (
                <ContinueCard
                  key={`${idOf(item)}-${index}`}
                  item={item}
                  isLive={liveNow.some((b) => idOf(b) === idOf(item))}
                  onOpen={liveNow.some((b) => idOf(b) === idOf(item)) ? openBroadcast : openAudio}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recommended — artwork-first discovery cards. */}
      <section className="echoo-home-section" aria-label="Recommended for you">
        <div className="echoo-home-section-head">
          <h2 className="echoo-home-section-title">Made for you</h2>
          <button
            type="button"
            className="echoo-home-view-all"
            onClick={() => navigate('/listen/stations')}
          >
            View all <FiArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="echoo-home-discover-grid">
          {recommended.length ? (
            recommended.slice(0, 8).map((station, index) => (
              <DiscoverCard
                key={idOf(station) || `station-${index}`}
                station={station}
                following={followedStationIds}
                busy={busyId === idOf(station)}
                onOpen={openAudio}
                onToggleFollow={toggleStationFollow}
              />
            ))
          ) : (
            <p className="echoo-home-empty">Recommended stations will appear here as you listen.</p>
          )}
        </div>
      </section>

      {/* Categories — modern pills. */}
      <section className="echoo-home-section" aria-label="Browse by category">
        <div className="echoo-home-section-head">
          <h2 className="echoo-home-section-title">Explore</h2>
          <button
            type="button"
            className="echoo-home-view-all"
            onClick={() => navigate('/listen/stations')}
          >
            All categories <FiArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="echoo-home-category-pills">
          {categoryCounts.length ? (
            categoryCounts.map(({ category, total }) => (
              <CategoryChip
                key={category}
                category={category}
                count={total}
                onOpen={openCategory}
              />
            ))
          ) : (
            <p className="echoo-home-empty">Categories will appear here.</p>
          )}
        </div>
      </section>

      {/* Recently played — compact rows. */}
      {recentHistory.length > 0 && (
        <section className="echoo-home-section echoo-home-section--compact" aria-label="Recently played">
          <div className="echoo-home-section-head">
            <h2 className="echoo-home-section-title">Jump back in</h2>
            <button
              type="button"
              className="echoo-home-view-all"
              onClick={() => navigate('/listen/history')}
            >
              View all <FiArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="echoo-home-history-list">
            {recentHistory.slice(0, 4).map((entry, index) => {
              const track = entry?.track || entry;
              const audioId = idOf(track);
              const isLive = liveNow.some((b) => idOf(b) === audioId);
              return (
                <button
                  key={`${audioId}-${entry?.playedAt || index}`}
                  type="button"
                  className="echoo-home-history-row"
                  onClick={() => (isLive ? openBroadcast(track) : openAudio(track))}
                >
                  <img src={artworkOf(track)} alt="" loading="lazy" className="echoo-home-history-art" />
                  <div className="echoo-home-history-info">
                    <span className="echoo-home-history-name">
                      {track.title || entry?.name || 'Untitled audio'}
                    </span>
                    <span className="echoo-home-history-sub">
                      {track.genre || track.category || 'Audio'}
                      {entry?.playedAt ? ` · Played ${new Date(entry.playedAt).toLocaleDateString()}` : ''}
                    </span>
                  </div>
                  <span className="echoo-home-history-duration">
                    {formatDuration(track.duration || 0)}
                  </span>
                  <span className="echoo-home-history-play" aria-hidden="true">
                    <FiPlay aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default ListenerHome;
