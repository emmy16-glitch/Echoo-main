import { useEffect, useMemo, useState } from 'react';
import { FaArrowRight, FaBroadcastTower, FaCalendarAlt, FaCheck, FaCheckCircle, FaCloudUploadAlt, FaEllipsisH, FaHeadphones, FaMicrophone, FaPlay, FaUsers } from 'react-icons/fa';
import studioService from '../../services/studioService';
import batch2Service from '../../services/batch2Service';
import EchoAvatar from '../EchooSystem/EchoAvatar';
import EchoSignal from '../EchooSystem/EchoSignal';
import './CreatorStudioHomeFinal.css';
import './CreatorStudioHomeFixes.css';
import './CreatorPremium2026.css';
import './CreatorStudioHomeState2026.css';
import './CreatorStudioHomeReference.css';

const number = (value) => new Intl.NumberFormat('en-US', { notation: Number(value) >= 10000 ? 'compact' : 'standard' }).format(Number(value) || 0);
const plural = (value, label) => `${number(value)} ${label}${Number(value) === 1 ? '' : 's'}`;
const dateTime = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const trend = (value) => Number.isFinite(Number(value)) ? `${Number(value) > 0 ? '+' : ''}${Number(value)}% vs prev 30 days` : 'No prior comparison';

export default function CreatorStudioHome({ studioName = 'Creator', studioType = 'Creator', profileImage = null, onUpload, onNavigate }) {
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [home, stationList, analyticsResult] = await Promise.all([
          studioService.getDashboard(),
          batch2Service.getMyStations(),
          studioService.getAnalytics('30d'),
        ]);
        if (!mounted) return;
        setDashboard(home?.data || null);
        setStations(Array.isArray(stationList?.data) ? stationList.data : []);
        setAnalytics(analyticsResult?.data || null);
      } catch (loadError) {
        if (mounted) setError(loadError?.message || 'Could not load your creator home.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const stats = dashboard?.stats || {};
  const summary = analytics?.summary || {};
  const broadcasts = Array.isArray(analytics?.broadcasts) ? analytics.broadcasts : [];
  const recent = Array.isArray(dashboard?.recentContent) ? dashboard.recentContent : [];
  const upcoming = Array.isArray(dashboard?.upcomingSchedule) ? dashboard.upcomingSchedule : [];
  const active = Array.isArray(dashboard?.activeBroadcasts) ? dashboard.activeBroadcasts : [];
  const live = active.some((item) => item.status === 'live');
  const station = useMemo(() => [...stations].sort((a, b) => Number(Boolean(b.isLive)) - Number(Boolean(a.isLive)))[0] || null, [stations]);
  const totalTracks = Number(summary.totalTracks ?? dashboard?.totalTracks) || 0;
  const totalPlays = Number(summary.totalPlays ?? dashboard?.totalPlays ?? stats.plays) || 0;
  const peak = Number(summary.peakListeners ?? stats.peakListeners) || 0;
  const average = broadcasts.length ? Math.round(broadcasts.reduce((sum, item) => sum + (Number(item.listenerCount) || Number(item.peakListeners) || 0), 0) / broadcasts.length) : 0;
  const setupReady = Boolean(studioName && !['Creator', 'Creator Studio'].includes(studioName));
  const canBroadcast = stations.length > 0;

  const openBroadcast = (mode = 'now') => {
    sessionStorage.setItem('echooBroadcastMode', mode);
    onNavigate?.('Broadcast');
  };
  const openScheduled = (item) => {
    const id = item?.id || item?._id;
    if (!id) return;
    sessionStorage.setItem('echooPreparedBroadcastId', String(id));
    sessionStorage.setItem('echooBroadcastMode', 'now');
    onNavigate?.('Broadcast');
  };

  const metrics = [
    ['Total plays', number(totalPlays), <FaPlay />, trend(stats.playsChange)],
    ['Followers', number(stats.followers), <FaUsers />, trend(stats.followersChange)],
    ['Average listeners', number(average), <FaHeadphones />, 'Last 30 days'],
    ['Peak listeners', number(peak), <FaUsers />, 'Last 30 days'],
    ['Broadcasts', number(summary.completedBroadcasts), <FaBroadcastTower />, 'Completed in 30 days'],
    ['Published audio', number(totalTracks), <FaCloudUploadAlt />, 'Current library'],
  ];

  return (
    <div className={`ehome ehome-reference ${live ? 'is-live' : 'is-offline'}`}>
      <section className="ehome-hero ehome-reference-hero">
        <div className="ehome-hero-copy">
          <span className="ehome-eyebrow">CREATOR STUDIO</span>
          <h1>{live ? <>You&apos;re live, <em>on air</em><br />right now.</> : <>Your voice, <em>ready</em><br />when you are.</>}</h1>
          <p>{live ? 'Monitor your audience and return to the studio whenever you need to adjust the mix.' : 'Create a station, go live, or upload audio. Everything you need to build your audience is right here.'}</p>
          <div className="ehome-hero-actions">
            {live ? <button type="button" className="primary" onClick={() => openBroadcast('now')}><FaMicrophone /> Open live studio</button> : <button type="button" className="primary" onClick={() => onNavigate?.('Stations')}><FaBroadcastTower /> Create station</button>}
            <button type="button" onClick={onUpload}><FaCloudUploadAlt /> Upload audio</button>
          </div>
        </div>

        <div className={`ehome-signal ehome-reference-signal ${live ? 'live' : ''}`}>
          <EchoSignal className="ehome-profile-signal" size="xl" state={live ? 'live' : 'active'} activeNodes={live ? 3 : 2}>
            <EchoAvatar image={profileImage} name={studioName} size="lg" state="idle" />
          </EchoSignal>
          <span className={live ? 'is-live' : 'is-ready'}>{live ? 'ON AIR' : 'ALL SYSTEMS READY'}</span>
          <small>{studioName} · {studioType}</small>
        </div>

        <div className="ehome-readiness">
          <div className="ehome-readiness-item"><i className={setupReady ? 'ready' : ''}>{setupReady ? <FaCheck /> : <FaUsers />}</i><div><strong>Set up</strong><span>{setupReady ? 'Your profile is complete' : 'Finish your creator profile'}</span></div></div>
          <div className="ehome-readiness-item"><i><FaCloudUploadAlt /></i><div><strong>Content</strong><span>{plural(totalTracks, 'audio upload')}</span></div></div>
          <div className="ehome-readiness-item"><i><FaMicrophone /></i><div><strong>Go live</strong><span>{canBroadcast ? 'Ready to broadcast' : 'Create a station first'}</span></div></div>
        </div>
      </section>

      {error && <div className="ehome-alert">{error}</div>}

      <div className="ehome-reference-grid">
        <section className="ehome-panel ehome-station-overview">
          <div className="ehome-panel-head"><div><h2>Your station</h2></div><button type="button" onClick={() => onNavigate?.('Stations')}>View all stations <FaArrowRight /></button></div>
          {loading ? <div className="ehome-reference-loading" /> : station ? <>
            <div className="ehome-primary-station">
              <div className="ehome-primary-station-art">{(station.brandCover || station.coverArt) ? <img src={station.brandCover || station.coverArt} alt={`${station.name} brand`} /> : <FaBroadcastTower />}{station.isLive && <span>LIVE</span>}</div>
              <div className="ehome-primary-station-stats"><div><strong>{number(stats.followers)}</strong><span>Followers</span></div><div><strong>{number(station.listenerCount)}</strong><span>Listening now</span></div></div>
            </div>
            <div className="ehome-primary-station-copy"><strong>{station.name}</strong><span>{station.category || 'Station'}</span><em><FaCheckCircle /> {station.isLive ? 'Live now' : 'Ready to broadcast'}</em></div>
            <div className="ehome-panel-footer-actions"><button type="button" className="wide" onClick={() => onNavigate?.('Stations')}><FaBroadcastTower /> Open station</button><button type="button" className="icon-only" onClick={() => onNavigate?.('Stations')} aria-label="Station options"><FaEllipsisH /></button></div>
          </> : <div className="ehome-empty compact"><FaBroadcastTower /><div><strong>No station yet</strong><span>Create your first station to begin broadcasting.</span></div><button type="button" onClick={() => onNavigate?.('Stations')}>Create station</button></div>}
        </section>

        <section className="ehome-panel ehome-upcoming-panel">
          <div className="ehome-panel-head"><div><h2>Upcoming broadcasts</h2></div><button type="button" onClick={() => openBroadcast('later')}>View schedule <FaArrowRight /></button></div>
          <div className="ehome-reference-upcoming-list">
            {upcoming.slice(0, 3).map((item) => <button type="button" className="ehome-reference-upcoming" key={item.id || item._id} onClick={() => openScheduled(item)}><i><FaCalendarAlt /></i><div><strong>{item.title || 'Scheduled broadcast'}</strong><span>{dateTime(item.startTime)}</span><small>{item.station?.name || 'Station'}</small></div></button>)}
            {!upcoming.length && !loading && <div className="ehome-reference-empty-row"><i><FaCalendarAlt /></i><div><strong>Nothing scheduled</strong><span>Plan a broadcast when you are ready.</span></div></div>}
          </div>
          <div className="ehome-panel-footer-actions single"><button type="button" className="wide" onClick={() => openBroadcast('later')}><FaCalendarAlt /> Schedule for later</button></div>
        </section>

        <section className="ehome-panel ehome-recent-audio-panel">
          <div className="ehome-panel-head"><div><h2>Recent audio</h2></div><button type="button" onClick={() => onNavigate?.('Audio')}>View all audio <FaArrowRight /></button></div>
          <div className="ehome-reference-audio-list">
            {recent.slice(0, 2).map((track) => <button type="button" key={track.id} onClick={() => onNavigate?.('Audio')}><div className="ehome-reference-audio-art">{track.coverArt ? <img src={track.coverArt} alt="" /> : <FaHeadphones />}</div><div className="ehome-reference-audio-copy"><strong>{track.title}</strong><span>{track.isPublic ? 'Public' : 'Private'} · {plural(track.plays, 'play')}</span></div><small>{track.duration || '0:00'}</small><i className="ehome-round-action"><FaPlay /></i><i className="ehome-round-action muted"><FaEllipsisH /></i></button>)}
            {!recent.length && !loading && <div className="ehome-reference-empty-row"><i><FaHeadphones /></i><div><strong>No recent audio</strong><span>Your latest uploads will appear here.</span></div></div>}
          </div>
          <div className="ehome-panel-footer-actions single"><button type="button" className="wide" onClick={onUpload}><FaCloudUploadAlt /> Upload audio</button></div>
        </section>

        <section className="ehome-panel ehome-performance-panel">
          <div className="ehome-panel-head"><div><h2>Performance snapshot</h2></div><button type="button" className="ehome-period-button" onClick={() => onNavigate?.('Analytics')}>Last 30 days</button></div>
          <div className="ehome-reference-metrics">{metrics.map(([label, value, icon, detail]) => <article key={label}><i>{icon}</i><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>
        </section>

        <section className="ehome-panel ehome-creator-status-panel">
          <div className="ehome-panel-head"><div><h2>Creator status</h2></div></div>
          <div className="ehome-creator-status-list">
            <div><i className={setupReady ? 'complete' : ''}>{setupReady ? <FaCheck /> : <FaUsers />}</i><span><strong>Profile complete</strong><small>{setupReady ? 'Your profile and creator details are set up.' : 'Finish your creator profile.'}</small></span></div>
            <div><i className={totalTracks > 0 ? 'complete' : ''}>{totalTracks > 0 ? <FaCheck /> : <FaCloudUploadAlt />}</i><span><strong>Audio uploaded</strong><small>{totalTracks > 0 ? 'Keep sharing your content.' : 'Upload your first audio.'}</small></span></div>
            <div className="featured"><i><FaBroadcastTower /></i><span><strong>Ready to broadcast</strong><small>{canBroadcast ? 'You can start a broadcast anytime.' : 'Create a station before going live.'}</small></span><button type="button" onClick={() => canBroadcast ? openBroadcast('now') : onNavigate?.('Stations')}>{canBroadcast ? 'Open Studio' : 'Create station'}</button></div>
          </div>
          <button type="button" className="ehome-settings-link" onClick={() => onNavigate?.('Settings')}>View all creator settings <FaArrowRight /></button>
        </section>
      </div>
    </div>
  );
}
