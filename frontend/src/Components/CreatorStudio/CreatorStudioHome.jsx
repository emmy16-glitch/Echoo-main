import { useEffect, useMemo, useState } from 'react';
import {
  FaArrowRight,
  FaBroadcastTower,
  FaCalendarAlt,
  FaCloudUploadAlt,
  FaHeadphones,
  FaMicrophone,
  FaPlay,
  FaShareAlt,
  FaUsers,
  FaWifi,
} from 'react-icons/fa';

import studioService from '../../services/studioService';
import batch2Service from '../../services/batch2Service';
import EchoAvatar from '../EchooSystem/EchoAvatar';
import EchoSignal from '../EchooSystem/EchoSignal';
import EchoWave from '../EchooSystem/EchoWave';
import './CreatorStudioHomeFinal.css';
import './CreatorStudioHomeFixes.css';
import './CreatorPremium2026.css';
import './CreatorStudioHomeState2026.css';

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US', {
    notation: Number(value) >= 10000 ? 'compact' : 'standard',
  }).format(Number(value) || 0);

const pad = (value) => String(value).padStart(2, '0');

const formatTimer = (seconds) => {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
};

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
  onUpload,
  onNavigate,
}) => {
  const [dashboard, setDashboard] = useState(null);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [dashboardResult, stationResult] = await Promise.all([
          studioService.getDashboard(),
          batch2Service.getMyStations(),
        ]);
        if (!active) return;
        setDashboard(dashboardResult?.data || null);
        setStations(Array.isArray(stationResult?.data) ? stationResult.data : []);
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not load your creator home.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, []);

  const stats = dashboard?.stats || {};
  const recentContent = Array.isArray(dashboard?.recentContent) ? dashboard.recentContent : [];
  const upcomingSchedule = Array.isArray(dashboard?.upcomingSchedule) ? dashboard.upcomingSchedule : [];
  const activeBroadcasts = Array.isArray(dashboard?.activeBroadcasts) ? dashboard.activeBroadcasts : [];
  const liveBroadcast = activeBroadcasts.find((item) => item.status === 'live') || null;

  useEffect(() => {
    if (!liveBroadcast) return undefined;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [liveBroadcast]);

  const liveStation = useMemo(() => {
    if (!liveBroadcast) return null;
    const stationId = liveBroadcast.station?.id || liveBroadcast.station?._id || liveBroadcast.stationId;
    return stations.find((station) => String(station.id) === String(stationId))
      || (typeof liveBroadcast.station === 'object' ? liveBroadcast.station : null);
  }, [liveBroadcast, stations]);

  const stationPreview = useMemo(
    () => [...stations]
      .sort((first, second) => Number(Boolean(second.isLive)) - Number(Boolean(first.isLive)))
      .slice(0, 3),
    [stations]
  );

  const liveStartedAt = liveBroadcast
    ? new Date(liveBroadcast.startedAt || liveBroadcast.startTime || clock).getTime()
    : clock;
  const liveElapsed = liveBroadcast
    ? Math.max(0, Math.floor((clock - liveStartedAt) / 1000))
    : 0;

  const metrics = useMemo(
    () => liveBroadcast
      ? [
          { label: 'Live listeners', value: formatNumber(liveBroadcast.listenerCount ?? stats.listeners), icon: <FaHeadphones /> },
          { label: 'Peak listeners', value: formatNumber(liveBroadcast.peakListeners), icon: <FaUsers /> },
          { label: 'Total plays', value: formatNumber(stats.plays), icon: <FaPlay /> },
          { label: 'Published audio', value: formatNumber(dashboard?.totalTracks), icon: <FaCloudUploadAlt /> },
        ]
      : [
          { label: 'Live listeners', value: formatNumber(stats.listeners), icon: <FaHeadphones /> },
          { label: 'Followers', value: formatNumber(stats.followers), icon: <FaUsers /> },
          { label: 'Total plays', value: formatNumber(stats.plays), icon: <FaPlay /> },
          { label: 'Published audio', value: formatNumber(dashboard?.totalTracks), icon: <FaCloudUploadAlt /> },
        ],
    [dashboard?.totalTracks, liveBroadcast, stats.followers, stats.listeners, stats.plays]
  );

  const openBroadcast = (mode = 'now', stationId = '') => {
    sessionStorage.setItem('echooBroadcastMode', mode);
    if (stationId) sessionStorage.setItem('echooSelectedStationId', String(stationId));
    else sessionStorage.removeItem('echooSelectedStationId');
    onNavigate?.('Broadcast');
  };

  const enterScheduled = (broadcast) => {
    if (!broadcast?.id && !broadcast?._id) return;
    sessionStorage.setItem('echooPreparedBroadcastId', String(broadcast.id || broadcast._id));
    sessionStorage.setItem('echooBroadcastMode', 'now');
    onNavigate?.('Broadcast');
  };

  const shareLiveBroadcast = async () => {
    if (!liveBroadcast?.id && !liveBroadcast?._id) return;
    const broadcastId = liveBroadcast.id || liveBroadcast._id;
    const url = `${window.location.origin}/listen/live/${encodeURIComponent(broadcastId)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: liveBroadcast.title || 'Echoo live broadcast',
          text: `${studioName} is live on Echoo.`,
          url,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // Sharing can be cancelled by the creator without changing the live state.
    }
  };

  return (
    <div className={`ehome ${liveBroadcast ? 'is-live' : 'is-offline'}`}>
      <section className="ehome-hero">
        <div className="ehome-hero-copy">
          <span className="ehome-eyebrow">CREATOR STUDIO</span>
          {liveBroadcast ? (
            <h1>You&apos;re live, <em className="live-word">on air</em><br />right now.</h1>
          ) : (
            <h1>Your voice, <em>ready</em><br />when you are.</h1>
          )}
          <p>
            {liveBroadcast
              ? 'Keep an eye on your broadcast, monitor the audience and return to the studio whenever you need to adjust the mix.'
              : 'Create a station, start or schedule a broadcast, or publish audio when you are ready.'}
          </p>

          <div className="ehome-hero-actions">
            {liveBroadcast ? (
              <>
                <button type="button" className="primary dark" onClick={() => openBroadcast('now')}>
                  <FaMicrophone /> Open live studio
                </button>
                <button type="button" onClick={shareLiveBroadcast}>
                  <FaShareAlt /> Share broadcast
                </button>
              </>
            ) : (
              <>
                <button type="button" className="primary" onClick={() => onNavigate?.('Stations')}>
                  <FaBroadcastTower /> Create station
                </button>
                <button type="button" onClick={onUpload}>
                  <FaCloudUploadAlt /> Upload audio
                </button>
              </>
            )}
          </div>
        </div>

        <div className={`ehome-signal ${liveBroadcast ? 'live' : ''}`}>
          <EchoSignal
            className="ehome-profile-signal"
            size="xl"
            state={liveBroadcast ? 'live' : 'active'}
            activeNodes={liveBroadcast ? 3 : 2}
          >
            <EchoAvatar image={profileImage} name={studioName} size="lg" state="idle" />
          </EchoSignal>
          <span>{liveBroadcast ? 'ON AIR' : 'NOT LIVE'}</span>
          <small>{studioName} · {studioType}</small>
        </div>
      </section>

      {liveBroadcast ? (
        <section className="ehome-live-command" aria-label="Current live broadcast">
          <div className="ehome-live-command-topline">
            <span><i /> LIVE NOW</span>
            <b>{formatTimer(liveElapsed)}</b>
          </div>

          <div className="ehome-live-brand">
            <div className="ehome-live-art">
              <img
                src={liveStation?.brandCover || liveStation?.coverArt || liveBroadcast.coverArt}
                alt={`${liveStation?.name || 'Station'} brand`}
              />
            </div>
            <div>
              <h2>{liveBroadcast.title || 'Live broadcast'}</h2>
              <strong>{liveStation?.name || liveBroadcast.stationName || 'Echoo Station'}</strong>
              <small>Host: {studioName}</small>
            </div>
          </div>

          <div className="ehome-live-wave" aria-hidden="true">
            <EchoWave state="speaking" />
          </div>

          <div className="ehome-live-stat">
            <span>Current listeners</span>
            <strong>{formatNumber(liveBroadcast.listenerCount ?? stats.listeners)}</strong>
          </div>
          <div className="ehome-live-stat">
            <span>Peak listeners</span>
            <strong>{formatNumber(liveBroadcast.peakListeners)}</strong>
          </div>
          <div className="ehome-live-stat connection">
            <span><FaWifi /> Connection</span>
            <strong>Live</strong>
            <small>Room active</small>
          </div>

          <div className="ehome-live-command-actions">
            <button type="button" className="primary" onClick={() => openBroadcast('now')}>
              <FaMicrophone /> Open live studio
            </button>
            <button type="button" onClick={shareLiveBroadcast}>
              <FaShareAlt /> Share broadcast
            </button>
          </div>
        </section>
      ) : (
        <section className="ehome-flow-card">
          <div className="ehome-flow-step">
            <b>1</b><i><FaBroadcastTower /></i>
            <div><strong>Create station</strong><span>Set up your space and brand.</span></div>
          </div>
          <div className="ehome-flow-step">
            <b>2</b><i><FaCalendarAlt /></i>
            <div><strong>Start or schedule</strong><span>Go live now or plan ahead.</span></div>
          </div>
          <div className="ehome-flow-step">
            <b>3</b><i><FaMicrophone /></i>
            <div><strong>Go live</strong><span>Broadcast to your audience.</span></div>
          </div>
        </section>
      )}

      {error && <div className="ehome-alert">{error}</div>}

      <div className="ehome-dashboard-grid">
        <section className="ehome-panel">
          <div className="ehome-panel-head">
            <div>
              <h2>Your stations</h2>
              <p>{stations.length ? `${stations.length} owned by this account` : 'Create your first station to begin.'}</p>
            </div>
            <button type="button" onClick={() => onNavigate?.('Stations')}>View all <FaArrowRight /></button>
          </div>

          {loading ? (
            <div className="ehome-loading"><span /><span /><span /></div>
          ) : stationPreview.length ? (
            <div className="ehome-stations-preview">
              {stationPreview.map((station) => {
                const anotherStationLive = Boolean(liveBroadcast && !station.isLive);
                return (
                  <button
                    type="button"
                    className={`ehome-station-mini ${station.isLive ? 'live' : ''}`}
                    key={station.id}
                    onClick={() => station.isLive
                      ? openBroadcast('now', station.id)
                      : anotherStationLive
                        ? openBroadcast('later', station.id)
                        : openBroadcast('now', station.id)}
                  >
                    <div className="ehome-station-art">
                      <img src={station.brandCover || station.coverArt} alt={`${station.name} brand`} />
                      {station.isLive && <span>LIVE</span>}
                    </div>
                    <strong>{station.name}</strong>
                    <small>{station.category || 'Station'}</small>
                    <em>
                      {station.isLive
                        ? `${formatNumber(station.listenerCount)} listening · Open studio`
                        : anotherStationLive
                          ? 'Another station is live · Schedule instead'
                          : 'Ready to broadcast'}
                    </em>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ehome-empty compact">
              <FaBroadcastTower />
              <div>
                <strong>No stations yet</strong>
                <span>Create a station once, then use it for every broadcast.</span>
              </div>
              <button type="button" onClick={() => onNavigate?.('Stations')}>Create station</button>
            </div>
          )}
        </section>

        <section className="ehome-panel">
          <div className="ehome-panel-head">
            <div><h2>Upcoming broadcasts</h2><p>Scheduled sessions ready for the studio.</p></div>
            <button type="button" onClick={() => openBroadcast('later')}>Plan one <FaArrowRight /></button>
          </div>

          <div className="ehome-upcoming-list">
            {upcomingSchedule.slice(0, 3).map((broadcast) => (
              <button
                type="button"
                className="ehome-upcoming"
                key={broadcast.id || broadcast._id}
                onClick={() => enterScheduled(broadcast)}
              >
                <span>SCHEDULED</span>
                <div>
                  <strong>{broadcast.title}</strong>
                  <small>{broadcast.station?.name || 'Station'} · {formatDateTime(broadcast.startTime)}</small>
                </div>
                <b>Enter studio</b>
              </button>
            ))}
            {!upcomingSchedule.length && !loading && (
              <div className="ehome-empty compact">
                <FaCalendarAlt />
                <div><strong>Nothing planned yet</strong><span>Schedule a broadcast whenever you are ready.</span></div>
              </div>
            )}
          </div>
        </section>

        <section className="ehome-panel">
          <div className="ehome-panel-head">
            <div>
              <h2>Performance snapshot</h2>
              <p>{liveBroadcast ? 'Live performance from your Echoo account.' : 'Activity from your Echoo account.'}</p>
            </div>
            <button type="button" onClick={() => onNavigate?.('Analytics')}>Analytics <FaArrowRight /></button>
          </div>
          <div className="ehome-metrics">
            {metrics.map((metric) => (
              <article key={metric.label}>
                <i>{metric.icon}</i><span>{metric.label}</span><strong>{metric.value}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="ehome-panel">
          <div className="ehome-panel-head">
            <div><h2>Recent audio</h2><p>Your latest uploaded recordings.</p></div>
            <button type="button" onClick={() => onNavigate?.('Audio')}>View all <FaArrowRight /></button>
          </div>

          {recentContent.length ? (
            <div className="ehome-audio-list">
              {recentContent.slice(0, 3).map((track) => (
                <article key={track.id}>
                  <div>{track.coverArt ? <img src={track.coverArt} alt="" /> : <FaPlay />}</div>
                  <span>
                    <strong>{track.title}</strong>
                    <small>{track.genre || 'Audio'} · {formatNumber(track.plays)} plays</small>
                  </span>
                  <em>{track.isPublic ? 'Public' : 'Private'}</em>
                </article>
              ))}
            </div>
          ) : (
            <div className="ehome-empty ehome-audio-empty">
              <FaHeadphones />
              <div>
                <strong>No recent uploads</strong>
                <span>Audio you publish will appear here for quick access.</span>
              </div>
            </div>
          )}
        </section>
      </div>

      {!stations.length && (
        <section className="ehome-station-note">
          <i><FaBroadcastTower /></i>
          <div>
            <strong>Stations are the home for your broadcasts</strong>
            <span>Create a station once, then choose it whenever you start or schedule a broadcast.</span>
          </div>
          <button type="button" onClick={() => onNavigate?.('Stations')}>
            Create station <FaArrowRight />
          </button>
        </section>
      )}
    </div>
  );
};

export default CreatorStudioHome;
