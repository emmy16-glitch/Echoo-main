import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaArrowRight,
  FaHeadphones,
  FaPause,
  FaPlay,
} from 'react-icons/fa';

import listenerService from '../../services/listenerService';
import audioService from '../../services/audioService';
import batch3Service from '../../services/batch3Service';
import followService from '../../services/followService';
import { buildMediaUrl } from '../../services/api';
import '../../styles/listener-reference-pages.css';

const HOME_SYNC_INTERVAL_MS = 15000;
const HOME_CORE_TIMEOUT_MS = 10000;

const withTimeout = async (promise, label, timeoutMs = HOME_CORE_TIMEOUT_MS) => {
  let timeoutId;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`${label} took too long to respond.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
};

const idOf = (item) => item?.id || item?._id || item?.trackId || null;
const initials = (value) => String(value || 'Echoo')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word.charAt(0).toUpperCase())
  .join('');

const artistName = (item) => {
  const artist = item?.artist;
  return item?.artistName ||
    (typeof artist === 'string'
      ? artist
      : artist?.creatorProfile?.artistName ||
        artist?.creatorProfile?.organizationName ||
        artist?.displayName ||
        artist?.username) ||
    item?.creatorName ||
    item?.creator?.displayName ||
    item?.creator?.username ||
    'Echoo Creator';
};

const creatorName = (item) => {
  const profile = item?.creatorProfile || {};
  return item?.name || item?.displayName || profile.artistName ||
    profile.organizationName || item?.username || 'Echoo Creator';
};

const artworkOf = (item) => buildMediaUrl(
  item?.brandCover ||
  item?.coverArt ||
  item?.artwork ||
  item?.image ||
  item?.station?.brandCover ||
  item?.station?.coverArt ||
  null
);

const avatarOf = (item) => buildMediaUrl(
  item?.avatar || item?.creatorProfile?.organizationLogo || item?.profileImage || null
);

const ListenerHome = () => {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();

  const [dashboard, setDashboard] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [stations, setStations] = useState([]);
  const [live, setLive] = useState([]);
  const [followingCreators, setFollowingCreators] = useState(new Set());
  const [followingStations, setFollowingStations] = useState(new Set());
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFollowState = useCallback(() => {
    Promise.allSettled([
      withTimeout(followService.getFollowingCreators(), 'Creator follows'),
      withTimeout(followService.getFollowingStations(), 'Station follows'),
    ]).then(([creatorsResult, stationsFollowedResult]) => {
      if (creatorsResult.status === 'fulfilled') {
        setFollowingCreators(new Set(
          (creatorsResult.value?.data || []).map((creator) => String(creator.id)).filter(Boolean)
        ));
      }

      if (stationsFollowedResult.status === 'fulfilled') {
        setFollowingStations(new Set(
          (stationsFollowedResult.value?.data || []).map((station) => String(station.id)).filter(Boolean)
        ));
      }
    });
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) setError('');

      const [dashboardResult, audioResult, discoveryResult] =
        await Promise.allSettled([
          withTimeout(listenerService.getDashboard(), 'Listener dashboard'),
          withTimeout(audioService.getAll({ public: true, page: 1, limit: 60 }), 'Public audio'),
          withTimeout(batch3Service.getDiscovery(), 'Listener discovery'),
        ]);

      if (dashboardResult.status === 'fulfilled') {
        setDashboard(dashboardResult.value?.data || null);
      } else if (!silent) {
        setError(dashboardResult.reason?.message || 'Could not load your Echoo home feed.');
      }

      if (audioResult.status === 'fulfilled') {
        setTracks(Array.isArray(audioResult.value?.data) ? audioResult.value.data : []);
      }

      if (discoveryResult.status === 'fulfilled') {
        setStations(Array.isArray(discoveryResult.value?.stations) ? discoveryResult.value.stations : []);
        setLive(Array.isArray(discoveryResult.value?.live) ? discoveryResult.value.live : []);
      }
    } finally {
      if (!silent) setLoading(false);
      loadFollowState();
    }
  }, [loadFollowState]);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, HOME_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const creators = useMemo(() => {
    const source = Array.isArray(dashboard?.discoverCreators) ? dashboard.discoverCreators : [];
    return source.filter((creator) => idOf(creator)).slice(0, 7);
  }, [dashboard]);

  const featuredAudio = useMemo(() => {
    const recommended = Array.isArray(dashboard?.recommendedTracks)
      ? dashboard.recommendedTracks.filter((track) => track?.fileUrl)
      : [];
    const merged = [...live, ...(recommended.length ? recommended : tracks)];
    const seen = new Set();
    return merged.filter((item) => {
      const key = `${item?.status === 'live' ? 'live' : 'audio'}:${idOf(item)}`;
      if (!idOf(item) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [dashboard, live, tracks]);

  const stationCards = useMemo(() => stations.filter((station) => station?.id).slice(0, 5), [stations]);
  const featuredLive = live[0] || null;

  const playAudio = (track) => {
    const id = idOf(track);
    if (!track?.fileUrl) return;
    if (String(currentTrack?.id || '') === String(id || '')) {
      togglePlay();
      return;
    }
    playTrack({
      ...track,
      id,
      title: track.title || 'Untitled Audio',
      subtitle: artistName(track),
      coverArt: artworkOf(track),
      fileUrl: buildMediaUrl(track.fileUrl),
      duration: Number(track.duration) || 0,
      genre: track.genre || 'Audio',
    }, tracks);
  };

  const openFeatured = (item) => {
    if (item?.status === 'live' || item?.isLive) navigate(`/listen/live/${idOf(item)}`);
    else navigate(`/listen/audio/${idOf(item)}`);
  };

  const toggleCreatorFollow = async (creator) => {
    const id = idOf(creator);
    if (!id || busyId) return;
    const key = String(id);
    const active = followingCreators.has(key);
    try {
      setBusyId(`creator-${key}`);
      if (active) await followService.unfollowCreator(id);
      else await followService.followCreator(id);
      setFollowingCreators((current) => {
        const next = new Set(current);
        if (active) next.delete(key); else next.add(key);
        return next;
      });
    } catch (followError) {
      setError(followError?.message || 'Could not update creator follow status.');
    } finally {
      setBusyId('');
    }
  };

  const toggleStationFollow = async (station) => {
    const id = idOf(station);
    if (!id || busyId) return;
    const key = String(id);
    const active = followingStations.has(key);
    try {
      setBusyId(`station-${key}`);
      if (active) await followService.unfollowStation(id);
      else await followService.followStation(id);
      setFollowingStations((current) => {
        const next = new Set(current);
        if (active) next.delete(key); else next.add(key);
        return next;
      });
    } catch (followError) {
      setError(followError?.message || 'Could not update station follow status.');
    } finally {
      setBusyId('');
    }
  };

  if (loading) {
    return (
      <main className="echoo-reference-page ref-home-page">
        <div className="ref-home-skeleton" />
        <div className="ref-loading-row"><i /><i /><i /><i /></div>
      </main>
    );
  }

  return (
    <main className="echoo-reference-page ref-home-page">
      {error && <div className="ref-inline-error">{error}</div>}

      <section className="ref-home-hero">
        <div className="ref-home-hero-copy">
          <span className="ref-kicker light">HOME / REAL AUDIO</span>
          <h1>Voices that inspire.<br />Audio that connects.</h1>
          <p>Live and recorded audio from creators and stations across Echoo.</p>
          <div className="ref-home-hero-actions">
            <button type="button" onClick={() => navigate('/listen/stations')}>Explore stations</button>
            <button type="button" className="ghost" onClick={() => navigate('/listen/search')}>Browse audio</button>
          </div>
        </div>

        <div className="ref-home-hero-visual" aria-hidden="true">
          <div className="ref-home-wave one" />
          <div className="ref-home-wave two" />
          <FaHeadphones />
        </div>

        <button
          type="button"
          className={`ref-home-live-feature ${featuredLive ? '' : 'offline'}`}
          onClick={() => featuredLive && navigate(`/listen/live/${idOf(featuredLive)}`)}
          disabled={!featuredLive}
        >
          <span><i /> {featuredLive ? 'Live now' : 'Nothing live now'}</span>
          <strong>{featuredLive?.title || 'Live broadcasts will appear here'}</strong>
          <small>{featuredLive ? `${Number(featuredLive.listenerCount) || 0} listening` : 'Check Live for upcoming broadcasts'}</small>
          <b><FaPlay /></b>
        </button>
      </section>

      <section className="ref-home-section">
        <div className="ref-section-heading">
          <div>
            <h2>Featured public audio</h2>
            <p>Real recordings and live shows available on Echoo.</p>
          </div>
          <button type="button" onClick={() => navigate('/listen/search')}>View all <FaArrowRight /></button>
        </div>

        {featuredAudio.length ? (
          <div className="ref-featured-audio-grid">
            {featuredAudio.map((item) => {
              const itemIsLive = item?.status === 'live' || item?.isLive;
              const playing = !itemIsLive && isPlaying && String(currentTrack?.id || '') === String(idOf(item));
              return (
                <article className="ref-feature-audio-card" key={`${itemIsLive ? 'live' : 'audio'}-${idOf(item)}`}>
                  <button type="button" className="ref-feature-art" onClick={() => openFeatured(item)}>
                    {artworkOf(item) ? <img src={artworkOf(item)} alt="" /> : <FaHeadphones />}
                    {itemIsLive && <span className="ref-live-chip"><i /> LIVE NOW</span>}
                  </button>
                  <div className="ref-feature-audio-copy">
                    <span>{itemIsLive ? item.stationName || item.category || 'Live' : item.genre || 'Audio'}</span>
                    <strong>{item.title || item.name || 'Untitled'}</strong>
                    <small>{itemIsLive ? `${Number(item.listenerCount) || 0} listening` : artistName(item)}</small>
                  </div>
                  <button
                    type="button"
                    className="ref-round-play"
                    onClick={() => itemIsLive ? navigate(`/listen/live/${idOf(item)}`) : playAudio(item)}
                    aria-label={itemIsLive ? 'Join live broadcast' : playing ? 'Pause audio' : 'Play audio'}
                  >
                    {playing ? <FaPause /> : <FaPlay />}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ref-state-card compact"><FaHeadphones /><strong>No public audio yet.</strong></div>
        )}
      </section>

      <section className="ref-home-section">
        <div className="ref-section-heading">
          <div><h2>Voices to know</h2><p>Creators building real audiences on Echoo.</p></div>
          <button type="button" onClick={() => navigate('/listen/search')}>View all creators <FaArrowRight /></button>
        </div>

        {creators.length ? (
          <div className="ref-creators-row">
            {creators.map((creator) => {
              const id = idOf(creator);
              const following = followingCreators.has(String(id));
              const name = creatorName(creator);
              return (
                <article className="ref-creator-tile" key={id}>
                  <button type="button" className="ref-creator-avatar" onClick={() => navigate(`/listen/creator/${id}`)}>
                    {avatarOf(creator) ? <img src={avatarOf(creator)} alt="" /> : <span>{initials(name)}</span>}
                  </button>
                  <strong>{name}</strong>
                  <small>{creator.creatorProfile?.category || creator.category || 'Creator'}</small>
                  <button
                    type="button"
                    className={following ? 'following' : ''}
                    disabled={busyId === `creator-${id}`}
                    onClick={() => toggleCreatorFollow(creator)}
                  >
                    {busyId === `creator-${id}` ? 'Updating...' : following ? 'Following' : 'Follow'}
                  </button>
                </article>
              );
            })}
          </div>
        ) : <div className="ref-state-card compact"><strong>No public creators to show yet.</strong></div>}
      </section>

      <section className="ref-home-section">
        <div className="ref-section-heading">
          <div><h2>Stations worth following</h2><p>Public stations configured by Echoo creators.</p></div>
          <button type="button" onClick={() => navigate('/listen/stations')}>View all stations <FaArrowRight /></button>
        </div>

        {stationCards.length ? (
          <div className="ref-home-station-row">
            {stationCards.map((station) => {
              const id = idOf(station);
              const following = followingStations.has(String(id));
              return (
                <article className="ref-home-station-card" key={id}>
                  <button type="button" className="ref-home-station-art" onClick={() => navigate(`/listen/stations/${id}`)}>
                    {artworkOf(station) ? <img src={artworkOf(station)} alt="" /> : <FaHeadphones />}
                    {station.isLive && <span className="ref-live-chip"><i /> LIVE</span>}
                  </button>
                  <div><strong>{station.name}</strong><span>{station.category || 'Other'} · {Number(station.listenerCount) || 0} listening</span></div>
                  <button
                    type="button"
                    className={following ? 'following' : ''}
                    disabled={busyId === `station-${id}`}
                    onClick={() => toggleStationFollow(station)}
                  >
                    {following ? 'Following' : 'Follow'}
                  </button>
                </article>
              );
            })}
          </div>
        ) : <div className="ref-state-card compact"><strong>No public stations yet.</strong></div>}
      </section>
    </main>
  );
};

export default ListenerHome;
