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
import batch2Service from '../../services/batch2Service';
import EchoAvatar from '../EchooSystem/EchoAvatar';
import EchoSignal from '../EchooSystem/EchoSignal';
import './CreatorStudioHomeFinal.css';

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US', { notation: Number(value) >= 10000 ? 'compact' : 'standard' })
    .format(Number(value) || 0);

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
  const stationPreview = stations.slice(0, 3);

  const metrics = useMemo(
    () => [
      { label: 'Live listeners', value: formatNumber(stats.listeners), icon: <FaHeadphones /> },
      { label: 'Followers', value: formatNumber(stats.followers), icon: <FaUsers /> },
      { label: 'Total plays', value: formatNumber(stats.plays), icon: <FaPlay /> },
      { label: 'Published audio', value: formatNumber(dashboard?.totalTracks), icon: <FaCloudUploadAlt /> },
    ],
    [dashboard?.totalTracks, stats.followers, stats.listeners, stats.plays]
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

  return (
    <div className="ehome">
      <section className="ehome-hero">
        <div className="ehome-hero-copy">
          <span className="ehome-eyebrow">CREATOR STUDIO</span>
          <h1>Your voice, <em>ready</em> when you are.</h1>
          <p>Create a station, connect with your audience, and share audio that matters.</p>

          <div className="ehome-hero-actions">
            <button type="button" className="primary" onClick={() => onNavigate?.('Stations')}>
              <FaBroadcastTower /> Create station
            </button>
            <button
              type="button"
              className="primary dark"
              disabled={!stations.length && !liveBroadcast}
              title={!stations.length ? 'Create a station first.' : ''}
              onClick={() => openBroadcast('now')}
            >
              <FaMicrophone /> {liveBroadcast ? 'Open live studio' : 'Start broadcast'}
            </button>
            <button type="button" onClick={onUpload}>
              <FaCloudUploadAlt /> Upload audio
            </button>
          </div>
        </div>

        <div className={`ehome-signal ${liveBroadcast ? 'live' : ''}`}>
          <EchoSignal size="xl" state={liveBroadcast ? 'live' : 'active'} activeNodes={liveBroadcast ? 3 : 2}>
            <EchoAvatar image={profileImage} name={studioName} size="lg" state={liveBroadcast ? 'speaking' : 'idle'} />
          </EchoSignal>
          <span>{liveBroadcast ? 'ON AIR' : 'READY'}</span>
          <small>{studioName} · {studioType}</small>
        </div>
      </section>

      <section className="ehome-flow-card">
        <div className="ehome-flow-intro">
          <strong>Your creator flow</strong>
          <span>Three steps from setup to broadcast.</span>
        </div>
        <div className="ehome-flow-step">
          <b>1</b><i><FaBroadcastTower /></i>
          <div><strong>Create station</strong><span>Your permanent home on Echoo.</span></div>
        </div>
        <div className="ehome-flow-step">
          <b>2</b><i><FaCalendarAlt /></i>
          <div><strong>Start or schedule</strong><span>Broadcast now or choose a future time.</span></div>
        </div>
        <div className="ehome-flow-step">
          <b>3</b><i><FaMicrophone /></i>
          <div><strong>Go on air</strong><span>Enter the studio and connect with listeners.</span></div>
        </div>
      </section>

      {error && <div className="ehome-alert">{error}</div>}

      <div className="ehome-dashboard-grid">
        <section className="ehome-panel">
          <div className="ehome-panel-head">
            <div><h2>Your stations</h2><p>{stations.length ? `${stations.length} owned by this account` : 'Create your first station to begin.'}</p></div>
            <button type="button" onClick={() => onNavigate?.('Stations')}>View all <FaArrowRight /></button>
          </div>

          {loading ? (
            <div className="ehome-loading"><span /><span /><span /></div>
          ) : stationPreview.length ? (
            <div className="ehome-stations-preview">
              {stationPreview.map((station) => (
                <button
                  type="button"
                  className="ehome-station-mini"
                  key={station.id}
                  onClick={() => openBroadcast(station.isLive ? 'now' : 'now', station.id)}
                >
                  <div className="ehome-station-art">
                    {station.coverArt ? <img src={station.coverArt} alt="" /> : <FaBroadcastTower />}
                    {station.isLive && <span>LIVE</span>}
                  </div>
                  <strong>{station.name}</strong>
                  <small>{station.category || 'Station'}</small>
                  <em>{station.isLive ? `${formatNumber(station.listenerCount)} listening` : 'Ready to broadcast'}</em>
                </button>
              ))}
            </div>
          ) : (
            <div className="ehome-empty compact">
              <FaBroadcastTower />
              <div><strong>No stations yet</strong><span>Create a station once, then use it for every broadcast.</span></div>
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
            {liveBroadcast && (
              <button type="button" className="ehome-upcoming live" onClick={() => openBroadcast('now')}>
                <span className="live">LIVE</span>
                <div><strong>{liveBroadcast.title}</strong><small>Live now · {formatNumber(liveBroadcast.listenerCount)} listening</small></div>
                <b>Open studio</b>
              </button>
            )}
            {upcomingSchedule.slice(0, liveBroadcast ? 2 : 3).map((broadcast) => (
              <button type="button" className="ehome-upcoming" key={broadcast.id || broadcast._id} onClick={() => enterScheduled(broadcast)}>
                <span>SCHEDULED</span>
                <div><strong>{broadcast.title}</strong><small>{broadcast.station?.name || 'Station'} · {formatDateTime(broadcast.startTime)}</small></div>
                <b>Enter studio</b>
              </button>
            ))}
            {!liveBroadcast && !upcomingSchedule.length && !loading && (
              <div className="ehome-empty compact"><FaCalendarAlt /><div><strong>Nothing planned yet</strong><span>Schedule a broadcast whenever you are ready.</span></div></div>
            )}
          </div>
        </section>

        <section className="ehome-panel">
          <div className="ehome-panel-head">
            <div><h2>Performance snapshot</h2><p>Real activity from your Echoo account.</p></div>
            <button type="button" onClick={() => onNavigate?.('Analytics')}>Analytics <FaArrowRight /></button>
          </div>
          <div className="ehome-metrics">
            {metrics.map((metric) => (
              <article key={metric.label}><i>{metric.icon}</i><span>{metric.label}</span><strong>{metric.value}</strong></article>
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
                  <span><strong>{track.title}</strong><small>{track.genre || 'Audio'} · {formatNumber(track.plays)} plays</small></span>
                  <em>{track.isPublic ? 'Public' : 'Private'}</em>
                </article>
              ))}
            </div>
          ) : (
            <div className="ehome-empty"><FaHeadphones /><div><strong>No audio yet</strong><span>Your uploaded recordings will appear here.</span></div><button type="button" onClick={onUpload}>Upload audio</button></div>
          )}
        </section>
      </div>

      <section className="ehome-station-note">
        <i><FaBroadcastTower /></i>
        <div><strong>Stations are the home for your broadcasts</strong><span>Create a station once, then choose it whenever you start or schedule a broadcast.</span></div>
        <button type="button" onClick={() => onNavigate?.('Stations')}>Manage stations <FaArrowRight /></button>
      </section>
    </div>
  );
};

export default CreatorStudioHome;
