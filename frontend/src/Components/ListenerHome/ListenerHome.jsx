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
  FiCheck,
} from 'react-icons/fi';
import listenerService from '../../services/listenerService';
import realtimeService from '../../services/realtimeService';
import notificationService from '../../services/notificationService';
import followService from '../../services/followService';
import searchService from '../../services/searchService';
import { buildMediaUrl } from '../../services/api';
import {
  EchooBadge,
  EchooButton,
  EchooCard,
  EchooProgressBar,
  EchooSectionHeader,
} from '../../design-system';
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

const creatorNameOf = (item) => {
  const creator = item?.creator || item?.station?.owner || item?.artist || null;
  if (typeof creator === 'string') return creator;
  return (
    creator?.displayName ||
    creator?.username ||
    creator?.creatorProfile?.artistName ||
    creator?.creatorProfile?.organizationName ||
    creator?.name ||
    ''
  );
};

const creatorHandleOf = (item) => {
  const creator = item?.creator || item?.station?.owner || item?.artist || null;
  return typeof creator === 'object' && creator?.username ? `@${creator.username}` : '';
};

const creatorAvatarOf = (item) => {
  const creator = item?.creator || item?.station?.owner || item?.artist || null;
  if (typeof creator !== 'object') return '';
  return buildMediaUrl(
    creator?.avatar || creator?.creatorProfile?.organizationLogo || null
  );
};

const creatorVerifiedOf = (item) => {
  const creator = item?.creator || item?.station?.owner || item?.artist || null;
  return typeof creator === 'object' && Boolean(creator?.creatorProfile?.isVerified);
};

const hasTranscript = (item) =>
  Boolean(
    item?.transcriptAvailable ||
      item?.hasTranscript ||
      item?.transcript?.available ||
      item?.station?.hasTranscript
  );

const categoryOf = (item) =>
  item?.station?.category || item?.category || item?.genre || item?.station?.genre || '';

const descriptionOf = (item) =>
  item?.description || item?.station?.description || '';

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



const greetingOf = (dashboardGreeting) => dashboardGreeting || 'Welcome back';

/* ---------------- Live room card ---------------- */

const LiveCard = ({ broadcast, onOpen }) => {
  const station = broadcast?.station || broadcast;
  const creator = creatorNameOf(broadcast);
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
          {station.category || creator || 'Live'}
        </span>
        {creator && <span className="echoo-home-live-creator">{creator}</span>}
        <div className="echoo-home-live-footer">
          {hasTranscript(broadcast) && (
            <EchooBadge tone="transcript" size="sm">Transcript</EchooBadge>
          )}
          <span className="echoo-home-live-join-pill" aria-hidden="true">
            Join
          </span>
        </div>
      </div>
    </button>
  );
};

/* ---------------- Continue listening card ---------------- */

const ContinueCard = ({ item, isLive, onOpen }) => {
  const duration = Math.max(0, Math.floor(item.duration || 0));
  const progress = Math.max(0, Math.floor(item.progress || 0));
  const ratio = duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
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
          {heroSubtitle(item, isLive) || item.station?.name || item.stationName || item.category || 'Echoo'}
          {isLive
            ? ` · ${formatCount(item.station?.listenerCount ?? 0)} listening`
            : ` · ${formatDuration(duration)}`}
        </span>
        {!isLive && duration > 0 && (
          <EchooProgressBar
            value={ratio * 100}
            max={100}
            label={`${heroTitle(item)} progress`}
            className="echoo-home-continue-progress"
          />
        )}
      </div>
    </button>
  );
};

/* ---------------- Recommended creator card ---------------- */

const CreatorCard = ({ creator, following, followerCount, busy, onOpen, onToggleFollow }) => {
  const creatorId = idOf(creator);
  const isFollowing = following.has(creatorId);
  const name =
    creator.displayName ||
    creator.creatorProfile?.artistName ||
    creator.creatorProfile?.organizationName ||
    creator.username ||
    'Echoo Creator';
  const verified = Boolean(creator.creatorProfile?.isVerified || creator.verified);
  return (
    <div className="echoo-home-creator-card">
      <button
        type="button"
        className="echoo-home-creator-avatar"
        onClick={() => onOpen(creator)}
        aria-label={`Open ${name}`}
      >
        {creator.avatar || creator.creatorProfile?.organizationLogo ? (
          <img
            src={buildMediaUrl(creator.avatar || creator.creatorProfile?.organizationLogo)}
            alt=""
            loading="lazy"
          />
        ) : (
          <span>{name.charAt(0).toUpperCase()}</span>
        )}
        {verified && (
          <span className="echoo-home-creator-verified" aria-label="Verified">
            <FiCheck aria-hidden="true" />
          </span>
        )}
      </button>
      <div className="echoo-home-creator-info">
        <span className="echoo-home-creator-name" title={name}>{name}</span>
        <span className="echoo-home-creator-sub">
          {formatCount(followerCount)} followers
        </span>
      </div>
      <EchooButton
        size="sm"
        variant={isFollowing ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={() => onToggleFollow(creator)}
        aria-label={isFollowing ? `Unfollow ${name}` : `Follow ${name}`}
      >
        {busy ? '…' : isFollowing ? 'Following' : 'Follow'}
      </EchooButton>
    </div>
  );
};

/* ---------------- Trending topic row ---------------- */

const TrendingRow = ({ term, activity, basis }) => (
  <div className="echoo-home-trending-row">
    <span className="echoo-home-trending-hash" aria-hidden="true">#</span>
    <span className="echoo-home-trending-term">{term}</span>
    <span className="echoo-home-trending-meta">
      {activity > 0 ? formatCount(activity) : ''}
      {basis ? ` · ${basis}` : ''}
    </span>
  </div>
);

const ListenerHome = () => {
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');
  const [continueListening, setContinueListening] = useState([]);
  const [liveNow, setLiveNow] = useState([]);
  const [recommendedCreators, setRecommendedCreators] = useState([]);
  const [trending, setTrending] = useState([]);
  const [followedCreatorIds, setFollowedCreatorIds] = useState(new Set());
  const [creatorCounts, setCreatorCounts] = useState({});
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const syncTimerRef = useRef(null);

  const hydrateCreators = useCallback(async (creators) => {
    if (!creators.length) return;
    const visible = creators.slice(0, 6);
    const results = await Promise.allSettled(
      visible.map(async (creator) => {
        const creatorId = idOf(creator);
        if (!creatorId) return null;
        const [statusResult, countResult] = await Promise.allSettled([
          followService.getCreatorStatus(creatorId),
          followService.getCreatorCount(creatorId),
        ]);
        return {
          id: creatorId,
          isFollowing:
            statusResult.status === 'fulfilled' &&
            Boolean(statusResult.value?.isFollowing),
          followerCount:
            countResult.status === 'fulfilled'
              ? Number(countResult.value?.followerCount) || 0
              : 0,
        };
      })
    );
    const followed = new Set();
    const counts = {};
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        if (result.value.isFollowing) followed.add(result.value.id);
        counts[result.value.id] = result.value.followerCount;
      }
    });
    setFollowedCreatorIds(followed);
    setCreatorCounts(counts);
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }

      const [dashboardResult, notificationsResult, trendingResult] =
        await Promise.allSettled([
          listenerService.getDashboard(),
          notificationService.list({ page: 1, limit: 1, unreadOnly: true }),
          searchService.trending(),
        ]);

      const dashboard =
        dashboardResult.status === 'fulfilled' ? dashboardResult.value?.data || {} : {};

      setGreeting(greetingOf(dashboard.greeting || ''));
      setContinueListening(
        Array.isArray(dashboard.continueListening) ? dashboard.continueListening : []
      );
      setLiveNow(Array.isArray(dashboard.liveNow) ? dashboard.liveNow : []);

      const creators = Array.isArray(dashboard.discoverCreators)
        ? dashboard.discoverCreators
        : [];
      setRecommendedCreators(creators);
      if (creators.length) void hydrateCreators(creators);

      const trendingItems = Array.isArray(trendingResult?.value?.data)
        ? trendingResult.value.data
        : [];
      setTrending(trendingItems.slice(0, 8));

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
  }, [hydrateCreators]);

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

  const toggleCreatorFollow = useCallback(
    async (creator) => {
      const creatorId = idOf(creator);
      if (!creatorId || busyId) return;
      const currentlyFollowing = followedCreatorIds.has(creatorId);
      setBusyId(creatorId);
      try {
        if (currentlyFollowing) {
          await followService.unfollowCreator(creatorId);
          setFollowedCreatorIds((previous) => {
            const next = new Set(previous);
            next.delete(creatorId);
            return next;
          });
        } else {
          await followService.followCreator(creatorId);
          setFollowedCreatorIds((previous) => new Set([...previous, creatorId]));
        }
      } catch (followError) {
        setError(followError?.message || 'Could not update follow status.');
      } finally {
        setBusyId('');
      }
    },
    [busyId, followedCreatorIds]
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

  const openCreator = useCallback(
    (creator) => {
      const creatorId = idOf(creator);
      if (creatorId) navigate(`/listen/creator/${creatorId}`);
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

  const heroCategory = categoryOf(hero);
  const heroDescription = descriptionOf(hero);
  const heroListeners = heroIsLive
    ? formatCount(hero?.station?.listenerCount ?? 0)
    : formatDuration(Math.max(0, Math.floor(hero?.duration || 0)));

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

      {/* ── Main + right rail ─────────────────────────────── */}
      <div className="echoo-home-layout">
        {/* Main column */}
        <div className="echoo-home-main">
          {/* Immersive featured hero — left content, right artwork. */}
          {hero && (
            <EchooCard className="echoo-home-hero" interactive={false}>
              <div className="echoo-home-hero-content">
                <div className="echoo-home-hero-heading">
                  {heroIsLive ? (
                    <EchooBadge tone="live" size="sm" icon={<span className="echoo-ds-badge__dot" />}>
                      Live now
                    </EchooBadge>
                  ) : (
                    <EchooBadge tone="blue" size="sm" icon={<FiRepeat aria-hidden="true" />}>
                      Continue listening
                    </EchooBadge>
                  )}
                  {hasTranscript(hero) && (
                    <EchooBadge tone="transcript" size="sm">Transcript available</EchooBadge>
                  )}
                </div>

                {heroCategory && (
                  <p className="echoo-home-hero-category">
                    {categoryIcon(heroCategory)({ 'aria-hidden': true })}
                    {heroCategory}
                  </p>
                )}

                <h2 className="echoo-home-hero-title">{heroTitle(hero, heroIsLive)}</h2>

                {heroDescription && (
                  <p className="echoo-home-hero-description">{heroDescription}</p>
                )}

                {(creatorNameOf(hero) || heroSubtitle(hero, heroIsLive)) && (
                  <div className="echoo-home-hero-creator">
                    {creatorAvatarOf(hero) ? (
                      <img
                        src={creatorAvatarOf(hero)}
                        alt=""
                        className="echoo-home-hero-creator-avatar"
                        loading="lazy"
                      />
                    ) : (
                      <span className="echoo-home-hero-creator-avatar echoo-home-hero-creator-avatar--fallback">
                        {(creatorNameOf(hero) || 'E').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="echoo-home-hero-creator-info">
                      <span className="echoo-home-hero-creator-name">
                        {creatorNameOf(hero) || heroSubtitle(hero, heroIsLive)}
                        {creatorVerifiedOf(hero) && (
                          <span className="echoo-home-hero-creator-verified" aria-label="Verified">
                            <FiCheck aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      {creatorHandleOf(hero) && (
                        <span className="echoo-home-hero-creator-handle">{creatorHandleOf(hero)}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="echoo-home-hero-chips">
                  <span className="echoo-home-hero-chip">
                    {heroIsLive ? (
                      <>
                        <FiUsers aria-hidden="true" />
                        {heroListeners} listening
                      </>
                    ) : (
                      <>
                        <FiHeadphones aria-hidden="true" />
                        {heroListeners}
                      </>
                    )}
                  </span>
                </div>

                <div className="echoo-home-hero-actions">
                  <EchooButton
                    size="lg"
                    variant="primary"
                    icon={<FiPlay aria-hidden="true" />}
                    onClick={() => (heroIsLive ? openBroadcast(hero) : openAudio(hero))}
                  >
                    {heroIsLive ? 'Join live' : 'Resume'}
                  </EchooButton>
                  <button
                    type="button"
                    className="echoo-home-hero-play-circle"
                    onClick={() => (heroIsLive ? openBroadcast(hero) : openAudio(hero))}
                    aria-label={heroIsLive ? 'Join live' : 'Play'}
                  >
                    <FiPlay aria-hidden="true" />
                  </button>
                </div>
              </div>

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
            </EchooCard>
          )}

          {/* Live now — real live broadcasts. */}
          <section className="echoo-home-section echoo-home-section--live" aria-label="Live now">
            <EchooSectionHeader
              title="Live Now"
              action={(
                <button
                  type="button"
                  className="echoo-home-view-all"
                  onClick={() => navigate('/listen/live')}
                >
                  See all <FiArrowRight aria-hidden="true" />
                </button>
              )}
            />
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
          </section>

          {/* Continue listening — real player history with progress. */}
          {continueListening.length > 0 && (
            <section className="echoo-home-section" aria-label="Continue listening">
              <EchooSectionHeader
                title="Continue Listening"
                action={(
                  <button
                    type="button"
                    className="echoo-home-view-all"
                    onClick={() => navigate('/listen/history')}
                  >
                    See all <FiArrowRight aria-hidden="true" />
                  </button>
                )}
              />
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

          {/* Recommended creators — real discoverCreators with real follow. */}
          <section className="echoo-home-section" aria-label="Recommended creators">
            <EchooSectionHeader
              title="Recommended Creators"
              action={(
                <button
                  type="button"
                  className="echoo-home-view-all"
                  onClick={() => navigate('/listen/stations')}
                >
                  See all <FiArrowRight aria-hidden="true" />
                </button>
              )}
            />
            <div className="echoo-home-creator-grid">
              {recommendedCreators.length ? (
                recommendedCreators.slice(0, 6).map((creator, index) => (
                  <CreatorCard
                    key={idOf(creator) || `creator-${index}`}
                    creator={creator}
                    following={followedCreatorIds}
                    followerCount={creatorCounts[idOf(creator)] ?? 0}
                    busy={busyId === idOf(creator)}
                    onOpen={openCreator}
                    onToggleFollow={toggleCreatorFollow}
                  />
                ))
              ) : (
                <p className="echoo-home-empty">Creators you follow will appear here.</p>
              )}
            </div>
          </section>
        </div>

        {/* Right rail — transcript feature + real trending content. */}
        <aside className="echoo-home-rail" aria-label="More from Echoo">
          <EchooCard className="echoo-home-transcript-card">
            <div className="echoo-home-transcript-icon">
              <FiBookOpen aria-hidden="true" />
            </div>
            <h3 className="echoo-home-transcript-title">Replay with searchable transcript</h3>
            <p className="echoo-home-transcript-copy">
              Jump to any moment from a live show. Echoo&apos;s AI transcript makes every
              replay searchable, quotable and easy to share.
            </p>
            <button type="button" className="echoo-home-transcript-learn">
              Learn more <FiArrowRight aria-hidden="true" />
            </button>
          </EchooCard>

          <EchooCard className="echoo-home-trending-card">
            <h3 className="echoo-home-trending-title">Trending Topics</h3>
            {trending.length ? (
              <div className="echoo-home-trending-list">
                {trending.map((item, index) => (
                  <TrendingRow
                    key={`${item.term}-${index}`}
                    term={item.term}
                    activity={Number(item.activity) || 0}
                    basis={item.basis}
                  />
                ))}
              </div>
            ) : (
              <p className="echoo-home-empty echoo-home-empty--compact">
                Trending topics will appear here as the community grows.
              </p>
            )}
          </EchooCard>
        </aside>
      </div>
    </div>
  );
};

export default ListenerHome;
