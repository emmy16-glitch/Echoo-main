import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaChevronRight,
  FaMicrophone,
} from 'react-icons/fa';

import EchoWave from '../EchooSystem/EchoWave';
import { useCreatorStudioState } from './CreatorStudioState';
import './CreatorStudioV2Home.css';

const broadcastId = (broadcast) => String(broadcast?.id || broadcast?._id || '');

const formatStart = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function CreatorStudioV2Home({ onNavigate }) {
  const {
    activeBroadcast,
    isLive,
    loading,
    ownedStationCount,
    upcomingBroadcasts,
  } = useCreatorStudioState();

  const nextBroadcast = [...upcomingBroadcasts]
    .sort((left, right) => new Date(left?.startTime || left?.startAt || 0) - new Date(right?.startTime || right?.startAt || 0))[0] || null;

  const openLiveFlow = () => {
    onNavigate?.(ownedStationCount ? 'Live' : 'Stations');
  };

  const openSchedule = () => onNavigate?.('Schedule');

  const prepareBroadcast = () => {
    const id = broadcastId(nextBroadcast);
    if (id) sessionStorage.setItem('echooPreparedBroadcastId', id);
    onNavigate?.('Broadcast');
  };

  const title = isLive ? 'You’re live' : 'You’re off-air';
  const supportingCopy = isLive
    ? (activeBroadcast?.title || 'Your broadcast is live now.')
    : 'Go live now or schedule for later.';

  return (
    <section className={`creator-v2-studio ${isLive ? 'is-live' : 'is-off-air'}`} aria-labelledby="creator-v2-studio-title">
      <header className="creator-v2-heading">
        <h1 id="creator-v2-studio-title">Studio</h1>
        <p>Your space to broadcast, connect and grow.</p>
      </header>

      <section className="creator-v2-broadcast-state" aria-live="polite" aria-busy={loading}>
        <div className="creator-v2-signal" aria-hidden="true">
          <EchoWave state={isLive ? 'live' : 'idle'} className="creator-v2-signal-wave creator-v2-signal-wave-left" />
          <div className="creator-v2-core-rings">
            <span className="creator-v2-ring creator-v2-ring-outer" />
            <span className="creator-v2-ring creator-v2-ring-middle" />
            <span className="creator-v2-core">
              <FaBroadcastTower />
            </span>
          </div>
          <EchoWave state={isLive ? 'live' : 'idle'} className="creator-v2-signal-wave creator-v2-signal-wave-right" />
        </div>

        <div className="creator-v2-status-copy">
          {isLive && <span className="creator-v2-live-label">Live</span>}
          <h2>{title}</h2>
          <p>{supportingCopy}</p>
          <div className="creator-v2-actions">
            {isLive ? (
              <button type="button" className="creator-v2-primary" onClick={() => onNavigate?.('Broadcast')}>
                <FaMicrophone /> Open live room
              </button>
            ) : (
              <button type="button" className="creator-v2-primary" onClick={openLiveFlow}>
                <FaBroadcastTower /> Go Live
              </button>
            )}
            {!isLive && (
              <button type="button" className="creator-v2-secondary" onClick={openSchedule}>
                <FaCalendarAlt /> Schedule
              </button>
            )}
          </div>
          {!isLive && !ownedStationCount && (
            <p className="creator-v2-context">Create a station first, then you can go live.</p>
          )}
        </div>
      </section>

      <section className="creator-v2-upcoming" aria-labelledby="creator-v2-upcoming-title">
        <header>
          <h2 id="creator-v2-upcoming-title">Upcoming</h2>
          <button type="button" onClick={() => onNavigate?.('Broadcast')}>
            View all <FaChevronRight aria-hidden="true" />
          </button>
        </header>
        {nextBroadcast ? (
          <div className="creator-v2-upcoming-item">
            <div>
              <strong>{nextBroadcast.title || 'Scheduled broadcast'}</strong>
              {formatStart(nextBroadcast.startTime || nextBroadcast.startAt) && (
                <span>{formatStart(nextBroadcast.startTime || nextBroadcast.startAt)}</span>
              )}
            </div>
            <button type="button" onClick={prepareBroadcast}>Prepare</button>
          </div>
        ) : (
          <div className="creator-v2-upcoming-empty">
            <strong>No upcoming broadcasts</strong>
            <span>Schedule your next broadcast.</span>
          </div>
        )}
      </section>
    </section>
  );
}
