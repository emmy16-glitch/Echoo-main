import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaAngleDoubleRight,
  FaBars,
  FaBroadcastTower,
  FaCheck,
  FaCheckCircle,
  FaEllipsisV,
  FaHeadphones,
  FaHeart,
  FaPause,
  FaPlay,
  FaPodcast,
  FaSearch,
  FaTv,
  FaUsers,
} from 'react-icons/fa';

import followService from '../../services/followService';
import listenerService from '../../services/listenerService';
import notificationService from '../../services/notificationService';
import searchService from '../../services/searchService';
import ListenerToast from '../ListenerUI/ListenerToast';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding';
import '../../styles/listener-reference-pages.css';
import './ListenerFollowing.css';

const TABS = ['All', 'Stations', 'Shows', 'Creators'];

const idOf = (item) => String(item?.id || item?._id || '');

const relativeTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
};

const formatDuration = (seconds) => {
  const total = Number(seconds) || 0;
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const activityMeta = {
  new_release: { label: 'New audio uploaded', icon: FaHeadphones, tone: '#1769d3' },
  new_live_broadcast: { label: 'Started a live broadcast', icon: FaBroadcastTower, tone: '#e0245e' },
  new_follower: { label: 'You followed this creator', icon: FaUsers, tone: '#1769d3' },
  new_like: { label: 'New like on your audio', icon: FaHeart, tone: '#e0245e' },
  new_comment: { label: 'New comment on your audio', icon: FaBars, tone: '#344054' },
  live_started: { label: 'Started a live broadcast', icon: FaBroadcastTower, tone: '#e0245e' },
  station_went_live: { label: 'Started a live broadcast', icon: FaBroadcastTower, tone: '#e0245e' },
};

const categoryIcon = (category) => {
  const text = String(category || '').toLowerCase();
  if (text.includes('faith') || text.includes('religion')) return FaPodcast;
  if (text.includes('business') || text.includes('finance')) return FaMusic;
  if (text.includes('entertainment') || text.includes('music')) return FaMusic;
  if (text.includes('news')) return FaTv;
  if (text.includes('education') || text.includes('learning')) return FaPodcast;
  return FaPodcast;
};

const artistOf = (track) => {
  const artist = track?.artist && typeof track.artist === 'object' ? track.artist : null;
  return artist?.displayName || artist?.username || track?.artistName || 'Echoo Creator';
};

const ListenerFollowing = () => {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();

  const [tab, setTab] = useState('All');
  const [stations, setStations] = useState([]);
  const [creators, setCreators] = useState([]);
  const [shows, setShows] = useState([]);
  const [activity, setActivity] = useState([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [creatorSuggestions, setCreatorSuggestions] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });

  const showToast = useCallback((type, title, message) => setToast({ open: true, type, title, message }), []);

  const load = useCallback(async () => {
    try {
      const [stationResult, creatorResult, historyResult, activityResult] = await Promise.allSettled([
        followService.getFollowingStations(),
        followService.getFollowingCreators(),
        listenerService.getHistory(1, 100),
        notificationService.list({ page: 1, limit: 10 }),
      ]);

      if (stationResult.status === 'fulfilled') {
        setStations(Array.isArray(stationResult.value?.data) ? stationResult.value.data : []);
      }
      if (creatorResult.status === 'fulfilled') {
        setCreators(Array.isArray(creatorResult.value?.data) ? creatorResult.value.data : []);
      }
      if (historyResult.status === 'fulfilled') {
        const history = historyResult.value?.data?.history || [];
        setShows(history.map((entry) => entry.track).filter(Boolean));
      }
      if (activityResult.status === 'fulfilled') {
        setActivity(Array.isArray(activityResult.value?.data?.notifications) ? activityResult.value.data.notifications : []);
      }
    } finally {
      // intentionally empty
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load();
    const interval = window.setInterval(sync, 20000);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  useEffect(() => {
    if (!categorySearch.trim()) {
      setCreatorSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchService.search(categorySearch.trim(), { type: 'creators', limit: 4 });
        if (!cancelled) {
          setCreatorSuggestions(Array.isArray(result?.data?.results?.creators) ? result.data.results.creators : []);
        }
      } catch {
        if (!cancelled) setCreatorSuggestions([]);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [categorySearch]);

  const liveStationIds = useMemo(
    () => new Set(stations.filter((station) => station.isLive).map((station) => idOf(station))),
    [stations]
  );

  const listeningOf = (station) => Number(station.listenersOnline ?? station.listenerCount ?? 0);

  const categories = useMemo(() => {
    const map = new Map();
    stations.forEach((station) => {
      const key = String(station.category || 'Other').trim();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count);
  }, [stations]);

  const followingCount = stations.length + shows.length + creators.length;

  const playShow = (track) => {
    const id = idOf(track);
    if (!id) return;
    if (idOf(currentTrack) === id) {
      togglePlay();
      return;
    }
    playTrack({
      id,
      title: track.title || 'Untitled Audio',
      subtitle: artistOf(track),
      fileUrl: track.fileUrl,
      coverArt: track.coverArt || null,
      duration: Number(track.duration) || 0,
      genre: track.genre || 'Audio',
    });
  };

  const unfollowStation = async (station) => {
    const key = idOf(station);
    if (busyId || !key) return;
    try {
      setBusyId(key);
      await followService.unfollowStation(key);
      setStations((current) => current.filter((item) => idOf(item) !== key));
      showToast('success', 'Unfollowed', `${station.name || 'Station'} removed from your following.`);
    } catch (error) {
      showToast('error', 'Could not unfollow', error?.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  };

  const unfollowCreator = async (creator) => {
    const key = idOf(creator);
    if (busyId || !key) return;
    try {
      setBusyId(key);
      await followService.unfollowCreator(key);
      setCreators((current) => current.filter((item) => idOf(item) !== key));
      showToast('success', 'Unfollowed', `${creator.name || 'Creator'} removed from your following.`);
    } catch (error) {
      showToast('error', 'Could not unfollow', error?.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  };

  const stationArt = (station) =>
    (station.brandCover || station.coverArt) || buildGeneratedStationBrandCoverUrl(station);

  const filteredStations = tab === 'All' || tab === 'Stations' ? stations : [];
  const filteredShows = tab === 'All' || tab === 'Shows' ? shows : [];
  const filteredCreators = tab === 'All' || tab === 'Creators' ? creators : [];

  return (
    <main className="echoo-reference-page ref-following-page fl-page">
      <ListenerToast {...toast} onClose={() => setToast((current) => ({ ...current, open: false }))} />

      <header className="fl-heading">
        <div className="fl-heading-text">
          <h1>Following</h1>
          <p>Stations, shows and creators you follow.</p>
        </div>
      </header>

      <div className="fl-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            type="button"
            role="tab"
            key={item}
            aria-selected={tab === item}
            className={`fl-tab${tab === item ? ' fl-tab-active' : ''}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="fl-stats">
        <article className="fl-stat">
          <span className="fl-stat-icon fl-stat-icon--blue"><FaBroadcastTower /></span>
          <span className="fl-stat-value">{stations.length}</span>
          <span className="fl-stat-label">Stations</span>
          <span className="fl-stat-sub">You follow</span>
        </article>
        <article className="fl-stat">
          <span className="fl-stat-icon fl-stat-icon--purple"><FaHeadphones /></span>
          <span className="fl-stat-value">{shows.length}</span>
          <span className="fl-stat-label">Shows</span>
          <span className="fl-stat-sub">You follow</span>
        </article>
        <article className="fl-stat">
          <span className="fl-stat-icon fl-stat-icon--green"><FaUsers /></span>
          <span className="fl-stat-value">{creators.length}</span>
          <span className="fl-stat-label">Creators</span>
          <span className="fl-stat-sub">You follow</span>
        </article>
        <article className="fl-stat">
          <span className="fl-stat-icon fl-stat-icon--orange"><FaHeart /></span>
          <span className="fl-stat-value">{followingCount}</span>
          <span className="fl-stat-label">Total items</span>
          <span className="fl-stat-sub">In your following</span>
        </article>
      </div>

      <div className="fl-layout">
        <div className="fl-main">
          {(tab === 'All' || tab === 'Stations') && (
            <section className="fl-section">
              <div className="fl-section-header">
                <h2>Followed stations</h2>
                <button type="button" className="fl-view-all" onClick={() => navigate('/listen/stations')}>View all stations <FaAngleDoubleRight /></button>
              </div>
              {filteredStations.length === 0 && (
                <div className="ref-state-card compact">
                  <FaBroadcastTower />
                  <strong>No stations followed yet.</strong>
                  <span>Browse the stations page and follow the voices you want to keep up with.</span>
                </div>
              )}
              <div className="fl-station-grid">
                {filteredStations.map((station) => {
                  const id = idOf(station);
                  const live = liveStationIds.has(id);
                  return (
                    <article className="fl-station-card" key={id}>
                      <button type="button" className="fl-station-art" onClick={() => navigate(`/listen/stations/${id}`)}>
                        <img src={stationArt(station)} alt="" />
                        {live && <span className="fl-live-badge">LIVE</span>}
                      </button>
                      <div className="fl-station-body">
                        <strong>{station.name}</strong>
                        <span className="fl-station-category">{station.category || 'Echoo'}</span>
                        <span className="fl-listening">
                          <i className={`fl-listening-dot${live ? ' fl-listening-dot--live' : ''}`} />
                          {listeningOf(station)} listening
                        </span>
                        <div className="fl-station-actions">
                          <button
                            type="button"
                            className="fl-following-pill"
                            disabled={busyId === id}
                            onClick={() => unfollowStation(station)}
                          >
                            <FaCheck /> {busyId === id ? 'Updating' : 'Following'}
                          </button>
                          <button type="button" className="fl-more-btn" aria-label={`More options for ${station.name}`}>
                            <FaEllipsisV />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {(tab === 'All' || tab === 'Shows') && (
            <section className="fl-section">
              <div className="fl-section-header">
                <h2>Followed shows</h2>
                <button type="button" className="fl-view-all" onClick={() => navigate('/listen/history')}>View all shows <FaAngleDoubleRight /></button>
              </div>
              {filteredShows.length === 0 && (
                <div className="ref-state-card compact">
                  <FaHeadphones />
                  <strong>No shows in your history yet.</strong>
                  <span>Shows you listen to will appear here.</span>
                </div>
              )}
              <div className="fl-show-grid">
                {filteredShows.map((track) => {
                  const id = idOf(track);
                  const playing = isPlaying && idOf(currentTrack) === id;
                  return (
                    <article className="fl-show-row" key={`${id}-${idOf(track.playlist || {})}`}>
                      <button type="button" className="fl-show-art" onClick={() => playShow(track)}>
                        {track.coverArt ? <img src={track.coverArt} alt="" /> : <FaHeadphones />}
                        <span className="fl-show-play">{playing ? <FaPause /> : <FaPlay />}</span>
                      </button>
                      <div className="fl-show-info">
                        <strong>{track.title || 'Untitled Audio'}</strong>
                        <span>{artistOf(track)}{track.playedAt || track.createdAt ? ` • ${relativeTime(track.playedAt || track.createdAt)}` : ''}</span>
                      </div>
                      <span className="fl-show-duration">{formatDuration(track.duration)}</span>
                      <button type="button" className="fl-show-play-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={() => playShow(track)}>
                        {playing ? <FaPause /> : <FaPlay />}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {(tab === 'All' || tab === 'Creators') && (
            <section className="fl-section">
              <div className="fl-section-header">
                <h2>Creators you follow</h2>
                <button type="button" className="fl-view-all" onClick={() => navigate('/listen/library')}>View all <FaAngleDoubleRight /></button>
              </div>
              {filteredCreators.length === 0 && (
                <div className="ref-state-card compact">
                  <FaUsers />
                  <strong>You're not following any creators yet.</strong>
                  <span>Follow creators from their profiles to see them here.</span>
                </div>
              )}
              <div className="fl-creator-list">
                {filteredCreators.map((creator) => {
                  const id = idOf(creator);
                  return (
                    <article className="fl-creator-row" key={id}>
                      <button type="button" className="fl-creator-avatar" onClick={() => navigate(`/creator/${creator.username || id}`)}>
                        {creator.avatar ? <img src={creator.avatar} alt="" /> : creator.name?.[0]?.toUpperCase()}
                      </button>
                      <div className="fl-creator-info">
                        <strong>{creator.name} <FaCheckCircle className="fl-verified" /></strong>
                        <span>@{creator.username || 'creator'}</span>
                      </div>
                      <button
                        type="button"
                        className="fl-following-pill"
                        disabled={busyId === id}
                        onClick={() => unfollowCreator(creator)}
                      >
                        <FaCheck /> {busyId === id ? 'Updating' : 'Following'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <aside className="fl-sidebar">
          <section className="fl-card fl-activity-card">
            <strong>Recent activity</strong>
            {activity.length === 0 && (
              <p className="fl-empty-note">No recent activity.</p>
            )}
            {activity.slice(0, 5).map((item) => {
              const meta = activityMeta[item.type] || { label: item.type || 'Activity', icon: FaHeadphones, tone: '#344054' };
              const Icon = meta.icon;
              return (
                <article className="fl-activity-row" key={idOf(item)}>
                  <span className="fl-activity-icon" style={{ color: meta.tone }}><Icon /></span>
                  <div className="fl-activity-info">
                    <strong>{item.fromUser?.displayName || item.fromUser?.username || 'Echoo'}</strong>
                    <span>{meta.label}</span>
                    <span className="fl-activity-time">{relativeTime(item.createdAt)}</span>
                  </div>
                </article>
              );
            })}
            <button type="button" className="fl-view-all" onClick={() => navigate('/listen/notifications')}>View all activity <FaAngleDoubleRight /></button>
          </section>

          <section className="fl-card fl-categories-card">
            <strong>Categories</strong>
            {categories.length === 0 && <p className="fl-empty-note">Categories appear once you follow stations.</p>}
            {categories.map(({ name, count }) => {
              const Icon = categoryIcon(name);
              return (
                <article className="fl-category-row" key={name}>
                  <span className="fl-category-icon"><Icon /></span>
                  <span className="fl-category-name">{name}</span>
                  <span className="fl-category-count">{count}</span>
                </article>
              );
            })}
            <button type="button" className="fl-view-all" onClick={() => navigate('/listen/stations')}>View all categories <FaAngleDoubleRight /></button>
          </section>

          <section className="fl-card fl-creators-card">
            <div className="fl-card-header">
              <strong>Creators you follow</strong>
              <button type="button" className="fl-view-all" onClick={() => navigate('/listen/discover')}>View all <FaAngleDoubleRight /></button>
            </div>
            {creators.length === 0 && (
              <p className="fl-empty-note">No creators followed yet.</p>
            )}
            {creators.slice(0, 4).map((creator) => (
              <article className="fl-creator-row fl-creator-row--compact" key={idOf(creator)}>
                <button type="button" className="fl-creator-avatar fl-creator-avatar--sm" onClick={() => navigate(`/creator/${creator.username || idOf(creator)}`)}>
                  {creator.avatar ? <img src={creator.avatar} alt="" /> : creator.name?.[0]?.toUpperCase()}
                </button>
                <div className="fl-creator-info">
                  <strong>{creator.name} <FaCheckCircle className="fl-verified" /></strong>
                  <span>@{creator.username || 'creator'}</span>
                </div>
              </article>
            ))}
            <div className="fl-creator-search">
              <FaSearch />
              <input
                type="text"
                placeholder="Find more creators"
                value={categorySearch}
                maxLength={60}
                onChange={(event) => setCategorySearch(event.target.value)}
                aria-label="Find more creators"
              />
              {creatorSuggestions.length > 0 && (
                <ul className="fl-creator-suggestions">
                  {creatorSuggestions.map((creator) => (
                    <li key={idOf(creator)}>
                      <button type="button" onClick={() => { setCategorySearch(''); setCreatorSuggestions([]); navigate(`/creator/${creator.username || idOf(creator)}`); }}>
                        {creator.avatar ? <img src={creator.avatar} alt="" /> : null}
                        <span>{creator.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
};

export default ListenerFollowing;
