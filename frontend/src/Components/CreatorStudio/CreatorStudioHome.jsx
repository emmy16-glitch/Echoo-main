import { useEffect, useMemo, useState } from 'react';
import {
  FaArrowRight,
  FaBroadcastTower,
  FaCalendarAlt,
  FaCloudUploadAlt,
  FaHeadphones,
  FaMicrophone,
  FaPlay,
  FaUsers,
} from 'react-icons/fa';

import studioService from '../../services/studioService';
import EchoAvatar from '../EchooSystem/EchoAvatar';
import EchoSignal from '../EchooSystem/EchoSignal';
import EchoAmbient from '../EchooSystem/EchoAmbient';
import './CreatorStudioHome.css';

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US').format(Number(value) || 0);

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const CreatorStudioHome = ({
  studioName = 'Creator',
  studioType = 'Creator',
  profileImage = null,
  followers = 0,
  onUpload,
  onNavigate,
}) => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await studioService.getDashboard();
        if (active) setDashboard(response?.data || null);
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not load your studio overview.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, []);

  const stats = dashboard?.stats || {};
  const recentContent = Array.isArray(dashboard?.recentContent)
    ? dashboard.recentContent
    : [];
  const upcomingSchedule = Array.isArray(dashboard?.upcomingSchedule)
    ? dashboard.upcomingSchedule
    : [];
  const activeBroadcasts = Array.isArray(dashboard?.activeBroadcasts)
    ? dashboard.activeBroadcasts
    : [];
  const nextBroadcast = upcomingSchedule[0] || null;
  const isLive = activeBroadcasts.some((item) => item.status === 'live');

  const metrics = useMemo(
    () => [
      {
        label: 'Live listeners',
        value: formatNumber(stats.listeners),
        icon: <FaHeadphones />,
      },
      {
        label: 'Followers',
        value: formatNumber(stats.followers ?? followers),
        icon: <FaUsers />,
      },
      {
        label: 'Total plays',
        value: formatNumber(stats.plays),
        icon: <FaPlay />,
      },
      {
        label: 'Published audio',
        value: formatNumber(dashboard?.totalTracks),
        icon: <FaCloudUploadAlt />,
      },
    ],
    [dashboard?.totalTracks, followers, stats.followers, stats.listeners, stats.plays]
  );

  return (
    <div className="echoo-creator-home">
      <section className="echoo-creator-presence">
        <EchoAmbient density="low" className="echoo-creator-home-ambient" />

        <div className="echoo-creator-presence-copy">
          <span className="echoo-creator-kicker">CREATOR STUDIO</span>
          <h1>{isLive ? 'You are live.' : `Ready when you are, ${studioName}.`}</h1>
          <p>
            Start a live broadcast, schedule one for later, or manage the audio you have published.
          </p>

          <div className="echoo-creator-primary-actions">
            <button type="button" className="primary" onClick={() => onNavigate('Live')}>
              <FaMicrophone /> {isLive ? 'Open Live Studio' : 'Go live'}
            </button>
            <button type="button" onClick={() => onNavigate('Schedule')}>
              <FaCalendarAlt /> Schedule
            </button>
          </div>
        </div>

        <div className="echoo-creator-identity">
          <div className="echoo-creator-signal-wrap">
            <EchoSignal
              size="xl"
              state={isLive ? 'live' : 'idle'}
              activeNodes={isLive ? 3 : 0}
            >
              <EchoAvatar
                image={profileImage}
                name={studioName}
                size="lg"
                state={isLive ? 'speaking' : 'idle'}
              />
            </EchoSignal>
          </div>
          <strong>{studioName}</strong>
          <span>{studioType}</span>
          <small>{isLive ? 'Live now' : 'Not live'}</small>
        </div>
      </section>

      {nextBroadcast && (
        <section className="echoo-creator-recent-section">
          <div className="echoo-creator-section-title">
            <div>
              <h2>Up next</h2>
              <p>Your next scheduled broadcast.</p>
            </div>
            <button type="button" onClick={() => onNavigate('Schedule')}>
              View schedule <FaArrowRight />
            </button>
          </div>

          <div className="echoo-creator-actions-list">
            <button type="button" onClick={() => onNavigate('Schedule')}>
              <span className="echoo-creator-action-icon"><FaCalendarAlt /></span>
              <span className="echoo-creator-action-copy">
                <strong>{nextBroadcast.title || 'Scheduled broadcast'}</strong>
                <small>
                  {nextBroadcast.station?.name || nextBroadcast.stationName || 'Station'} ·{' '}
                  {formatDateTime(nextBroadcast.startTime)}
                </small>
              </span>
              <FaArrowRight />
            </button>
          </div>
        </section>
      )}

      <section className="echoo-creator-work-section">
        <div className="echoo-creator-section-title">
          <div>
            <h2>Start</h2>
            <p>Choose what you want to do.</p>
          </div>
        </div>

        <div className="echoo-creator-actions-list">
          <button type="button" onClick={() => onNavigate('Live')}>
            <span className="echoo-creator-action-icon"><FaMicrophone /></span>
            <span className="echoo-creator-action-copy">
              <strong>Go live</strong>
              <small>Start a live audio broadcast.</small>
            </span>
            <FaArrowRight />
          </button>

          <button type="button" onClick={() => onNavigate('Schedule')}>
            <span className="echoo-creator-action-icon"><FaCalendarAlt /></span>
            <span className="echoo-creator-action-copy">
              <strong>Schedule a broadcast</strong>
              <small>Choose a station, date and time.</small>
            </span>
            <FaArrowRight />
          </button>

          <button type="button" onClick={() => onNavigate('Stations')}>
            <span className="echoo-creator-action-icon"><FaBroadcastTower /></span>
            <span className="echoo-creator-action-copy">
              <strong>Stations</strong>
              <small>Create or manage the home for your broadcasts.</small>
            </span>
            <FaArrowRight />
          </button>

          <button type="button" onClick={onUpload}>
            <span className="echoo-creator-action-icon"><FaCloudUploadAlt /></span>
            <span className="echoo-creator-action-copy">
              <strong>Upload audio</strong>
              <small>Add a recorded audio item.</small>
            </span>
            <FaArrowRight />
          </button>
        </div>
      </section>

      <section className="echoo-creator-metrics-section">
        <div className="echoo-creator-section-title">
          <div>
            <h2>Overview</h2>
            <p>Your current creator activity.</p>
          </div>
          <button type="button" onClick={() => onNavigate('Analytics')}>
            View analytics <FaArrowRight />
          </button>
        </div>

        {loading ? (
          <div className="echoo-creator-metric-loading">
            <span /><span /><span /><span />
          </div>
        ) : (
          <div className="echoo-creator-metrics">
            {metrics.map((metric) => (
              <article key={metric.label}>
                <div className="echoo-creator-metric-top">
                  <span>{metric.icon}</span>
                  <small>{metric.label}</small>
                </div>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
        )}

        {error && <p className="echoo-creator-data-error">{error}</p>}
      </section>

      <section className="echoo-creator-recent-section">
        <div className="echoo-creator-section-title">
          <div>
            <h2>Recent audio</h2>
            <p>Your latest recordings.</p>
          </div>
          <button type="button" onClick={() => onNavigate('Audio')}>
            View audio <FaArrowRight />
          </button>
        </div>

        {loading ? (
          <div className="echoo-creator-recent-loading"><span /><span /><span /></div>
        ) : recentContent.length > 0 ? (
          <div className="echoo-creator-recent-list">
            {recentContent.map((track, index) => (
              <article key={track.id || index}>
                <div className="echoo-creator-track-art">
                  {track.coverArt ? (
                    <img src={track.coverArt} alt="" draggable="false" />
                  ) : (
                    <span>{String(track.title || 'E').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="echoo-creator-track-copy">
                  <strong>{track.title || 'Untitled audio'}</strong>
                  <span>{track.genre || 'Audio'}</span>
                </div>
                <div className="echoo-creator-track-stat"><FaPlay /> {formatNumber(track.plays)}</div>
                <span className={`echoo-creator-public-state ${track.isPublic ? 'public' : 'private'}`}>
                  {track.isPublic ? 'Public' : 'Private'}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="echoo-creator-empty-content">
            <EchoSignal size="md" state="idle" activeNodes={0} />
            <div>
              <h3>No audio yet</h3>
              <p>Your uploaded recordings will appear here.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default CreatorStudioHome;
