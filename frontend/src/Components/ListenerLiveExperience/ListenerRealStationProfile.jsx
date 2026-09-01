import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBroadcastTower,
  FaHeadphones,
  FaPlay,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import followService from '../../services/followService';
import collectionService from '../../services/collectionService';
import { getCreatorProfilePath } from '../../services/profileIdentifier';
import '../../styles/echoo-batch3.css';

const STATION_SYNC_INTERVAL_MS = 15000;

const ListenerRealStationProfile = () => {
  const { stationId } = useParams();
  const navigate = useNavigate();

  const [station, setStation] = useState(null);
  const [live, setLive] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [collections, setCollections] = useState([]);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError('');

      const stationResult = await batch3Service.getStation(stationId);
      const nextStation = stationResult?.data || null;

      if (!nextStation?.id || nextStation.isPublic === false) {
        setStation(null);
        setLive(null);
        setUpcoming([]);
        setCollections([]);
        return;
      }

      setStation(nextStation);
      setFollowerCount(Number(nextStation.followerCount) || 0);
      const canonicalStationId = nextStation.id;

      const [liveResult, upcomingResult, followResult, collectionResult] = await Promise.allSettled([
        batch3Service.getLiveBroadcastForStation(canonicalStationId),
        batch3Service.getUpcomingForStation(canonicalStationId),
        followService.getStationStatus(canonicalStationId),
        collectionService.getForStation(canonicalStationId),
      ]);

      if (liveResult.status === 'fulfilled') {
        setLive(liveResult.value?.data || null);
      } else {
        setLive(null);
      }

      if (upcomingResult.status === 'fulfilled') {
        setUpcoming(
          Array.isArray(upcomingResult.value?.data)
            ? upcomingResult.value.data
            : []
        );
      } else {
        setUpcoming([]);
      }

      if (followResult.status === 'fulfilled') {
        setFollowing(Boolean(followResult.value?.isFollowing));
        const statusCount = Number(followResult.value?.followerCount);
        setFollowerCount(
          Number.isFinite(statusCount)
            ? statusCount
            : Number(nextStation.followerCount) || 0
        );
      }
      setCollections(collectionResult.status === 'fulfilled' && Array.isArray(collectionResult.value?.data)
        ? collectionResult.value.data
        : []);
    } catch (loadError) {
      if (!silent) {
        setStation(null);
      }
      setError(loadError?.message || 'This station could not be loaded from Echoo.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    load();

    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, STATION_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const toggleFollow = async () => {
    if (followBusy || !station?.id) return;

    try {
      setFollowBusy(true);
      setError('');

      const wasFollowing = following;
      const response = wasFollowing
        ? await followService.unfollowStation(station.id)
        : await followService.followStation(station.id);

      setFollowing(!wasFollowing);

      const nextCount = Number(
        response?.data?.station?.followerCount ?? response?.data?.followerCount
      );

      if (Number.isFinite(nextCount)) {
        setFollowerCount(nextCount);
      } else {
        setFollowerCount((current) =>
          Math.max(0, current + (wasFollowing ? -1 : 1))
        );
      }
    } catch (followError) {
      setError(followError?.message || 'Could not update station follow status.');
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="b3-listener-page">
        <div className="b3-big-empty">Loading station...</div>
      </div>
    );
  }

  if (!station) {
    return (
      <div className="b3-listener-page">
        <button
          type="button"
          className="b3-back"
          title="Back to stations"
          onClick={() => navigate('/listen/stations')}
        >
          <FaArrowLeft /> Stations
        </button>
        <div className="echoo-cleanup-state">
          <strong>Station unavailable.</strong>
          <span>{error || 'This station is not available publicly.'}</span>
        </div>
      </div>
    );
  }

  const artwork = station.brandCover || station.coverArt || station.logo || null;
  const creatorId = station.ownerId || station.creatorId || station.owner?.id || null;
  const creatorName = station.ownerName || station.creatorName || station.owner?.displayName || '';
  const isActuallyLive = Boolean(live?.id);

  return (
    <div className="b3-listener-page">
      <button
        type="button"
        className="b3-back"
        title="Back to stations"
        onClick={() => navigate('/listen/stations')}
      >
        <FaArrowLeft /> Stations
      </button>

      {error && <div className="cbf-message error">{error}</div>}

      <section className="b3-station-profile">
        <div className="b3-profile-art">
          {artwork ? <img src={artwork} alt="" /> : <FaHeadphones />}
          {isActuallyLive && <span className="b3-live-pill">LIVE</span>}
        </div>

        <div className="b3-profile-copy">
          {station.category && <span className="b3-kicker">{station.category}</span>}
          <h1>{station.name}</h1>
          {station.description && <p>{station.description}</p>}
          {creatorName && <small>By {creatorName}</small>}

          <div className="b3-profile-metrics">
            <span><strong>{followerCount}</strong> followers</span>
            <span><strong>{Number(station.listenerCount) || 0}</strong> listening</span>
          </div>

          <div className="b3-profile-actions">
            <button
              type="button"
              onClick={toggleFollow}
              disabled={followBusy}
              title={following ? `Unfollow ${station.name}` : `Follow ${station.name}`}
            >
              {followBusy ? 'Updating...' : following ? 'Unfollow' : 'Follow station'}
            </button>

            {creatorId && (
              <button
                type="button"
                title={creatorName ? `View ${creatorName}` : 'View creator'}
                onClick={() => {
                  const profilePath = getCreatorProfilePath(creatorId);
                  if (profilePath) navigate(profilePath);
                }}
              >
                View creator
              </button>
            )}

            {live?.id && (
              <button
                type="button"
                className="primary"
                title={`Listen live to ${station.name}`}
                onClick={() => navigate(`/listen/live/${live.id}`)}
              >
                <FaPlay /> Listen Live
              </button>
            )}
          </div>
        </div>
      </section>

      {live?.id && (
        <section className="b3-section">
          <div className="b3-section-title"><h2>Live now</h2></div>
          <article className="b3-profile-live">
            <FaBroadcastTower />
            <div>
              <strong>{live.title}</strong>
              <span>{Number(live.listenerCount) || 0} listening</span>
            </div>
            <button
              type="button"
              title={`Join ${live.title}`}
              onClick={() => navigate(`/listen/live/${live.id}`)}
            >
              Join
            </button>
          </article>
        </section>
      )}

      {collections.length > 0 && (
        <section className="b3-section">
          <div className="b3-section-title"><h2>Collections</h2></div>
          <div className="b3-upcoming-list">
            {collections.slice(0, 4).map((collection) => (
              <article key={collection.id}>
                <div><strong>{collection.title}</strong><span>{collection.broadcastCount} {collection.broadcastCount === 1 ? 'recording' : 'recordings'}</span></div>
                <button type="button" onClick={() => navigate(`/listen/collections/${collection.id}`)}>View</button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="b3-section">
        <div className="b3-section-title"><h2>Upcoming broadcasts</h2></div>

        {upcoming.length === 0 ? (
          <div className="b3-small-empty">Nothing scheduled yet.</div>
        ) : (
          <div className="b3-upcoming-list">
            {upcoming.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>Scheduled</span>
                </div>
                <time>{new Date(item.startTime).toLocaleString()}</time>
                <button
                  type="button"
                  title={`View ${item.title}`}
                  onClick={() => navigate(`/listen/live/${item.id}`)}
                >
                  View
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ListenerRealStationProfile;
