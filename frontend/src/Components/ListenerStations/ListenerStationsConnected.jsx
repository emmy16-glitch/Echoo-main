import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaCheck,
  FaHeadphones,
  FaPlay,
  FaSearch,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import followService from '../../services/followService';
import '../../styles/echoo-batch3.css';

const ListenerStationsConnected = () => {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setFailed(false);
      setError('');

      const [stationResult, followedResult] = await Promise.allSettled([
        batch3Service.getStations(),
        followService.getFollowingStations(),
      ]);

      if (stationResult.status !== 'fulfilled') {
        throw stationResult.reason;
      }

      const realStations = Array.isArray(stationResult.value?.data)
        ? stationResult.value.data
        : [];
      setStations(realStations);

      if (followedResult.status === 'fulfilled') {
        setFollowingIds(
          new Set(
            (followedResult.value?.data || []).map((station) => String(station.id))
          )
        );
      }
    } catch (loadError) {
      console.error('Real stations:', loadError);
      setFailed(true);
      setError(loadError?.message || 'Stations could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return stations;

    return stations.filter(
      (station) =>
        station.name?.toLowerCase().includes(term) ||
        station.category?.toLowerCase().includes(term) ||
        station.description?.toLowerCase().includes(term)
    );
  }, [stations, query]);

  const toggleFollow = async (station) => {
    if (!station?.id || actionId) return;

    const key = String(station.id);
    const isFollowing = followingIds.has(key);

    try {
      setActionId(key);
      setError('');

      let response;
      if (isFollowing) {
        response = await followService.unfollowStation(station.id);
      } else {
        response = await followService.followStation(station.id);
      }

      setFollowingIds((current) => {
        const next = new Set(current);
        if (isFollowing) next.delete(key);
        else next.add(key);
        return next;
      });

      const followerCount = Number(
        response?.data?.station?.followerCount ?? response?.data?.followerCount
      );

      if (Number.isFinite(followerCount)) {
        setStations((current) =>
          current.map((item) =>
            item.id === station.id ? { ...item, followerCount } : item
          )
        );
      }
    } catch (followError) {
      setError(followError?.message || 'Could not update station follow status.');
    } finally {
      setActionId('');
    }
  };

  const listenLive = async (station) => {
    try {
      const response = await batch3Service.getLiveBroadcastForStation(station.id);
      if (response?.data?.id) {
        navigate(`/listen/live/${response.data.id}`);
        return;
      }
    } catch {
      // Station profile provides the honest non-live state.
    }

    navigate(`/listen/stations/${station.id}`);
  };

  if (!loading && failed) {
    return (
      <div className="b3-listener-page">
        <div className="echoo-cleanup-state">
          <strong>Stations could not be loaded.</strong>
          <span>{error || 'Echoo could not reach the Station service.'}</span>
          <button type="button" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="b3-listener-page">
      <header className="b3-listener-header">
        <div>
          <span className="b3-kicker">STATIONS</span>
          <h1>Voices with a home.</h1>
          <p>Real public Echoo stations and their current live state.</p>
        </div>

        <div className="b3-search-box">
          <FaSearch />
          <input
            value={query}
            placeholder="Search stations"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </header>

      {error && !failed && <div className="cbf-message error">{error}</div>}

      {loading ? (
        <div className="b3-big-empty">Loading stations...</div>
      ) : (
        <div className="b3-station-grid">
          {visible.map((station) => {
            const isFollowing = followingIds.has(String(station.id));

            return (
              <article className="b3-station-card" key={station.id}>
                <button
                  type="button"
                  className="b3-station-art"
                  onClick={() => navigate(`/listen/stations/${station.id}`)}
                >
                  {station.coverArt ? (
                    <img src={station.coverArt} alt="" />
                  ) : (
                    <FaHeadphones />
                  )}

                  {station.isLive && <span className="b3-live-pill">LIVE</span>}
                </button>

                <div className="b3-station-body">
                  <span className="b3-card-label">{station.category}</span>
                  <h2>{station.name}</h2>
                  <p>{station.description || 'An Echoo station.'}</p>

                  <div className="b3-station-metrics">
                    <span>{station.listenerCount || 0} listening</span>
                    <span>{station.followerCount || 0} followers</span>
                  </div>

                  <div className="b3-card-actions">
                    <button
                      type="button"
                      onClick={() => navigate(`/listen/stations/${station.id}`)}
                    >
                      View station
                    </button>

                    {station.isLive && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => listenLive(station)}
                      >
                        <FaPlay /> Listen Live
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={actionId === String(station.id)}
                      onClick={() => toggleFollow(station)}
                    >
                      {isFollowing ? <><FaCheck /> Following</> : 'Follow'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="b3-big-empty">
          {stations.length === 0
            ? 'No public stations yet.'
            : 'No stations match your search.'}
        </div>
      )}
    </div>
  );
};

export default ListenerStationsConnected;
