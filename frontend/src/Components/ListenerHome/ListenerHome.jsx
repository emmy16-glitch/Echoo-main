import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaArrowRight,
  FaBroadcastTower,
  FaHeadphones,
  FaPause,
  FaPlay,
} from 'react-icons/fa';

import listenerService from '../../services/listenerService';
import audioService from '../../services/audioService';
import batch3Service from '../../services/batch3Service';
import { buildMediaUrl } from '../../services/api';
import EchoAmbient from '../EchooSystem/EchoAmbient';
import HorizontalDragRail from '../FigmaUI/HorizontalDragRail';
import './ListenerHome.css';

const HOME_SYNC_INTERVAL_MS = 15000;

const normalizeAudioResponse = (response) => {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.tracks)) return response.data.tracks;
  return [];
};

const idOf = (item) => item?.id || item?._id || item?.trackId || null;

const artistName = (item) => {
  const artist = item?.artist;
  return (
    item?.artistName ||
    (typeof artist === 'string'
      ? artist
      : artist?.displayName || artist?.username) ||
    item?.creator?.displayName ||
    item?.creator?.username ||
    'Echoo Creator'
  );
};

const artworkOf = (item) =>
  buildMediaUrl(
    item?.brandCover ||
      item?.coverArt ||
      item?.artwork ||
      item?.image ||
      item?.thumbnail ||
      item?.station?.brandCover ||
      item?.station?.coverArt ||
      item?.creator?.avatar ||
      null
  );

const initials = (value) =>
  String(value || 'Echoo')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

const IdentityImage = ({ item, name }) => {
  const [failed, setFailed] = useState(false);
  const source = artworkOf(item) || buildMediaUrl(item?.avatar || null);

  if (source && !failed) {
    return (
      <img
        src={source}
        alt=""
        draggable="false"
        onError={() => setFailed(true)}
      />
    );
  }

  return <span className="identity-fallback">{initials(name)}</span>;
};

const normalizeLive = (item) => {
  if (!item) return null;

  const station = typeof item.station === 'object' ? item.station : null;
  const creator = typeof item.creator === 'object' ? item.creator : null;

  return {
    ...item,
    id: item.id || item._id || null,
    stationId: station?.id || station?._id || item.stationId || item.station || null,
    stationName: station?.name || item.stationName || 'Echoo Station',
    creatorId: creator?.id || creator?._id || item.creatorId || item.creator || null,
    creatorName:
      creator?.displayName || creator?.username || item.creatorName || 'Echoo Creator',
    coverArt:
      station?.brandCover ||
      item.brandCover ||
      item.coverArt ||
      station?.coverArt ||
      null,
    listenerCount: Number(item.listenerCount) || 0,
  };
};

const normalizeCreator = (item) => {
  if (!item) return null;
  const profile = item.creatorProfile || {};
  return {
    ...item,
    id: item.id || item._id || null,
    name:
      item.displayName ||
      profile.artistName ||
      profile.organizationName ||
      item.username ||
      'Echoo Creator',
    avatar: item.avatar || profile.organizationLogo || null,
  };
};

const normalizeStation = (item) => {
  if (!item) return null;
  return {
    ...item,
    id: item.id || item._id || null,
    name: item.name || 'Echoo Station',
  };
};

const ListenerHome = () => {
  const navigate = useNavigate();
  const {
    playTrack,
    playTrackAt,
    currentTrack,
    isPlaying,
    togglePlay,
  } = useOutletContext();

  const [dashboard, setDashboard] = useState(null);
  const [audioTracks, setAudioTracks] = useState([]);
  const [discovery, setDiscovery] = useState({ live: [], stations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) setError('');

      const [dashboardResult, audioResult, discoveryResult] = await Promise.allSettled([
        listenerService.getDashboard(),
        audioService.getAll({ public: true, page: 1, limit: 50 }),
        batch3Service.getDiscovery(),
      ]);

      if (dashboardResult.status === 'fulfilled') {
        setDashboard(dashboardResult.value?.data || null);
      } else if (!silent) {
        setError(
          dashboardResult.reason?.message || 'Could not load your Echoo home feed.'
        );
      }

      if (audioResult.status === 'fulfilled') {
        setAudioTracks(normalizeAudioResponse(audioResult.value));
      }

      if (discoveryResult.status === 'fulfilled') {
        setDiscovery({
          live: Array.isArray(discoveryResult.value?.live)
            ? discoveryResult.value.live
            : [],
          stations: Array.isArray(discoveryResult.value?.stations)
            ? discoveryResult.value.stations
            : [],
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

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

  const liveItems = useMemo(() => {
    const source = discovery.live.length
      ? discovery.live
      : Array.isArray(dashboard?.liveNow)
        ? dashboard.liveNow
        : [];

    return source.map(normalizeLive).filter((item) => item?.id);
  }, [dashboard, discovery.live]);

  const continueItems = useMemo(() => {
    const backend = Array.isArray(dashboard?.continueListening)
      ? dashboard.continueListening
      : [];
    return backend.slice(0, 6);
  }, [dashboard]);

  const recommended = useMemo(() => {
    const backend = Array.isArray(dashboard?.recommendedTracks)
      ? dashboard.recommendedTracks
      : [];
    return (backend.length ? backend : audioTracks).slice(0, 12);
  }, [dashboard, audioTracks]);

  const channels = useMemo(() => {
    const creators = (Array.isArray(dashboard?.discoverCreators)
      ? dashboard.discoverCreators
      : []
    )
      .map(normalizeCreator)
      .filter((item) => item?.id)
      .map((creator) => ({
        ...creator,
        type: 'Creator',
        route: `/listen/creator/${creator.id}`,
      }));

    const stationSource = discovery.stations.length
      ? discovery.stations
      : Array.isArray(dashboard?.discoverStations)
        ? dashboard.discoverStations
        : [];

    const stations = stationSource
      .map(normalizeStation)
      .filter((item) => item?.id)
      .map((station) => ({
        ...station,
        type: 'Station',
        route: `/listen/stations/${station.id}`,
      }));

    return [...creators, ...stations].slice(0, 12);
  }, [dashboard, discovery.stations]);

  const play = (item, queue) => {
    const id = idOf(item);

    if ((id && currentTrack?.id === id) || currentTrack?.title === item.title) {
      togglePlay();
      return;
    }

    const track = {
      ...item,
      id,
      title: item.title || 'Untitled Audio',
      subtitle: artistName(item),
      coverArt: artworkOf(item),
      fileUrl: buildMediaUrl(item.fileUrl || null),
      duration: Number(item.duration) || 0,
      genre: item.genre || 'Audio',
    };

    const progress = Math.max(0, Math.min(100, Number(item.progress) || 0));
    const resumeAt = track.duration > 0 ? (track.duration * progress) / 100 : 0;

    if (resumeAt > 0 && playTrackAt) {
      playTrackAt(track, resumeAt, queue);
    } else {
      playTrack(track, queue);
    }
  };

  const playing = (item) => {
    const id = idOf(item);
    return (
      isPlaying &&
      ((id && currentTrack?.id === id) || currentTrack?.title === item.title)
    );
  };

  if (loading) {
    return (
      <div className="identity-home">
        <div className="identity-home-loading"><span /><span /><span /></div>
      </div>
    );
  }

  const featured = liveItems[0] || null;

  return (
    <div className="identity-home">
      {error && <div className="cbf-message error">{error}</div>}

      <header className="identity-home-hero echoo-home-filled-hero">
        <EchoAmbient density="low" className="identity-home-ambient" />

        <div className="echoo-home-hero-copy">
          <span className="identity-kicker">ECHOO / NOW</span>
          <h1>Your world is talking.</h1>
          <p>Live voices, conversations and audio worth hearing right now.</p>

          <div className="echoo-home-hero-buttons">
            <button
              type="button"
              className="echoo-home-hero-primary"
              onClick={() =>
                navigate(featured ? `/listen/live/${featured.id}` : '/listen/live')
              }
            >
              {featured ? "Join what's live" : 'Discover Live'} <FaArrowRight />
            </button>
            <button
              type="button"
              className="echoo-home-hero-secondary"
              onClick={() => navigate('/listen/stations')}
            >
              Browse stations
            </button>
          </div>
        </div>

        {featured ? (
          <article className="echoo-home-featured-card">
            <button
              type="button"
              className="echoo-home-featured-image"
              aria-label={`Open ${featured.title}`}
              onClick={() => navigate(`/listen/live/${featured.id}`)}
            >
              {artworkOf(featured) ? (
                <img src={artworkOf(featured)} alt="" />
              ) : (
                <div className="identity-fallback"><FaBroadcastTower /></div>
              )}
              <span className="echoo-home-featured-overlay" />
              <span className="echoo-home-live-pill"><i /> LIVE</span>
              <span className="echoo-home-featured-count">
                {featured.listenerCount.toLocaleString()} listening
              </span>
            </button>

            <div className="echoo-home-featured-bottom">
              <div>
                <small>Featured live</small>
                <h2>{featured.title}</h2>
                <p>{featured.stationName} · {featured.creatorName}</p>
              </div>
              <button
                type="button"
                aria-label={`Join ${featured.title}`}
                onClick={() => navigate(`/listen/live/${featured.id}`)}
              >
                <FaPlay />
              </button>
            </div>
          </article>
        ) : (
          <div className="echoo-home-featured-card identity-empty-row">
            <FaHeadphones />
            <span>No one is live right now. Scheduled broadcasts will appear in Live.</span>
          </div>
        )}
      </header>

      <section className="identity-section presence-section echoo-home-live-around">
        <div className="identity-section-heading echoo-home-live-heading">
          <div>
            <h2>Live around you</h2>
            <p>Real broadcasts happening now.</p>
          </div>
          <button type="button" onClick={() => navigate('/listen/live')}>
            See all <FaArrowRight />
          </button>
        </div>

        {liveItems.length ? (
          <div className="echoo-home-live-cards">
            {liveItems.slice(0, 3).map((item) => (
              <article key={item.id} className="echoo-home-live-card">
                <button
                  type="button"
                  className="echoo-home-live-card-image"
                  aria-label={`Open ${item.title}`}
                  onClick={() => navigate(`/listen/live/${item.id}`)}
                >
                  {artworkOf(item) ? (
                    <img src={artworkOf(item)} alt="" />
                  ) : (
                    <div className="identity-fallback"><FaBroadcastTower /></div>
                  )}
                  <span className="echoo-home-live-card-overlay" />
                  <span className="echoo-home-live-pill"><i /> LIVE</span>
                  <span className="echoo-home-live-card-count">
                    {item.listenerCount.toLocaleString()} listening
                  </span>
                </button>
                <div className="echoo-home-live-card-body">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.stationName}</p>
                  </div>
                  <button
                    type="button"
                    className="echoo-home-live-card-open"
                    aria-label={`Join ${item.title}`}
                    onClick={() => navigate(`/listen/live/${item.id}`)}
                  >
                    <FaArrowRight />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="identity-empty-row">
            <FaHeadphones />
            <span>No live broadcasts at the moment.</span>
          </div>
        )}
      </section>

      <section className="identity-section">
        <div className="identity-section-heading">
          <div>
            <h2>Continue listening</h2>
            <p>Pick up where you left off.</p>
          </div>
          <button type="button" onClick={() => navigate('/listen/history')}>
            History <FaArrowRight />
          </button>
        </div>

        {continueItems.length ? (
          <div className="identity-continue-list">
            {continueItems.map((item, index) => (
              <article className="identity-continue-row" key={idOf(item) || index}>
                <div className={`identity-continue-art art-${(index % 4) + 1}`}>
                  <IdentityImage item={item} name={item.title} />
                </div>
                <div className="identity-continue-copy">
                  <h3>{item.title || 'Untitled Audio'}</h3>
                  <p>{artistName(item)}</p>
                </div>
                <div className="identity-row-line" />
                <button
                  type="button"
                  className="identity-round-play"
                  onClick={() => play(item, continueItems)}
                >
                  {playing(item) ? <FaPause /> : <FaPlay />}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="identity-empty-row">
            <FaHeadphones />
            <span>Start listening and unfinished audio will appear here.</span>
          </div>
        )}
      </section>

      <section className="identity-section">
        <div className="identity-section-heading">
          <div>
            <h2>For you</h2>
            <p>Real public audio from across Echoo.</p>
          </div>
          <button type="button" onClick={() => navigate('/listen/library')}>
            Library <FaArrowRight />
          </button>
        </div>

        {recommended.length ? (
          <HorizontalDragRail ariaLabel="Recommended audio" className="identity-audio-rail">
            {recommended.map((item, index) => (
              <article className="identity-audio-item" key={idOf(item) || index}>
                <div className={`identity-audio-art art-${(index % 4) + 1}`}>
                  <IdentityImage item={item} name={item.title} />
                  <button
                    type="button"
                    aria-label={playing(item) ? `Pause ${item.title}` : `Play ${item.title}`}
                    onClick={() => play(item, recommended)}
                  >
                    {playing(item) ? <FaPause /> : <FaPlay />}
                  </button>
                </div>
                <h3>{item.title || 'Untitled Audio'}</h3>
                <p>{artistName(item)}</p>
              </article>
            ))}
          </HorizontalDragRail>
        ) : (
          <div className="identity-empty-row">
            <FaHeadphones />
            <span>No public audio has been published yet.</span>
          </div>
        )}
      </section>

      <section className="identity-section channels-section">
        <div className="identity-section-heading">
          <div>
            <h2>Voices to know</h2>
            <p>Real creators and stations building on Echoo.</p>
          </div>
        </div>

        {channels.length ? (
          <HorizontalDragRail ariaLabel="Creators and stations" className="identity-channel-rail">
            {channels.map((channel) => (
              <button
                type="button"
                key={`${channel.type}-${channel.id}`}
                className="identity-channel"
                onClick={() => navigate(channel.route)}
              >
                <div className="identity-channel-avatar">
                  <IdentityImage item={channel} name={channel.name} />
                </div>
                <h3>{channel.name}</h3>
                <p>{channel.type}</p>
              </button>
            ))}
          </HorizontalDragRail>
        ) : (
          <div className="identity-empty-row">
            <FaHeadphones />
            <span>Creators and stations will appear here as Echoo grows.</span>
          </div>
        )}
      </section>
    </div>
  );
};

export default ListenerHome;
