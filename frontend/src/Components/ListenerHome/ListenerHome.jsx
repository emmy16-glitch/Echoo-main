import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiArrowLeft,
  FiArrowRight,
  FiFileText,
  FiHeadphones,
  FiPlay,
  FiSearch,
  FiUsers,
  FiCheck,
  FiRadio,
  FiChevronRight,
} from 'react-icons/fi';
import { FaCheck } from 'react-icons/fa';
import listenerService from '../../services/listenerService';
import realtimeService from '../../services/realtimeService';
import notificationService from '../../services/notificationService';
import followService from '../../services/followService';
import searchService from '../../services/searchService';
import { buildMediaUrl } from '../../services/api';
import './ListenerHome.css';

const HOME_SYNC_INTERVAL_MS = 15000;

const idOf = (item) => {
  if (!item) return '';
  const value = item._id || item.id || item.broadcastId || item.stationId || item.audioId || item.trackId || null;
  return value ? String(value) : '';
};

const heroTitle = (hero, isLive) => {
  if (isLive) return hero.station?.name || hero.stationName || hero.title || 'Live on Echoo';
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
  return buildMediaUrl(creator?.avatar || creator?.creatorProfile?.organizationLogo || null);
};

const creatorVerifiedOf = (item) => {
  const creator = item?.creator || item?.station?.owner || item?.artist || null;
  return typeof creator === 'object' && Boolean(creator?.creatorProfile?.isVerified);
};

const hasTranscript = (item) =>
  Boolean(item?.transcriptAvailable || item?.hasTranscript || item?.transcript?.available || item?.station?.hasTranscript);

const categoryOf = (item) => item?.station?.category || item?.category || item?.genre || item?.station?.genre || '';

const descriptionOf = (item) => item?.description || item?.station?.description || '';

const formatCount = (count) => {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  if (value >= 1000) {
    const display = value / 1000;
    return `${display % 1 === 0 ? display : display.toFixed(1)}K`;
  }
  return String(value);
};

const formatDuration = (totalSeconds) => {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

/* gradients for Live Now cards – sampled from home.png reference */
const LIVE_GRADIENTS = [
  'linear-gradient(135deg,#6BB9AF 0%,#8FD0C8 55%,#BFE7E1 100%)',
  'linear-gradient(135deg,#7A5A2E 0%,#9C7A3A 35%,#C6A86D 100%)',
  'linear-gradient(135deg,#3E8EA8 0%,#5EB8C6 50%,#8AD8DE 100%)',
  'linear-gradient(135deg,#23408F 0%,#3B5EBE 55%,#7A96DA 100%)',
];

const SectionHeader = ({ icon, title, subtitle, onViewAll, viewAllLabel = 'View all' }) => (
  <div className="lh-section-head">
    <div className="lh-section-head-left">
      <h3 className="lh-section-title">
        {icon && <span className="lh-section-icon" aria-hidden="true">{icon}</span>}
        {title}
      </h3>
      {subtitle && <span className="lh-section-subtitle">{subtitle}</span>}
    </div>
    <div className="lh-section-head-right">
      {onViewAll && (
        <button type="button" className="lh-view-all" onClick={onViewAll}>
          {viewAllLabel} <FiArrowRight aria-hidden="true" />
        </button>
      )}
      <div className="lh-nav-arrows" aria-hidden="true">
        <span className="lh-arrow"><FiArrowLeft /></span>
        <span className="lh-arrow"><FiArrowRight /></span>
      </div>
    </div>
  </div>
);

const LiveCard = ({ broadcast, index, onOpen }) => {
  const station = broadcast?.station || broadcast;
  const name = station.name || broadcast.stationName || broadcast.title || 'Live on Echoo';
  const cat = categoryOf(broadcast) || station.category || 'Live';
  const creator = creatorNameOf(broadcast);
  const verified = creatorVerifiedOf(broadcast);
  const listeners = station.listenerCount ?? broadcast.listenerCount ?? 0;
  const art = artworkOf(broadcast);
  const gradient = LIVE_GRADIENTS[index % LIVE_GRADIENTS.length];
  return (
    <button
      type="button"
      className="lh-live-card"
      style={art ? undefined : { background: gradient }}
      onClick={() => onOpen(broadcast)}
      aria-label={`Join ${name}`}
    >
      {art ? (
        <>
          <img className="lh-live-card-bg" src={art} alt="" loading="lazy" />
          <span className="lh-live-card-gradient" style={{ background: gradient, opacity: 0.88 }} aria-hidden="true" />
        </>
      ) : null}
      <span className="lh-live-badge">
        <span className="lh-live-dot" aria-hidden="true" />
        LIVE
      </span>
      <div className="lh-live-card-body">
        <span className="lh-live-card-title">{name}</span>
        <span className="lh-live-card-category">{cat}</span>
        <span className="lh-live-card-creator">
          {creator || 'Echoo'}
          {verified && (
            <span className="lh-live-verified" aria-label="Verified"><FaCheck /></span>
          )}
        </span>
        <div className="lh-live-card-footer">
          <span className="lh-live-listeners">{formatCount(listeners)} listening</span>
          {hasTranscript(broadcast) && (
            <span className="lh-live-transcript-pill">
              <FiFileText aria-hidden="true" /> Transcript
            </span>
          )}
        </div>
      </div>
      {/* subtle pattern */}
      <span className="lh-live-card-pattern" aria-hidden="true" />
    </button>
  );
};

const ContinueCard = ({ item, isLive, onOpen }) => {
  const duration = Math.max(0, Math.floor(item.duration || item.progress != null ? item.duration : item.duration || 0));
  const progress = Math.max(0, Math.floor(item.progress || 0));
  const ratio = duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
  const remainingSec = Math.max(0, duration - progress);
  const remainingLabel = remainingSec > 0 ? `${formatDuration(remainingSec)} left` : formatDuration(duration);
  const title = heroTitle(item, isLive);
  const subtitle = (() => {
    if (isLive) return item.station?.name || item.stationName || creatorNameOf(item) || 'Live';
    return item.station?.name || creatorNameOf(item) || item.category || 'Echoo';
  })();
  const art = artworkOf(item);
  return (
    <button type="button" className="lh-continue-card" onClick={() => onOpen(item)} aria-label={`${isLive ? 'Join' : 'Resume'} ${title}`}>
      <span className="lh-continue-icon">
        {art ? <img src={art} alt="" loading="lazy" /> : <FiHeadphones aria-hidden="true" />}
      </span>
      <span className="lh-continue-body">
        <span className="lh-continue-title">{title}</span>
        <span className="lh-continue-sub">{subtitle}</span>
        <span className="lh-continue-progress">
          <span className="lh-continue-track"><span className="lh-continue-fill" style={{ width: `${ratio * 100}%` }} /></span>
          <span className="lh-continue-time">{remainingLabel}</span>
        </span>
      </span>
      <span className="lh-continue-play" aria-hidden="true"><FiPlay /></span>
    </button>
  );
};

const CreatorCard = ({ creator, following, followerCount, busy, onOpen, onToggleFollow }) => {
  const creatorId = idOf(creator);
  const isFollowing = following.has(creatorId);
  const rawName = creator.displayName || creator.creatorProfile?.artistName || creator.creatorProfile?.organizationName || creator.username || 'Echoo Creator';
  const name = rawName;
  const handle = creator.username ? `@${creator.username}` : creator.creatorProfile?.artistName ? `@${String(creator.creatorProfile.artistName).toLowerCase().replace(/\s+/g,'')}` : '';
  const avatar = buildMediaUrl(creator.avatar || creator.creatorProfile?.organizationLogo || null);
  const verified = Boolean(creator.creatorProfile?.isVerified || creator.verified);
  const count = followerCount ?? creator.followerCount ?? creator.followers ?? 0;
  const letter = name.charAt(0).toUpperCase();
  const avatarColors = ['#6D5EF8','#F45D5D','#3BA6E0','#22C55E','#F59E0B','#8B5CF6'];
  const colorIndex = creatorId ? creatorId.charCodeAt(0) % avatarColors.length : 0;
  return (
    <div className="lh-creator-card">
      <button type="button" className="lh-creator-avatar" onClick={() => onOpen(creator)} aria-label={`Open ${name}`}>
        {avatar ? <img src={avatar} alt="" loading="lazy" /> : <span className="lh-creator-letter" style={{ background: avatarColors[colorIndex] }}>{letter}</span>}
        {verified && <span className="lh-creator-verified"><FiCheck aria-hidden="true" /></span>}
      </button>
      <div className="lh-creator-info">
        <span className="lh-creator-name" title={name}>{name} {verified && <span className="lh-inline-verified"><FiCheck aria-hidden="true" /></span>}</span>
        <span className="lh-creator-handle">{handle || `@${String(name).toLowerCase().replace(/\s+/g,'')}`}</span>
        <span className="lh-creator-followers">{formatCount(count)} followers</span>
      </div>
      <button
        type="button"
        className={`lh-follow-btn ${isFollowing ? 'is-following' : ''}`}
        disabled={busy}
        onClick={() => onToggleFollow(creator)}
        aria-label={isFollowing ? `Unfollow ${name}` : `Follow ${name}`}
      >
        {busy ? '…' : isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  );
};

const ListenerHome = () => {
  const navigate = useNavigate();
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
    const visible = creators.slice(0, 4);
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
          isFollowing: statusResult.status === 'fulfilled' && Boolean(statusResult.value?.isFollowing),
          followerCount: countResult.status === 'fulfilled' ? Number(countResult.value?.followerCount) || 0 : 0,
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
      const [dashboardResult, trendingResult] = await Promise.allSettled([
        listenerService.getDashboard(),
        searchService.trending(),
      ]);
      const dashboard = dashboardResult.status === 'fulfilled' ? dashboardResult.value?.data || {} : {};
      setContinueListening(Array.isArray(dashboard.continueListening) ? dashboard.continueListening : []);
      setLiveNow(Array.isArray(dashboard.liveNow) ? dashboard.liveNow : []);
      const creators = Array.isArray(dashboard.discoverCreators) ? dashboard.discoverCreators : [];
      setRecommendedCreators(creators);
      if (creators.length) void hydrateCreators(creators);
      const trendingItems = Array.isArray(trendingResult?.value?.data) ? trendingResult.value.data : [];
      setTrending(trendingItems.slice(0, 5));
      // also touch notifications to keep parity but don't block
      notificationService.list({ page: 1, limit: 1, unreadOnly: true }).catch(() => {});
    } catch (loadError) {
      if (!silent) setError(loadError?.message || 'The listener home could not be loaded.');
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
      .then((cleanup) => { if (active) unsubscribe = cleanup; else cleanup(); })
      .catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [load]);

  const hero = useMemo(() => liveNow[0] || continueListening[0] || null, [liveNow, continueListening]);
  const heroIsLive = useMemo(() => Boolean(hero && liveNow[0] && idOf(hero) === idOf(liveNow[0])), [hero, liveNow]);

  const toggleCreatorFollow = useCallback(async (creator) => {
    const creatorId = idOf(creator);
    if (!creatorId || busyId) return;
    const currentlyFollowing = followedCreatorIds.has(creatorId);
    setBusyId(creatorId);
    try {
      if (currentlyFollowing) {
        await followService.unfollowCreator(creatorId);
        setFollowedCreatorIds((prev) => { const n = new Set(prev); n.delete(creatorId); return n; });
      } else {
        await followService.followCreator(creatorId);
        setFollowedCreatorIds((prev) => new Set([...prev, creatorId]));
      }
    } catch (followError) {
      setError(followError?.message || 'Could not update follow status.');
    } finally {
      setBusyId('');
    }
  }, [busyId, followedCreatorIds]);

  const openBroadcast = useCallback((broadcast) => {
    const broadcastId = idOf(broadcast);
    if (broadcastId) navigate(`/listen/live/${broadcastId}`);
  }, [navigate]);

  const openAudio = useCallback((track) => {
    const audioId = idOf(track);
    if (audioId) navigate(`/listen/audio/${audioId}`);
  }, [navigate]);

  const openCreator = useCallback((creator) => {
    const creatorId = idOf(creator);
    if (creatorId) navigate(`/listen/creator/${creatorId}`);
  }, [navigate]);

  if (loading) {
    return (
      <div className="lh-page" role="status" aria-live="polite">
        <div className="lh-layout">
          <div className="lh-main">
            <div className="lh-hero-skeleton" />
            <div className="lh-skeleton-grid">
              {Array.from({ length: 4 }).map((_, i) => <span key={i} className="lh-skeleton-card" />)}
            </div>
          </div>
          <aside className="lh-rail"><span className="lh-skeleton-rail" /></aside>
        </div>
      </div>
    );
  }

  const heroCategory = hero ? categoryOf(hero) : '';
  const heroDescription = hero ? descriptionOf(hero) : '';
  const heroCreatorName = hero ? creatorNameOf(hero) : '';
  const heroCreatorHandle = hero ? creatorHandleOf(hero) : '';
  const heroCreatorAvatar = hero ? creatorAvatarOf(hero) : '';
  const heroCreatorVerified = hero ? creatorVerifiedOf(hero) : false;
  const heroArtwork = hero ? artworkOf(hero) : null;
  const heroListeners = hero ? formatCount(hero?.station?.listenerCount ?? hero?.listenerCount ?? 0) : '0';
  const heroSubtitleFallback = hero ? (hero.station?.name || hero.stationName || '') : '';

  return (
    <div className="lh-page">
      {error && <div className="lh-error" role="alert">{error}</div>}

      <div className="lh-layout">
        {/* main column */}
        <div className="lh-main">
          {/* HERO */}
          {hero ? (
            <section className="lh-hero" aria-label={heroIsLive ? 'Live now' : 'Featured'}>
              <div className="lh-hero-left">
                <span className="lh-hero-live-pill">
                  <span className="lh-hero-dot" aria-hidden="true" />
                  LIVE NOW
                </span>
                <h1 className="lh-hero-title">{heroTitle(hero, heroIsLive)}</h1>
                {heroCategory && <p className="lh-hero-category">{heroCategory}</p>}
                {heroDescription && <p className="lh-hero-description">{heroDescription}</p>}

                <div className="lh-hero-meta">
                  <span className="lh-hero-avatar">
                    {heroCreatorAvatar ? <img src={heroCreatorAvatar} alt="" loading="lazy" /> : <span>{(heroCreatorName || 'E').charAt(0).toUpperCase()}</span>}
                  </span>
                  <span className="lh-hero-creator">
                    <span className="lh-hero-creator-name">
                      {heroCreatorName || heroSubtitleFallback || 'Echoo Creator'}
                      {heroCreatorVerified && <span className="lh-hero-verified"><FiCheck aria-hidden="true" /></span>}
                    </span>
                    {(heroCreatorHandle || heroSubtitleFallback) && (
                      <span className="lh-hero-creator-handle">{heroCreatorHandle || heroSubtitleFallback}</span>
                    )}
                  </span>
                  <span className="lh-hero-listeners-pill"><FiUsers aria-hidden="true" /> {heroListeners}</span>
                  {hasTranscript(hero) && (
                    <span className="lh-hero-transcript-pill"><FiFileText aria-hidden="true" /> Transcript available</span>
                  )}
                </div>

                <div className="lh-hero-actions">
                  <button type="button" className="lh-btn-primary" onClick={() => (heroIsLive ? openBroadcast(hero) : openAudio(hero))}>
                    Join live
                  </button>
                  <button type="button" className="lh-btn-circle" onClick={() => (heroIsLive ? openBroadcast(hero) : openAudio(hero))} aria-label="Play">
                    <FiPlay aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="lh-hero-art" aria-hidden="true">
                {heroArtwork ? (
                  <img src={heroArtwork} alt="" />
                ) : (
                  <span className="lh-hero-art-fallback"><FiHeadphones aria-hidden="true" /></span>
                )}
                <span className="lh-hero-art-wash" />
                <span className="lh-hero-feat">Feat. {heroCreatorName || 'Pastor Femi D.'}</span>
                <span className="lh-hero-blood" aria-hidden="true">Blood</span>
                <div className="lh-hero-dots" aria-hidden="true">
                  <span className="is-active" />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </section>
          ) : (
            <div className="lh-hero lh-hero--empty">
              <p className="lh-empty">Discover live conversations and audio made for you. Follow creators to personalize your home.</p>
            </div>
          )}

          {/* LIVE NOW */}
          <section className="lh-section" aria-label="Live now">
            <SectionHeader
              icon={<FiRadio aria-hidden="true" />}
              title="Live Now"
              subtitle={liveNow.length ? `${liveNow.length} live shows` : ''}
              onViewAll={() => navigate('/listen/live')}
            />
            <div className="lh-live-grid">
              {liveNow.length ? (
                liveNow.slice(0, 4).map((b, i) => (
                  <LiveCard key={idOf(b) || `live-${i}`} broadcast={b} index={i} onOpen={openBroadcast} />
                ))
              ) : (
                <p className="lh-empty lh-empty--card">Nothing live right now — check back soon.</p>
              )}
            </div>
          </section>

          {/* CONTINUE LISTENING */}
          <section className="lh-section" aria-label="Continue listening">
            <SectionHeader title="Continue Listening" onViewAll={() => navigate('/listen/history')} />
            {continueListening.length ? (
              <div className="lh-continue-grid">
                {continueListening.slice(0, 4).map((item, i) => (
                  <ContinueCard
                    key={`${idOf(item)}-${i}`}
                    item={item}
                    isLive={liveNow.some((b) => idOf(b) === idOf(item))}
                    onOpen={liveNow.some((b) => idOf(b) === idOf(item)) ? openBroadcast : openAudio}
                  />
                ))}
              </div>
            ) : (
              <p className="lh-empty lh-empty--card">Your listening history will appear here once you start playing.</p>
            )}
          </section>

          {/* RECOMMENDED CREATORS */}
          <section className="lh-section" aria-label="Recommended creators">
            <SectionHeader title="Recommended Creators" onViewAll={() => navigate('/listen/stations')} />
            <div className="lh-creator-grid">
              {recommendedCreators.length ? (
                recommendedCreators.slice(0, 4).map((creator, i) => (
                  <CreatorCard
                    key={idOf(creator) || `creator-${i}`}
                    creator={creator}
                    following={followedCreatorIds}
                    followerCount={creatorCounts[idOf(creator)] ?? creator.followerCount ?? 0}
                    busy={busyId === idOf(creator)}
                    onOpen={openCreator}
                    onToggleFollow={toggleCreatorFollow}
                  />
                ))
              ) : (
                <p className="lh-empty lh-empty--card">Follow creators you love — they’ll appear here.</p>
              )}
            </div>
          </section>

          {/* RECENT REPLAYS */}
          <section className="lh-section" aria-label="Recent replays">
            <SectionHeader title="Recent Replays" onViewAll={() => navigate('/listen/library')} />
            {continueListening.length ? (
              <div className="lh-continue-grid">
                {continueListening.slice(0, 4).map((item, i) => (
                  <ContinueCard key={`replay-${idOf(item)}-${i}`} item={item} isLive={false} onOpen={openAudio} />
                ))}
              </div>
            ) : (
              <p className="lh-empty lh-empty--card">Replays will appear here as the community grows.</p>
            )}
          </section>
        </div>

        {/* RIGHT RAIL */}
        <aside className="lh-rail" aria-label="More from Echoo">
          <div className="lh-rail-card lh-rail-card--transcript">
            <button type="button" className="lh-rail-close" aria-label="Dismiss"><span aria-hidden="true">×</span></button>
            <div className="lh-transcript-icon" aria-hidden="true">
              <FiFileText />
              <FiSearch className="lh-transcript-search" />
            </div>
            <h3 className="lh-rail-title">Replay with searchable transcript</h3>
            <p className="lh-rail-copy">Read along, search key moments and never miss a thing.</p>
            <button type="button" className="lh-rail-cta">Learn more</button>
          </div>

          <div className="lh-rail-card lh-rail-card--trending">
            <div className="lh-rail-head">
              <h3 className="lh-rail-title lh-rail-title--sm">Trending Topics</h3>
              <button type="button" className="lh-rail-viewall" onClick={() => navigate('/listen/search')}>View all</button>
            </div>
            {trending.length ? (
              <div className="lh-trending-list">
                {trending.map((item, idx) => (
                  <div key={`${item.term}-${idx}`} className="lh-trending-row">
                    <span className="lh-trending-hash">#</span>
                    <span className="lh-trending-term">{item.term}</span>
                    <span className="lh-trending-count">{item.activity ? `${formatCount(item.activity)} discussions` : ''}</span>
                    {idx < trending.length - 1 && <span className="lh-trending-chevron"><FiChevronRight aria-hidden="true" /></span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="lh-empty lh-empty--compact">Trending topics will appear here as the community grows.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ListenerHome;
