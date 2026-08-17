import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBroadcastTower,
  FaCheck,
  FaHeadphones,
  FaHeart,
} from 'react-icons/fa';

import followService from '../../services/followService';
import batch3Service from '../../services/batch3Service';
import HorizontalDragRail from '../FigmaUI/HorizontalDragRail';
import './ListenerFollowing.css';

const compactNumber = (value) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);

const getImage = (item) =>
  item?.avatar ||
  item?.profileImage ||
  item?.artwork ||
  item?.image ||
  item?.coverArt ||
  null;

const IdentityImage = ({ item, station = false }) => {
  const [failed, setFailed] = useState(false);
  const image = getImage(item);

  if (image && !failed) {
    return (
      <img
        src={image}
        alt=""
        draggable="false"
        onError={() => setFailed(true)}
      />
    );
  }

  if (station) {
    return (
      <div className="figma-following-image-fallback station">
        <FaHeadphones />
      </div>
    );
  }

  const initials = String(item?.name || item?.displayName || 'EC')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

  return <div className="figma-following-image-fallback">{initials}</div>;
};

const ListenerFollowing = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('All');
  const [creators, setCreators] = useState([]);
  const [stations, setStations] = useState([]);
  const [liveBroadcasts, setLiveBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const [creatorResult, stationResult, discovery] = await Promise.all([
          followService.getFollowingCreators(),
          followService.getFollowingStations(),
          batch3Service.getDiscovery(),
        ]);

        if (!active) return;

        setCreators(Array.isArray(creatorResult?.data) ? creatorResult.data : []);
        setStations(Array.isArray(stationResult?.data) ? stationResult.data : []);
        setLiveBroadcasts(Array.isArray(discovery?.live) ? discovery.live : []);
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Could not load the people and stations you follow.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const liveByCreator = useMemo(() => {
    const map = new Map();
    liveBroadcasts.forEach((broadcast) => {
      if (broadcast.creatorId) {
        map.set(String(broadcast.creatorId), broadcast);
      }
    });
    return map;
  }, [liveBroadcasts]);

  const liveByStation = useMemo(() => {
    const map = new Map();
    liveBroadcasts.forEach((broadcast) => {
      if (broadcast.stationId) {
        map.set(String(broadcast.stationId), broadcast);
      }
    });
    return map;
  }, [liveBroadcasts]);

  const liveCount = useMemo(() => {
    const ids = new Set();

    creators.forEach((creator) => {
      const live = liveByCreator.get(String(creator.id));
      if (live?.id) ids.add(String(live.id));
    });

    stations.forEach((station) => {
      const live = liveByStation.get(String(station.id));
      if (live?.id) ids.add(String(live.id));
    });

    return ids.size;
  }, [creators, stations, liveByCreator, liveByStation]);

  const unfollowCreator = async (event, creator) => {
    event.stopPropagation();
    const key = `creator:${creator.id}`;

    try {
      setActionKey(key);
      setError('');
      await followService.unfollowCreator(creator.id);
      setCreators((current) => current.filter((item) => item.id !== creator.id));
    } catch (actionError) {
      setError(actionError?.message || 'Could not unfollow this creator.');
    } finally {
      setActionKey('');
    }
  };

  const unfollowStation = async (event, station) => {
    event.stopPropagation();
    const key = `station:${station.id}`;

    try {
      setActionKey(key);
      setError('');
      await followService.unfollowStation(station.id);
      setStations((current) => current.filter((item) => item.id !== station.id));
    } catch (actionError) {
      setError(actionError?.message || 'Could not unfollow this station.');
    } finally {
      setActionKey('');
    }
  };

  const empty = creators.length === 0 && stations.length === 0;

  return (
    <div className="figma-following-page">
      <button
        type="button"
        className="figma-following-back"
        onClick={() => navigate('/listen/library')}
      >
        <FaArrowLeft /> Library
      </button>

      <header className="figma-following-header">
        <div>
          <h1>Following</h1>
          <p>Creators and stations you chose to keep up with.</p>
        </div>

        <div className="figma-following-summary">
          <article>
            <strong>{creators.length + stations.length}</strong>
            <span>Following</span>
          </article>
          <article className="live">
            <strong>{liveCount}</strong>
            <span>Live now</span>
          </article>
        </div>
      </header>

      <div className="figma-following-tabs">
        {['All', 'Creators', 'Stations'].map((item) => (
          <button
            type="button"
            key={item}
            className={tab === item ? 'active' : ''}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {error && <div className="cbf-message error">{error}</div>}

      {loading ? (
        <div className="figma-following-empty">
          <h2>Loading your Following list...</h2>
        </div>
      ) : empty ? (
        <div className="figma-following-empty">
          <div><FaHeart /></div>
          <h2>You're not following anyone yet</h2>
          <p>Follow creators from their profiles or follow stations you want to hear again.</p>
          <div>
            <button type="button" onClick={() => navigate('/listen/live')}>
              Discover Live
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => navigate('/listen/stations')}
            >
              Browse Stations
            </button>
          </div>
        </div>
      ) : (
        <>
          {(tab === 'All' || tab === 'Creators') && creators.length > 0 && (
            <section className="figma-following-section">
              <div className="figma-following-section-heading">
                <div>
                  <h2>Creators</h2>
                  <p>Real Echoo creator relationships.</p>
                </div>
                <span>{creators.length}</span>
              </div>

              <HorizontalDragRail ariaLabel="Creators you follow" className="figma-following-rail">
                {creators.map((creator, index) => {
                  const live = liveByCreator.get(String(creator.id));
                  return (
                    <article key={creator.id} className="figma-following-card">
                      <button
                        type="button"
                        className="figma-following-card-main"
                        onClick={() => navigate(`/listen/creator/${creator.id}`)}
                      >
                        <div className={`figma-following-avatar variant-${(index % 4) + 1}`}>
                          <IdentityImage item={creator} />
                          {live && <span>LIVE</span>}
                        </div>
                        <h3>{creator.name}</h3>
                        <p>{creator.category}</p>
                        <small>{creator.verified ? 'Verified creator' : 'Echoo creator'}</small>
                      </button>

                      {live && (
                        <button
                          type="button"
                          className="figma-following-live-button"
                          onClick={() => navigate(`/listen/live/${live.id}`)}
                        >
                          <FaBroadcastTower /> Live now
                        </button>
                      )}

                      <button
                        type="button"
                        className="figma-following-unfollow"
                        disabled={actionKey === `creator:${creator.id}`}
                        onClick={(event) => unfollowCreator(event, creator)}
                      >
                        <FaCheck />
                        {actionKey === `creator:${creator.id}` ? 'Updating...' : 'Following'}
                      </button>
                    </article>
                  );
                })}
              </HorizontalDragRail>
            </section>
          )}

          {(tab === 'All' || tab === 'Stations') && stations.length > 0 && (
            <section className="figma-following-section">
              <div className="figma-following-section-heading">
                <div>
                  <h2>Stations</h2>
                  <p>Stations you chose to hear from again.</p>
                </div>
                <span>{stations.length}</span>
              </div>

              <HorizontalDragRail ariaLabel="Stations you follow" className="figma-following-rail">
                {stations.map((station, index) => {
                  const live = liveByStation.get(String(station.id));
                  return (
                    <article key={station.id} className="figma-following-card">
                      <button
                        type="button"
                        className="figma-following-card-main"
                        onClick={() => navigate(`/listen/stations/${station.id}`)}
                      >
                        <div className={`figma-following-avatar station variant-${(index % 4) + 1}`}>
                          <IdentityImage item={station} station />
                          {live && <span>LIVE</span>}
                        </div>
                        <h3>{station.name}</h3>
                        <p>{station.category}</p>
                        <small>{compactNumber(station.followerCount)} followers</small>
                      </button>

                      {live && (
                        <button
                          type="button"
                          className="figma-following-live-button"
                          onClick={() => navigate(`/listen/live/${live.id}`)}
                        >
                          <FaBroadcastTower /> Live now
                        </button>
                      )}

                      <button
                        type="button"
                        className="figma-following-unfollow"
                        disabled={actionKey === `station:${station.id}`}
                        onClick={(event) => unfollowStation(event, station)}
                      >
                        <FaCheck />
                        {actionKey === `station:${station.id}` ? 'Updating...' : 'Following'}
                      </button>
                    </article>
                  );
                })}
              </HorizontalDragRail>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default ListenerFollowing;
