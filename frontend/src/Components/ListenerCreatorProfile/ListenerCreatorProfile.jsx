import { useCallback, useEffect, useState } from 'react';
import {
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import {
  FaArrowLeft,
  FaBroadcastTower,
  FaCheck,
  FaHeadphones,
  FaPause,
  FaPlay,
} from 'react-icons/fa';

import profileService from '../../services/profileService';
import realtimeService from '../../services/realtimeService';
import followService from '../../services/followService';
import './ListenerCreatorProfile.css';

const PROFILE_SYNC_INTERVAL_MS = 15000;

const ListenerCreatorProfile = () => {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const player = useOutletContext();

  const [profile, setProfile] = useState(null);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) setError('');

      const response = await profileService.getProfile(creatorId);
      if (!response?.data) return;

      setProfile(response.data);
      setFollowerCount(Number(response.data.stats?.followers) || 0);

      try {
        const status = await followService.getCreatorStatus(response.data.id);
        setFollowing(Boolean(status?.isFollowing));
      } catch {
        // Public profile still renders if relationship status cannot load.
      }
    } catch (loadError) {
      if (!silent) {
        setError(loadError?.message || 'Could not load this creator.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    load();

    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, PROFILE_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);

    return () => {
      window.clearInterval(interval);
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
        // The existing 15-second polling and focus refresh remain the fallback.
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [load]);

  const toggleFollow = async () => {
    if (!profile?.id || followBusy) return;

    try {
      setFollowBusy(true);
      setError('');

      if (following) {
        await followService.unfollowCreator(profile.id);
        setFollowing(false);
        setFollowerCount((value) => Math.max(0, value - 1));
      } else {
        await followService.followCreator(profile.id);
        setFollowing(true);
        setFollowerCount((value) => value + 1);
      }
    } catch (followError) {
      setError(followError?.message || 'Could not update follow status.');
    } finally {
      setFollowBusy(false);
    }
  };

  const playTrack = (track) => {
    if (!player?.playTrack) return;

    const currentId = player.currentTrack?.id;
    if (currentId && currentId === track.id) {
      player.togglePlay?.();
      return;
    }

    player.playTrack(
      {
        ...track,
        subtitle: profile.displayName,
      },
      profile.content
    );
  };

  if (loading) {
    return <div className="lcp-page"><div className="lcp-empty">Loading creator...</div></div>;
  }

  if (!profile) {
    return (
      <div className="lcp-page">
        <button type="button" className="lcp-back" onClick={() => navigate('/listen')}>
          <FaArrowLeft /> Home
        </button>
        <div className="lcp-empty">
          <h2>Creator unavailable</h2>
          <p>{error || 'This creator could not be loaded.'}</p>
        </div>
      </div>
    );
  }

  const name =
    profile.displayName ||
    profile.creatorProfile?.artistName ||
    profile.creatorProfile?.organizationName ||
    profile.username;
  const live = profile.liveBroadcast;

  return (
    <div className="lcp-page">
      <button type="button" className="lcp-back" onClick={() => navigate(-1)}>
        <FaArrowLeft /> Back
      </button>

      {error && <div className="lcp-message error">{error}</div>}

      <section className="lcp-hero">
        <div className="lcp-avatar">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" />
          ) : (
            <span>{String(name || 'E').charAt(0).toUpperCase()}</span>
          )}
          {live?.id && <i>LIVE</i>}
        </div>

        <div className="lcp-copy">
          <span className="lcp-kicker">
            {profile.creatorProfile?.category || 'ECHOO CREATOR'}
          </span>
          <h1>{name}</h1>
          <p>{profile.bio || 'Creator on Echoo.'}</p>

          <div className="lcp-stats">
            <span><strong>{followerCount}</strong> followers</span>
            <span><strong>{profile.stats?.totalTracks || 0}</strong> tracks</span>
            <span><strong>{profile.stats?.totalPlays || 0}</strong> plays</span>
          </div>

          <div className="lcp-actions">
            <button
              type="button"
              className={following ? 'following' : 'primary'}
              disabled={followBusy}
              onClick={toggleFollow}
            >
              {following ? <><FaCheck /> Following</> : 'Follow creator'}
            </button>

            {live?.id && (
              <button
                type="button"
                className="primary"
                onClick={() => navigate(`/listen/live/${live.id}`)}
              >
                <FaBroadcastTower /> Listen Live
              </button>
            )}
          </div>
        </div>
      </section>

      {profile.stations.length > 0 && (
        <section className="lcp-section">
          <div className="lcp-heading">
            <div>
              <h2>Stations</h2>
              <p>Audio stations owned by {name}.</p>
            </div>
          </div>

          <div className="lcp-station-grid">
            {profile.stations.map((station) => (
              <button
                type="button"
                key={station.id}
                className="lcp-station"
                onClick={() => navigate(`/listen/stations/${station.id}`)}
              >
                <div>
                  {station.brandCover || station.coverArt ? (
                    <img src={station.brandCover || station.coverArt} alt="" />
                  ) : (
                    <FaHeadphones />
                  )}
                </div>
                <strong>{station.name}</strong>
                <span>{station.category || 'Station'}</span>
                {station.isLive && <small>LIVE</small>}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="lcp-section">
        <div className="lcp-heading">
          <div>
            <h2>Audio</h2>
            <p>Public audio published by {name}.</p>
          </div>
        </div>

        {profile.content.length === 0 ? (
          <div className="lcp-empty">
            <FaHeadphones />
            <span>No public audio has been published yet.</span>
          </div>
        ) : (
          <div className="lcp-track-list">
            {profile.content.map((track) => {
              const active = player?.currentTrack?.id === track.id;
              const playing = active && player?.isPlaying;

              return (
                <article key={track.id} className="lcp-track">
                  <div className="lcp-track-art">
                    {track.coverArt ? <img src={track.coverArt} alt="" /> : <FaHeadphones />}
                  </div>
                  <div>
                    <strong>{track.title}</strong>
                    <span>{Number(track.playCount || 0).toLocaleString()} plays</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => playTrack(track)}
                    disabled={!track.fileUrl}
                    aria-label={`${playing ? 'Pause' : 'Play'} ${track.title || 'audio'}`}
                  >
                    {playing ? <FaPause /> : <FaPlay />}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default ListenerCreatorProfile;