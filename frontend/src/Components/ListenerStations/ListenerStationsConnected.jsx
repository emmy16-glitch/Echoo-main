import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaHeadphones,
  FaPlay,
  FaSearch,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import followService from '../../services/followService';
import '../../styles/echoo-batch3.css';

const STATION_SYNC_INTERVAL_MS = 15000;

const ListenerStationsConnected = () => {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
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
        ? stationResult.value.data.filter(
            (station) => station?.id && station.isPublic !== false
          )
        : [];
      setStations(realStations);

      if (followedResult.status === 'fulfilled') {
        setFollowingIds(
          new Set(
            (followedResult.value?.data || [])
              .filter((station) => station?.id)
              .map((station) => String(station.id))
          )
        );
      }
    } catch (loadError) {
      console.error('Real stations:', loadError);
      if (!silent) setFailed(true);
      setError(loadError?.message || 'Stations could not be loaded.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

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

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return stations;

    return stations.filter(
      (station) =>
        station.name?.toLowerCase().includes(term) ||
        station.category?.toLowerCase().includes(term) ||
        station.description?.toLowerCase().includes(term) ||
        station.ownerName?.toLowerCase().includes(term) ||
        station.tags?.some((tag) => String(tag).toLowerCase().includes(term))
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
            String(item.id) === key ? { ...item, followerCount } : item
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
      // The station profile is the authoritative fallback when a live session ends.
    }

    navigate(`/listen/stations/${station.id}`);
  };

  if (!loading && failed) {
    return (
      <div className="b3-listener-page">
        <div className="echoo-cleanup-state">
          <strong>Stations could not be loaded.</strong>
          <span>{error || 'Echoo could not reach the Station service.'}</span>
          <button type="button" onClick={() => load()}>Try again</button>
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
          <p>Public stations exactly as their creators configured them.</p>
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
            const key = String(station.id);
            const isFollowing = followingIds.has(key);
            const artwork = station.brandCover || station.coverArt || station.logo || null;

            return (
              <article className="b3-station-card" key={station.id}>
                <button
                  type="button"
                  className="b3-station-art"
                  title={`Open ${station.name}`}
                  aria-label={`Open ${station.name}`}
                  onClick={() => navigate(`/listen/stations/${station.id}`)}
                >
                  {artwork ? (
                    <img src={artwork} alt="" />
                  ) : (
                    <FaHeadphones />
                  )}

                  {station.isLive && <span className="b3-live-pill">LIVE</span>}
                </button>

                <div className="b3-station-body">
                  {station.category && (
                    <span className="b3-card-label">{station.category}</span>
                  )}
                  <h2>{station.name}</h2>
                  {station.description && <p>{station.description}</p>}

                  <div className="b3-station-metrics">
                    <span>{Number(station.listenerCount) || 0} listening</span>
                    <span>{Number(station.followerCount) || 0} followers</span>
                  </div>

                  <div className="b3-card-actions">
                    <button
                      type="button"
                      title={`View ${station.name}`}
                      onClick={() => navigate(`/listen/stations/${station.id}`)}
                    >
                      View station
                    </button>

                    {station.isLive && (
                      <button
                        type="button"
                        className="primary"
                        title={`Listen live to ${station.name}`}
                        onClick={() => listenLive(station)}
                      >
                        <FaPlay /> Listen Live
                      </button>
                    )}

                    <button
                      type="button"
                      className={isFollowing ? 'is-following' : ''}
                      disabled={actionId === key}
                      title={isFollowing ? `Unfollow ${station.name}` : `Follow ${station.name}`}
                      onClick={() => toggleFollow(station)}
                    >
                      {actionId === key
                        ? 'Updating...'
                        : isFollowing
                          ? 'Unfollow'
                          : 'Follow'}
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
