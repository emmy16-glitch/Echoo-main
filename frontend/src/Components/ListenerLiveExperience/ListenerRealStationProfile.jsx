import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBroadcastTower,
  FaCheck,
  FaHeadphones,
  FaPlay,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import followService from '../../services/followService';
import '../../styles/echoo-batch3.css';

const ListenerRealStationProfile = () => {
  const { stationId } = useParams();
  const navigate = useNavigate();

  const [station, setStation] = useState(null);
  const [live, setLive] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const stationResult = await batch3Service.getStation(stationId);
        if (!active || !stationResult?.data) return;

        setStation(stationResult.data);
        setFollowerCount(Number(stationResult.data.followerCount) || 0);

        const [liveResult, upcomingResult, followResult] = await Promise.allSettled([
          batch3Service.getLiveBroadcastForStation(stationId),
          batch3Service.getUpcomingForStation(stationId),
          followService.getStationStatus(stationId),
        ]);

        if (!active) return;

        if (liveResult.status === 'fulfilled') {
          setLive(liveResult.value?.data || null);
        }

        if (upcomingResult.status === 'fulfilled') {
          setUpcoming(
            Array.isArray(upcomingResult.value?.data)
              ? upcomingResult.value.data
              : []
          );
        }

        if (followResult.status === 'fulfilled') {
          setFollowing(Boolean(followResult.value?.isFollowing));
          setFollowerCount(
            Number(followResult.value?.followerCount) ||
              Number(stationResult.data.followerCount) ||
              0
          );
        }
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'This station could not be loaded from Echoo.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [stationId]);

  const toggleFollow = async () => {
    if (followBusy) return;

    try {
      setFollowBusy(true);
      setError('');

      if (following) {
        const response = await followService.unfollowStation(stationId);
        setFollowing(false);
        setFollowerCount(Number(response?.data?.followerCount) || 0);
      } else {
        const response = await followService.followStation(stationId);
        setFollowing(true);
        setFollowerCount(
          Number(response?.data?.station?.followerCount) || followerCount + 1
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
        <button type="button" className="b3-back" onClick={() => navigate('/listen/stations')}>
          <FaArrowLeft /> Stations
        </button>
        <div className="echoo-cleanup-state">
          <strong>Station unavailable.</strong>
          <span>{error || 'This station could not be loaded from Echoo.'}</span>
        </div>
      </div>
    );
  }

  const artwork = station.coverArt || null;
  const creatorId = station.ownerId || station.creatorId || station.owner?.id || null;

  return (
    <div className="b3-listener-page">
      <button type="button" className="b3-back" onClick={() => navigate('/listen/stations')}>
        <FaArrowLeft /> Stations
      </button>

      {error && <div className="cbf-message error">{error}</div>}

      <section className="b3-station-profile">
        <div className="b3-profile-art">
          {artwork ? <img src={artwork} alt="" /> : <FaHeadphones />}
          {station.isLive && <span className="b3-live-pill">LIVE</span>}
        </div>

        <div className="b3-profile-copy">
          <span className="b3-kicker">{station.category}</span>
          <h1>{station.name}</h1>
          <p>{station.description || 'An Echoo station.'}</p>

          <div className="b3-profile-metrics">
            <span><strong>{followerCount}</strong> followers</span>
            <span><strong>{station.listenerCount || 0}</strong> listening</span>
          </div>

          <div className="b3-profile-actions">
            <button type="button" onClick={toggleFollow} disabled={followBusy}>
              {following ? <><FaCheck /> Following</> : 'Follow station'}
            </button>

            {creatorId && (
              <button type="button" onClick={() => navigate(`/listen/creator/${creatorId}`)}>
                View creator
              </button>
            )}

            {live?.id && (
              <button
                type="button"
                className="primary"
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
              <span>{live.listenerCount || 0} listening</span>
            </div>
            <button type="button" onClick={() => navigate(`/listen/live/${live.id}`)}>
              Join
            </button>
          </article>
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
                <button type="button" onClick={() => navigate(`/listen/live/${item.id}`)}>
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
