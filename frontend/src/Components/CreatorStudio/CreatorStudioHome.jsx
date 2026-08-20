import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaArrowRight,
  FaBroadcastTower,
  FaCalendarAlt,
  FaCheck,
  FaCheckCircle,
  FaChevronDown,
  FaCloudUploadAlt,
  FaEllipsisH,
  FaHeadphones,
  FaMicrophone,
  FaPause,
  FaPlay,
  FaUsers,
} from 'react-icons/fa';
import studioService from '../../services/studioService';
import batch2Service from '../../services/batch2Service';
import { buildMediaUrl } from '../../services/api.js';
import EchoAvatar from '../EchooSystem/EchoAvatar';
import EchoSignal from '../EchooSystem/EchoSignal';
import CreatorAudioDetailModal from './CreatorAudioDetailModal.jsx';
import UnavailableState from '../UI/UnavailableState';
import './CreatorStudioHomeFinal.css';
import './CreatorStudioHomeAudit.css';

const PERIODS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
];

const number = (value) =>
  new Intl.NumberFormat('en-US', {
    notation: Number(value) >= 10000 ? 'compact' : 'standard',
  }).format(Number(value) || 0);

const plural = (value, label) =>
  `${number(value)} ${label}${Number(value) === 1 ? '' : 's'}`;

const dateTime = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const trend = (value) => {
  if (!Number.isFinite(Number(value))) return 'No prior comparison';
  const numeric = Number(value);
  return `${numeric > 0 ? '+' : ''}${numeric}% vs prev 30 days`;
};

const localFlag = (key) => {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

const trackId = (track) => String(track?.id || track?._id || '');

export default function CreatorStudioHome({
  studioName = 'Creator',
  studioType = 'Creator',
  profileImage = null,
  onUpload,
  onNavigate,
}) {
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [dashboardUnavailable, setDashboardUnavailable] = useState(false);
  const [analyticsUnavailable, setAnalyticsUnavailable] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [period, setPeriod] = useState('30d');
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState('');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setDashboardUnavailable(false);
        setError('');
        const [home, stationList] = await Promise.all([
          studioService.getDashboard(),
          batch2Service.getMyStations(),
        ]);
        if (!mounted) return;
        setDashboard(home?.data || null);
        setStations(Array.isArray(stationList?.data) ? stationList.data : []);
      } catch (loadError) {
        if (mounted) {
          setDashboard(null);
          setStations([]);
          setDashboardUnavailable(true);
          setError(loadError?.message || 'Could not load your creator home.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [reloadVersion]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setAnalyticsLoading(true);
        setAnalyticsUnavailable(false);
        const result = await studioService.getAnalytics(period);
        if (mounted) setAnalytics(result?.data || null);
      } catch {
        if (mounted) {
          setAnalytics(null);
          setAnalyticsUnavailable(true);
        }
      } finally {
        if (mounted) setAnalyticsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [period, reloadVersion]);

  const retryData = () => setReloadVersion((current) => current + 1);

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const stats = dashboard?.stats || {};
  const summary = analytics?.summary || {};
  const broadcasts = Array.isArray(analytics?.broadcasts) ? analytics.broadcasts : [];
  const recent = Array.isArray(dashboard?.recentContent) ? dashboard.recentContent : [];
  const upcoming = Array.isArray(dashboard?.upcomingSchedule) ? dashboard.upcomingSchedule : [];
  const active = Array.isArray(dashboard?.activeBroadcasts) ? dashboard.activeBroadcasts : [];
  const live = active.some((item) => item.status === 'live');

  const station = useMemo(
    () => [...stations]
      .sort((a, b) => Number(Boolean(b.isLive)) - Number(Boolean(a.isLive)))[0] || null,
    [stations]
  );

  const totalTracks = Number(summary.totalTracks ?? dashboard?.totalTracks) || 0;
  const totalPlays = Number(summary.totalPlays ?? dashboard?.totalPlays ?? stats.plays) || 0;
  const peak = Number(summary.peakListeners ?? stats.peakListeners) || 0;
  const average = broadcasts.length
    ? Math.round(
        broadcasts.reduce(
          (sum, item) => sum + (Number(item.listenerCount) || Number(item.peakListeners) || 0),
          0
        ) / broadcasts.length
      )
    : 0;

  const setupReady =
    localFlag('echooProfileCompleted') ||
    Boolean(studioName && !['Creator', 'Creator Studio'].includes(studioName));
  const canBroadcast = !dashboardUnavailable && stations.length > 0;
  const systemsReady = setupReady && canBroadcast;
  const contentLabel = dashboardUnavailable ? 'Unavailable' : plural(totalTracks, 'audio upload');
  const periodLabel = PERIODS.find((item) => item.value === period)?.label || 'Selected period';

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

  const openStation = (action = 'open') => {
    if (station?.id) {
      sessionStorage.setItem('echooSelectedStationId', String(station.id));
      sessionStorage.setItem('echooStationHomeAction', action);
    }
    onNavigate?.('Stations');
  };

  const stopQuickAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId('');
  };

  const openAudio = (track) => {
    stopQuickAudio();
    setSelectedTrack(track);
  };

  const toggleAudio = async (track) => {
    const id = trackId(track);
    const url = buildMediaUrl(track?.fileUrl || track?.audioUrl || '');
    if (!id || !url) return;

    if (playingId === id && audioRef.current) {
      stopQuickAudio();
      return;
    }

    stopQuickAudio();
    const player = new Audio(url);
    audioRef.current = player;
    player.addEventListener('ended', () => {
      if (audioRef.current === player) audioRef.current = null;
      setPlayingId('');
    }, { once: true });
    player.addEventListener('error', () => {
      if (audioRef.current === player) audioRef.current = null;
      setPlayingId('');
    }, { once: true });

    try {
      await player.play();
      setPlayingId(id);
    } catch {
      if (audioRef.current === player) audioRef.current = null;
      setPlayingId('');
    }
  };

  const metrics = [
    ['Total plays', number(totalPlays), <FaPlay />, period === '30d' ? trend(stats.playsChange) : periodLabel],
    ['Followers', number(stats.followers), <FaUsers />, period === '30d' ? trend(stats.followersChange) : periodLabel],
    ['Average listeners', number(average), <FaHeadphones />, periodLabel],
    ['Peak listeners', number(peak), <FaUsers />, periodLabel],
    ['Broadcasts', number(summary.completedBroadcasts), <FaBroadcastTower />, `Completed · ${periodLabel}`],
    ['Published audio', number(totalTracks), <FaCloudUploadAlt />, 'Current library'],
  ];

  return (
    <div className={`ehome ehome-reference ${live ? 'is-live' : 'is-offline'}`}>
      <section className="ehome-hero ehome-reference-hero">
        <div className="ehome-hero-copy">
          <span className="ehome-eyebrow">CREATOR STUDIO</span>
          <h1>
            {live
              ? <>You&apos;re live, <em>on air</em><br />right now.</>
              : <>Your voice, <em>ready</em><br />when you are.</>}
          </h1>
          <p>
            {live
              ? 'Monitor your audience and return to the studio whenever you need to adjust the mix.'
              : 'Create a station, go live, or upload audio. Everything you need to build your audience is right here.'}
          </p>
          <div className="ehome-hero-actions">
            {live ? (
              <button type="button" className="primary" onClick={() => openBroadcast('now')}>
                <FaMicrophone /> Open live studio
              </button>
            ) : (
              <button type="button" className="primary" onClick={() => onNavigate?.('Stations')}>
                <FaBroadcastTower /> Create station
              </button>
            )}
            <button type="button" onClick={onUpload}>
              <FaCloudUploadAlt /> Upload audio
            </button>
          </div>
        </div>

        <div className={`ehome-signal ehome-reference-signal ${live ? 'live' : ''}`}>
          <EchoSignal
            className="ehome-profile-signal"
            size="xl"
            state={live ? 'live' : 'active'}
            activeNodes={live ? 3 : 2}
          >
            <EchoAvatar image={profileImage} name={studioName} size="lg" state="idle" />
          </EchoSignal>
          <span className={live ? 'is-live' : systemsReady ? 'is-ready' : 'is-pending'}>
            {live ? 'ON AIR' : systemsReady ? 'ALL SYSTEMS READY' : 'SETUP INCOMPLETE'}
          </span>
          <small>{studioName} · {studioType}</small>
        </div>

        <div className="ehome-readiness">
          <div className="ehome-readiness-item">
            <i className={setupReady ? 'ready' : ''}>{setupReady ? <FaCheck /> : <FaUsers />}</i>
            <div>
              <strong>Set up</strong>
              <span>{setupReady ? 'Your profile is complete' : 'Finish your creator profile'}</span>
            </div>
          </div>
          <div className="ehome-readiness-item">
            <i><FaCloudUploadAlt /></i>
            <div><strong>Content</strong><span>{contentLabel}</span></div>
          </div>
          <div className="ehome-readiness-item">
            <i><FaMicrophone /></i>
            <div><strong>Go live</strong><span>{canBroadcast ? 'Ready to broadcast' : 'Create a station first'}</span></div>
          </div>
        </div>
      </section>

      {error && !dashboardUnavailable && <div className="ehome-alert">{error}</div>}

      <div className="ehome-reference-grid">
        <section className="ehome-panel ehome-station-overview">
          <div className="ehome-panel-head">
            <div><h2>Your station</h2></div>
            <button type="button" onClick={() => onNavigate?.('Stations')}>
              View all stations <FaArrowRight />
            </button>
          </div>

          {loading ? (
            <div className="ehome-reference-loading" />
          ) : dashboardUnavailable ? (
            <UnavailableState
              compact
              title="Station data unavailable"
              message="Echoo could not load your station status."
              onRetry={retryData}
            />
          ) : station ? (
            <>
              <div className="ehome-primary-station">
                <div className="ehome-primary-station-art">
                  {(station.brandCover || station.coverArt)
                    ? <img src={station.brandCover || station.coverArt} alt={`${station.name} brand`} />
                    : <FaBroadcastTower />}
                  {station.isLive && <span>LIVE</span>}
                </div>
                <div className="ehome-primary-station-stats">
                  <div>
                    <strong>{number(station.followerCount ?? stats.followers)}</strong>
                    <span>Followers</span>
                  </div>
                  <div>
                    <strong>{number(station.listenerCount)}</strong>
                    <span>Listening now</span>
                  </div>
                </div>
              </div>
              <div className="ehome-primary-station-copy">
                <strong>{station.name}</strong>
                <span>{station.category || 'Station'}</span>
                <em><FaCheckCircle /> {station.isLive ? 'Live now' : 'Ready to broadcast'}</em>
              </div>
              <div className="ehome-panel-footer-actions">
                <button type="button" className="wide" onClick={() => openStation('open')}>
                  <FaBroadcastTower /> Open station
                </button>
                <button
                  type="button"
                  className="icon-only"
                  onClick={() => openStation('options')}
                  aria-label="Station options"
                >
                  <FaEllipsisH />
                </button>
              </div>
            </>
          ) : (
            <div className="ehome-empty compact">
              <FaBroadcastTower />
              <div><strong>No station yet</strong><span>Create your first station to begin broadcasting.</span></div>
              <button type="button" onClick={() => onNavigate?.('Stations')}>Create station</button>
            </div>
          )}
        </section>

        <section className="ehome-panel ehome-upcoming-panel">
          <div className="ehome-panel-head">
            <div><h2>Upcoming broadcasts</h2></div>
            <button type="button" onClick={() => openBroadcast('later')}>
              View schedule <FaArrowRight />
            </button>
          </div>
          <div className="ehome-reference-upcoming-list">
            {dashboardUnavailable ? (
              <UnavailableState
                compact
                title="Schedule unavailable"
                message="Echoo could not load your upcoming broadcasts."
                onRetry={retryData}
              />
            ) : upcoming.slice(0, 3).map((item) => (
              <button
                type="button"
                className="ehome-reference-upcoming"
                key={item.id || item._id}
                onClick={() => openScheduled(item)}
              >
                <i><FaCalendarAlt /></i>
                <div>
                  <strong>{item.title || 'Scheduled broadcast'}</strong>
                  <span>{dateTime(item.startTime)}</span>
                  <small>{number(item.listenerCount)} listeners · {number(item.peakListeners)} peak</small>
                </div>
              </button>
            ))}
            {!dashboardUnavailable && !upcoming.length && !loading && (
              <div className="ehome-reference-empty-row">
                <i><FaCalendarAlt /></i>
                <div><strong>Nothing scheduled</strong><span>Plan a broadcast when you are ready.</span></div>
              </div>
            )}
          </div>
          <div className="ehome-panel-footer-actions single">
            <button type="button" className="wide" onClick={() => openBroadcast('later')}>
              <FaCalendarAlt /> Schedule for later
            </button>
          </div>
        </section>

        <section className="ehome-panel ehome-recent-audio-panel">
          <div className="ehome-panel-head">
            <div><h2>Recent audio</h2></div>
            <button type="button" onClick={() => onNavigate?.('Audio')}>
              View all audio <FaArrowRight />
            </button>
          </div>
          <div className="ehome-reference-audio-list">
            {dashboardUnavailable ? (
              <UnavailableState
                compact
                title="Recent audio unavailable"
                message="Echoo could not load your published audio."
                onRetry={retryData}
              />
            ) : recent.slice(0, 2).map((track) => {
              const id = trackId(track);
              const artwork = buildMediaUrl(
                track.coverArt || track.artwork || track.image || track.thumbnail || null
              );
              const isPlaying = playingId === id;
              const canPlay = Boolean(buildMediaUrl(track.fileUrl || track.audioUrl || ''));

              return (
                <article className="ehome-reference-audio-row" key={id || track.title}>
                  <button
                    type="button"
                    className="ehome-reference-audio-main"
                    onClick={() => openAudio(track)}
                    disabled={!canPlay}
                    aria-label={`Open ${track.title || 'audio'} player`}
                  >
                    <div className="ehome-reference-audio-art">
                      {artwork ? <img src={artwork} alt="" /> : <FaHeadphones />}
                    </div>
                    <div className="ehome-reference-audio-copy">
                      <strong>{track.title}</strong>
                      <span>{track.isPublic ? 'Public' : 'Private'} · {plural(track.plays, 'play')}</span>
                    </div>
                  </button>
                  <small>{track.duration || '0:00'}</small>
                  <button
                    type="button"
                    className="ehome-round-action"
                    onClick={() => toggleAudio(track)}
                    disabled={!canPlay}
                    aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                  >
                    {isPlaying ? <FaPause /> : <FaPlay />}
                  </button>
                  <button
                    type="button"
                    className="ehome-round-action muted"
                    onClick={() => onNavigate?.('Audio')}
                    aria-label="More audio options"
                  >
                    <FaEllipsisH />
                  </button>
                </article>
              );
            })}
            {!dashboardUnavailable && !recent.length && !loading && (
              <div className="ehome-reference-empty-row">
                <i><FaHeadphones /></i>
                <div><strong>No recent audio</strong><span>Your latest uploads will appear here.</span></div>
              </div>
            )}
          </div>
          <div className="ehome-panel-footer-actions single">
            <button type="button" className="wide" onClick={onUpload}>
              <FaCloudUploadAlt /> Upload audio
            </button>
          </div>
        </section>

        <section className="ehome-panel ehome-performance-panel">
          <div className="ehome-panel-head">
            <div><h2>Performance snapshot</h2></div>
            <label className="ehome-period-select">
              <span className="sr-only">Performance period</span>
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                disabled={analyticsLoading}
                aria-label="Performance period"
              >
                {PERIODS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <FaChevronDown />
            </label>
          </div>
          {analyticsLoading ? (
            <div className="ehome-reference-metrics is-loading">
              {metrics.map(([label, value, icon, detail]) => (
                <article key={label}>
                  <i>{icon}</i>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{detail}</small>
                </article>
              ))}
            </div>
          ) : analyticsUnavailable ? (
            <UnavailableState
              compact
              title="Analytics unavailable"
              message="Echoo could not load performance data for this period."
              onRetry={retryData}
            />
          ) : (
            <div className="ehome-reference-metrics">
              {metrics.map(([label, value, icon, detail]) => (
                <article key={label}>
                  <i>{icon}</i>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{detail}</small>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="ehome-panel ehome-creator-status-panel">
          <div className="ehome-panel-head"><div><h2>Creator status</h2></div></div>
          {dashboardUnavailable ? (
            <UnavailableState
              compact
              title="Creator status unavailable"
              message="Echoo could not confirm your current setup status."
              onRetry={retryData}
            />
          ) : (
          <div className="ehome-creator-status-list">
            <div>
              <i className={setupReady ? 'complete' : ''}>{setupReady ? <FaCheck /> : <FaUsers />}</i>
              <span>
                <strong>{setupReady ? 'Profile complete' : 'Complete your profile'}</strong>
                <small>{setupReady ? 'Your profile and creator details are set up.' : 'Finish your creator profile.'}</small>
              </span>
            </div>
            <div>
              <i className={totalTracks > 0 ? 'complete' : ''}>
                {totalTracks > 0 ? <FaCheck /> : <FaCloudUploadAlt />}
              </i>
              <span>
                <strong>{totalTracks > 0 ? 'Audio uploaded' : 'Upload your first audio'}</strong>
                <small>{totalTracks > 0 ? 'Keep sharing your content.' : 'Your library is ready.'}</small>
              </span>
            </div>
            <div className="featured">
              <i><FaBroadcastTower /></i>
              <span>
                <strong>Ready to broadcast</strong>
                <small>{canBroadcast ? 'You can start a broadcast anytime.' : 'Create a station before going live.'}</small>
              </span>
              <button
                type="button"
                onClick={() => canBroadcast ? openBroadcast('now') : onNavigate?.('Stations')}
              >
                {canBroadcast ? 'Open Studio' : 'Create station'}
              </button>
            </div>
          </div>
          )}
          <button
            type="button"
            className="ehome-settings-link"
            onClick={() => onNavigate?.('Settings')}
          >
            View all creator settings <FaArrowRight />
          </button>
        </section>
      </div>

      {selectedTrack && (
        <CreatorAudioDetailModal
          track={selectedTrack}
          onClose={() => setSelectedTrack(null)}
          onChanged={() => setSelectedTrack(null)}
        />
      )}
    </div>
  );
}
