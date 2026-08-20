import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiArrowRight,
  FiBell,
  FiBookOpen,
  FiGrid,
  FiHeadphones,
  FiMic,
  FiMoreHorizontal,
  FiPlay,
  FiRepeat,
  FiSearch,
  FiStar,
  FiTrendingUp,
  FiTv,
  FiUsers,
} from 'react-icons/fi';
import listenerService from '../../services/listenerService';
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
    return (
      hero.station?.name ||
      hero.stationName ||
      hero.title ||
      'Live on Echoo'
    );
  }
  return hero.title || hero.name || hero.station?.name || 'Untitled';
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

const avatarOf = (item) =>
  buildMediaUrl(
    item?.avatar ||
      item?.creator?.avatar ||
      item?.station?.owner?.avatar ||
      item?.owner?.avatar ||
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

const CATEGORY_META = {
  'Faith & Spirituality': { icon: FiStar, tone: '#7c3aed' },
  Business: { icon: FiTrendingUp, tone: '#1769D3' },
  Entertainment: { icon: FiTv, tone: '#db2777' },
  Music: { icon: FiHeadphones, tone: '#059669' },
  'News & Politics': { icon: FiRepeat, tone: '#c2410c' },
  Education: { icon: FiBookOpen, tone: '#0891b2' },
  'Health & Wellness': { icon: FiHeadphones, tone: '#dc2626' },
  Technology: { icon: FiGrid, tone: '#4f46e5' },
  Sports: { icon: FiTrendingUp, tone: '#0284c7' },
  Comedy: { icon: FiMic, tone: '#ca8a04' },
  Storytelling: { icon: FiBookOpen, tone: '#854d0e' },
  Other: { icon: FiGrid, tone: '#64748b' },
};

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
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const syncTimerRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }

      const [
        dashboardResult,
        followsResult,
        notificationsResult,
      ] = await Promise.allSettled([
        listenerService.getDashboard(),
        followService.getFollowingStations(),
        notificationService.list({ page: 1, limit: 1, unreadOnly: true }),
      ]);

      const dashboard =
        dashboardResult.status === 'fulfilled' ? dashboardResult.value?.data || {} : {};

      setGreeting(dashboard.greeting || '');
      setContinueListening(
        Array.isArray(dashboard.continueListening) ? dashboard.continueListening : []
      );
      setLiveNow(Array.isArray(dashboard.liveNow) ? dashboard.liveNow : []);
      setRecommended(
        Array.isArray(dashboard.discoverStations) ? dashboard.discoverStations : []
      );

      const historyResult = await listenerService.getHistory(1, 4);
      const historyItems = Array.isArray(historyResult?.data?.history)
        ? historyResult.data.history
        : [];
      setRecentHistory(historyItems);

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
        setUnreadNotifications(notificationsResult.value?.data?.unreadCount || 0);
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

  const hero = useMemo(
    () => continueListening[0] || liveNow[0] || null,
    [continueListening, liveNow]
  );
  const heroIsLive = useMemo(() => Boolean(liveNow[0] && !continueListening[0]), [
    continueListening,
    liveNow,
  ]);

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

  if (loading) {
    return (
      <div className="listener-home listener-home-loading" role="status" aria-live="polite">
        <div className="listener-home-skeleton-grid">
          {Array.from({ length: 7 }).map((_, index) => (
            <span key={index} className="listener-home-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="listener-home">
      {error && (
        <div className="listener-home-error" role="alert">
          {error}
        </div>
      )}

      <header className="listener-home-header">
        <div className="listener-home-header-left">
          <h1 className="listener-home-greeting">{greeting} 👋</h1>
          <p className="listener-home-subtitle">
            Discover live voices and audio that inspires you.
          </p>
        </div>
        <div className="listener-home-header-right">
          <button
            type="button"
            className="listener-home-search"
            onClick={() => navigate('/listen/search')}
            aria-label="Search stations, shows or audio"
          >
            <FiSearch className="listener-home-search-icon" aria-hidden="true" />
            <span className="listener-home-search-placeholder">
              Search stations, shows or audio…
            </span>
            <span className="listener-home-search-hint">⌘ K</span>
          </button>
          <button
            type="button"
            className="listener-home-bell"
            onClick={() => navigate('/listen/notifications')}
            aria-label="Open notifications"
          >
            <FiBell aria-hidden="true" />
            {unreadNotifications > 0 && (
              <span className="listener-home-bell-badge">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>
        </div>
      </header>

      {hero && (
        <section
          className={`listener-home-hero${heroIsLive ? '' : ''}`}
          aria-label="Continue listening"
        >
          <div className="listener-home-hero-content">
            <span className="listener-home-hero-label">Continue listening</span>
            <h2 className="listener-home-hero-title">{heroTitle(hero, heroIsLive)}</h2>
            <div className="listener-home-hero-chips">
              {(hero.station?.category || hero.category || hero.genre) && (
                <span className="listener-home-hero-chip">
                  {hero.station?.category || hero.category || hero.genre}
                </span>
              )}
              {heroIsLive ? (
                <span className="listener-home-hero-chip listener-home-hero-chip--live">
                  {formatCount(hero.station?.listenerCount ?? 0)} listening
                </span>
              ) : (
                hero.duration > 0 && (
                  <span className="listener-home-hero-chip listener-home-hero-chip--duration">
                    {formatDuration(
                      Math.max(0, Math.floor(hero.duration || 0)) -
                        Math.max(0, Math.floor(hero.progress || 0))
                    )}{' '}
                    remaining
                  </span>
                )
              )}
            </div>
            <div className="listener-home-hero-meta">
              {heroIsLive ? (
                <>
                  <span className="listener-home-hero-dot" aria-hidden="true" />
                  <span>Live now</span>
                  <span className="listener-home-hero-meta-item">
                    <FiUsers aria-hidden="true" />
                    {formatCount(hero.station?.listenerCount ?? 0)} listening
                  </span>
                </>
              ) : (
                <span>
                  {hero.lastPlayed
                    ? `Picked up ${new Date(hero.lastPlayed).toLocaleDateString()}`
                    : 'Pick up where you left off'}
                </span>
              )}
            </div>
            <button
              type="button"
              className="listener-home-hero-join"
              onClick={() => (heroIsLive ? openBroadcast(hero) : openAudio(hero))}
            >
              <FiPlay aria-hidden="true" />
              {heroIsLive ? 'Join live' : 'Resume'}
            </button>
          </div>
          <div className="listener-home-hero-art" aria-hidden="true">
            {artworkOf(hero) ? (
              <img src={artworkOf(hero)} alt="" />
            ) : (
              <span className="listener-home-hero-art-placeholder">
                <FiHeadphones aria-hidden="true" />
              </span>
            )}
          </div>
        </section>
      )}

      <section className="listener-home-section" aria-label="Live now">
        <div className="listener-home-section-head">
          <h2 className="listener-home-section-title">Live now</h2>
          <button
            type="button"
            className="listener-home-view-all"
            onClick={() => navigate('/listen/live')}
          >
            View all <FiArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="listener-home-carousel">
          <div className="listener-home-carousel-track">
            {liveNow.length ? (
              liveNow.slice(0, 8).map((broadcast, index) => {
                const station = broadcast?.station || broadcast;
                return (
                  <button
                    key={idOf(broadcast) || `broadcast-${index}`}
                    type="button"
                    className="listener-home-broadcast-card"
                    onClick={() => openBroadcast(broadcast)}
                  >
                    <div className="listener-home-broadcast-art">
                      {artworkOf(broadcast) ? (
                        <img src={artworkOf(broadcast)} alt="" loading="lazy" />
                      ) : (
                        <span className="listener-home-art-placeholder">
                          <FiMic aria-hidden="true" />
                        </span>
                      )}
                      <span className="listener-home-broadcast-badge">
                        <FiPlay aria-hidden="true" />
                        LIVE
                      </span>
                      <span className="listener-home-broadcast-count">
                        <FiUsers aria-hidden="true" />
                        {formatCount(station.listenerCount ?? 0)}
                      </span>
                    </div>
                    <div className="listener-home-broadcast-body">
                      <div className="listener-home-broadcast-identity">
                        <span
                          className="listener-home-broadcast-avatar"
                          style={{
                            backgroundImage: `url("${avatarOf(broadcast)}")`,
                          }}
                          aria-hidden="true"
                        />
                    <div>
                      <span className="listener-home-broadcast-name">
                        {station.name || broadcast.stationName || 'Live on Echoo'}
                      </span>
                      <span className="listener-home-broadcast-category">
                        {station.category || broadcast.creator?.displayName || ''}
                      </span>
                    </div>
                      </div>
                      <div className="listener-home-broadcast-actions">
                        <span className="listener-home-broadcast-live-tag">
                          <span className="listener-home-broadcast-dot" aria-hidden="true" />
                          Live now
                        </span>
                        <span className="listener-home-broadcast-play" aria-hidden="true">
                          <FiPlay aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="listener-home-empty">Nothing live right now.</p>
            )}
          </div>
        </div>
      </section>

      <section className="listener-home-section" aria-label="Recommended for you">
        <div className="listener-home-section-head">
          <h2 className="listener-home-section-title">Recommended for you</h2>
          <button
            type="button"
            className="listener-home-view-all"
            onClick={() => navigate('/listen/stations')}
          >
            View all <FiArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="listener-home-station-row">
          {recommended.length ? (
            recommended.slice(0, 8).map((station, index) => {
              const stationId = idOf(station);
              const isFollowing = followedStationIds.has(stationId);
              const busy = busyId === stationId;
              return (
                <div key={stationId || `station-${index}`} className="listener-home-station-card">
                  <img
                    src={artworkOf(station)}
                    alt=""
                    loading="lazy"
                    className="listener-home-station-art"
                  />
                  <div className="listener-home-station-info">
                    <span className="listener-home-station-name">
                      {station.name || 'Unnamed station'}
                    </span>
                    <span className="listener-home-station-category">
                      {station.category || 'Station'}
                    </span>
                    <span className="listener-home-station-followers">
                      {formatCount(station.followerCount || 0)} followers
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`listener-home-follow-button${isFollowing ? ' listener-home-follow-button--following' : ''}`}
                    disabled={busy}
                    onClick={() => toggleStationFollow(station)}
                  >
                    {busy ? '…' : isFollowing ? 'Following' : 'Follow'}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="listener-home-empty">Recommended stations will appear here.</p>
          )}
        </div>
      </section>

      <div className="listener-home-bottom-grid">
        <section className="listener-home-section" aria-label="Recently played">
          <div className="listener-home-section-head">
            <h2 className="listener-home-section-title">Recently played</h2>
            <button
              type="button"
              className="listener-home-view-all"
              onClick={() => navigate('/listen/history')}
            >
              View all <FiArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="listener-home-history-list">
            {recentHistory.length ? (
              recentHistory.slice(0, 5).map((entry) => {
                const track = entry?.track || entry;
                const audioId = idOf(track);
                return (
                  <button
                    key={`${audioId}-${entry?.playedAt || entry?.lastPlayedAt || ''}`}
                    type="button"
                    className="listener-home-history-row"
                    onClick={() => openAudio(track)}
                  >
                    <img src={artworkOf(track)} alt="" loading="lazy" className="listener-home-history-art" />
                    <div className="listener-home-history-info">
                      <span className="listener-home-history-name">
                        {track.title || entry?.name || 'Untitled audio'}
                      </span>
                      <span className="listener-home-history-sub">
                        {track.genre || track.category || 'Audio'}
                        {entry?.playCount >= 0 && entry.playCount > 0
                          ? ` · ${entry.playCount} plays`
                          : entry?.playedAt
                            ? ` · Played ${new Date(entry.playedAt).toLocaleDateString()}`
                            : ''}
                      </span>
                    </div>
                    <span className="listener-home-history-duration">
                      {formatDuration(track.duration || 0)}
                    </span>
                    <span className="listener-home-history-play" aria-hidden="true">
                      <FiPlay aria-hidden="true" />
                    </span>
                    <span className="listener-home-history-more" aria-label="More options">
                      <FiMoreHorizontal aria-hidden="true" />
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="listener-home-empty">Your listening history will appear here.</p>
            )}
          </div>
        </section>

        <section className="listener-home-section" aria-label="Browse by category">
          <div className="listener-home-section-head">
            <h2 className="listener-home-section-title">Browse by category</h2>
            <button
              type="button"
              className="listener-home-view-all"
              onClick={() => navigate('/listen/stations')}
            >
              View all <FiArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="listener-home-category-grid">
            {categoryCounts.length ? (
              categoryCounts.map(({ category, total }) => {
                const meta = CATEGORY_META[category] || CATEGORY_META.Other;
                const Icon = meta.icon;
                return (
                  <button
                    key={category}
                    type="button"
                    className="listener-home-category-tile"
                    style={{ '--cat-tone': meta.tone }}
                    onClick={() =>
                      navigate(
                        `/listen/stations?category=${encodeURIComponent(category)}`
                      )
                    }
                  >
                    <span className="listener-home-category-icon" aria-hidden="true">
                      <Icon aria-hidden="true" />
                    </span>
                    <div className="listener-home-category-text">
                      <span className="listener-home-category-name">{category}</span>
                      <span className="listener-home-category-count">
                        {formatCount(total)} stations
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="listener-home-empty">Categories will appear here.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ListenerHome;
