import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBroadcastTower,
  FaChartLine,
  FaChevronRight,
  FaCloudUploadAlt,
  FaEllipsisH,
  FaHeadphones,
  FaPlay,
  FaSyncAlt,
  FaUsers,
} from 'react-icons/fa';

import batch6Service from '../../services/batch6Service';
import './CreatorAnalyticsReference.css';

const PERIODS = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

const number = (value) =>
  new Intl.NumberFormat('en-US').format(Number(value) || 0);

const dateTime = (value) => {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : date.toLocaleString([], {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const dateLabel = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const changeCopy = (value, fallback = 'Current period') => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return fallback;
  return `${numeric > 0 ? '↑' : '↓'} ${Math.abs(numeric).toFixed(1).replace('.0', '')}% vs previous period`;
};

const buildPoints = (items, accessor, width = 620, height = 190) => {
  if (!items.length) return '';
  const values = items.map((item) => Math.max(0, Number(accessor(item)) || 0));
  const max = Math.max(1, ...values);
  return items.map((item, index) => {
    const x = items.length === 1 ? width / 2 : (index / (items.length - 1)) * width;
    const y = height - (Math.max(0, Number(accessor(item)) || 0) / max) * (height - 26) - 10;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
};

const CreatorAnalyticsConnectedWorkspace = ({ onNavigate }) => {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [changes, setChanges] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [grouping, setGrouping] = useState('daily');

  const load = useCallback(async (selectedPeriod) => {
    try {
      setLoading(true);
      setError('');
      const [trusted, overviewResponse] = await Promise.all([
        batch6Service.getTrustedAnalytics(selectedPeriod),
        batch6Service.getAnalyticsOverview(selectedPeriod),
      ]);
      setData(trusted);
      setChanges(overviewResponse?.data?.changes || {});
    } catch (loadError) {
      setData(null);
      setChanges({});
      setError(loadError?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [load, period]);

  const overview = data?.overview || {};
  const summary = data?.summary || {};
  const contentByType = data?.contentByType || {};
  const topTracks = Array.isArray(data?.topTracks) ? data.topTracks : [];
  const recentBroadcasts = Array.isArray(data?.recentBroadcasts) ? data.recentBroadcasts : [];

  const totals = {
    plays: Number(summary.totalPlays ?? overview.totalPlays) || 0,
    followers: Number(overview.totalFollowers) || 0,
    average: Number(overview.avgListeners) || 0,
    peak: Number(overview.peakListeners) || 0,
    broadcasts: Number(contentByType?.broadcasts?.count) || 0,
    tracks: Number(summary.totalTracks ?? overview.totalTracks) || 0,
  };

  const series = useMemo(() => {
    const sorted = [...recentBroadcasts]
      .filter((item) => item.startTime)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    if (grouping === 'daily') return sorted;

    const buckets = new Map();
    sorted.forEach((item) => {
      const date = new Date(item.startTime);
      if (Number.isNaN(date.getTime())) return;
      const monday = new Date(date);
      const day = monday.getDay() || 7;
      monday.setDate(monday.getDate() - day + 1);
      const key = monday.toISOString().slice(0, 10);
      const current = buckets.get(key) || { startTime: monday, listeners: 0, peakListeners: 0, count: 0 };
      current.listeners += Number(item.listeners) || 0;
      current.peakListeners = Math.max(current.peakListeners, Number(item.peakListeners) || 0);
      current.count += 1;
      buckets.set(key, current);
    });
    return [...buckets.values()].map((item) => ({
      ...item,
      listeners: item.count ? Math.round(item.listeners / item.count) : 0,
    }));
  }, [recentBroadcasts, grouping]);

  const listenerPoints = buildPoints(series, (item) => item.listeners);
  const peakPoints = buildPoints(series, (item) => item.peakListeners);
  const averageSeries = series.map((item) => ({ ...item, average: totals.average }));
  const averagePoints = buildPoints(averageSeries, (item) => item.average);
  const maxTrackPlays = Math.max(1, ...topTracks.map((track) => Number(track.plays) || 0));

  const metrics = [
    { label: 'Total plays', value: totals.plays, icon: <FaPlay />, change: changeCopy(changes.plays, 'Current total') },
    { label: 'Followers', value: totals.followers, icon: <FaUsers />, change: changeCopy(changes.followers) },
    { label: 'Average listeners', value: totals.average, icon: <FaHeadphones />, change: changeCopy(changes.listeners) },
    { label: 'Peak listeners', value: totals.peak, icon: <FaChartLine />, change: changeCopy(changes.listeners) },
    { label: 'Broadcasts', value: totals.broadcasts, icon: <FaBroadcastTower />, change: 'Completed in selected period' },
    { label: 'Published audio', value: totals.tracks, icon: <FaCloudUploadAlt />, change: 'Current library' },
  ];

  const insights = [
    {
      icon: <FaChartLine />,
      tone: 'green',
      title: Number(changes.plays) > 0 ? 'Growing momentum' : 'Performance baseline',
      copy: Number(changes.plays) > 0
        ? `Your plays are up ${Math.abs(Number(changes.plays)).toFixed(1).replace('.0', '')}% compared with the previous period.`
        : `${number(totals.plays)} total plays are currently recorded for your audio.`,
    },
    {
      icon: <FaHeadphones />,
      tone: 'blue',
      title: 'Listener engagement',
      copy: totals.peak > 0
        ? `Average listeners are ${number(totals.average)} with a peak of ${number(totals.peak)}.`
        : 'Listener averages will build as completed broadcasts create analytics records.',
    },
    {
      icon: <FaBroadcastTower />,
      tone: 'purple',
      title: 'Consistent output',
      copy: `${number(totals.broadcasts)} broadcast${totals.broadcasts === 1 ? '' : 's'} in the selected period.`,
    },
    {
      icon: <FaCloudUploadAlt />,
      tone: 'soft',
      title: 'Content published',
      copy: `${number(totals.tracks)} piece${totals.tracks === 1 ? '' : 's'} of audio in your current library.`,
    },
  ];

  return (
    <section className="ean">
      <header className="ean-header">
        <div>
          <span>ANALYTICS</span>
          <h1>Your performance, in focus.</h1>
          <p>Track your broadcasts and published audio performance<br />across your station.</p>
        </div>
        <div className="ean-periods">
          {PERIODS.map((item) => (
            <button type="button" key={item.id} className={period === item.id ? 'active' : ''} onClick={() => setPeriod(item.id)}>{item.label}</button>
          ))}
          <button type="button" className="refresh" onClick={() => load(period)} disabled={loading}><FaSyncAlt /> {loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </header>

      {error && <div className="ean-alert">{error}<button type="button" onClick={() => load(period)}>Retry</button></div>}

      <section className="ean-metrics" aria-busy={loading}>
        {metrics.map((metric) => (
          <article key={metric.label}>
            <i>{metric.icon}</i>
            <div><small>{metric.label}</small><strong>{loading ? '—' : number(metric.value)}</strong><span>{loading ? 'Loading analytics…' : metric.change}</span></div>
          </article>
        ))}
      </section>

      <section className="ean-top-grid">
        <article className="ean-card ean-performance">
          <header><h2>Performance over time</h2><select value={grouping} onChange={(event) => setGrouping(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></header>
          <div className="ean-legend"><span className="blue"><i /> Listeners</span><span className="green"><i /> Average listeners</span><span className="purple"><i /> Peak listeners</span></div>
          <div className="ean-chart">
            <svg viewBox="0 0 620 220" preserveAspectRatio="none" role="img" aria-label="Broadcast listener performance chart">
              {[30, 70, 110, 150, 190].map((y) => <line key={y} x1="0" y1={y} x2="620" y2={y} className="grid" />)}
              {listenerPoints && <polyline points={listenerPoints} className="listeners" vectorEffect="non-scaling-stroke" />}
              {averagePoints && <polyline points={averagePoints} className="average" vectorEffect="non-scaling-stroke" />}
              {peakPoints && <polyline points={peakPoints} className="peak" vectorEffect="non-scaling-stroke" />}
            </svg>
            <div className="ean-axis"><span>{dateLabel(series[0]?.startTime) || 'Start'}</span><span>{dateLabel(series[Math.floor(series.length / 2)]?.startTime) || 'Selected period'}</span><span>{dateLabel(series.at(-1)?.startTime) || 'Now'}</span></div>
            {!series.length && <div className="ean-chart-empty">Trend lines will appear after broadcasts in this period.</div>}
          </div>
        </article>

        <article className="ean-card ean-top-audio">
          <header><h2>Top audio</h2><button type="button" onClick={() => onNavigate?.('Audio')}>View all audio <FaChevronRight /></button></header>
          <div className="ean-top-audio-list">
            {topTracks.length ? topTracks.slice(0, 5).map((track, index) => {
              const plays = Number(track.plays) || 0;
              return (
                <div key={track.id || track._id || index}>
                  <b>{index + 1}.</b>
                  <span><strong>{track.title || 'Untitled audio'}</strong><small>{number(plays)} plays · {number(track.likes)} likes</small><i><em style={{ width: `${(plays / maxTrackPlays) * 100}%` }} /></i></span>
                  <small>{Math.round((plays / maxTrackPlays) * 100)}%</small>
                </div>
              );
            }) : <div className="ean-empty-list">No audio performance in this period yet.</div>}
          </div>
        </article>
      </section>

      <section className="ean-bottom-grid">
        <article className="ean-card ean-broadcasts">
          <header><h2>Recent broadcasts</h2><button type="button" onClick={() => onNavigate?.('Broadcast')}>View all broadcasts <FaChevronRight /></button></header>
          <div className="ean-table-head"><span>BROADCAST</span><span>DATE & TIME</span><span>LISTENERS</span><span>PEAK</span><span>STATUS</span><span /></div>
          <div className="ean-broadcast-list">
            {recentBroadcasts.length ? recentBroadcasts.slice(0, 5).map((broadcast, index) => (
              <div key={broadcast.id || broadcast._id || index}>
                <span className="ean-broadcast-name"><i><FaBroadcastTower /></i><b>{broadcast.title || 'Untitled broadcast'}</b></span>
                <span>{dateTime(broadcast.startTime)}</span>
                <strong>{number(broadcast.listeners)}</strong>
                <strong>{number(broadcast.peakListeners)}</strong>
                <em>{broadcast.status || 'completed'}</em>
                <button type="button" onClick={() => onNavigate?.('Broadcast')} aria-label="Open Broadcast Studio"><FaEllipsisH /></button>
              </div>
            )) : <div className="ean-empty-list">No broadcasts in this period.</div>}
          </div>
        </article>

        <article className="ean-card ean-insights">
          <header><h2>Performance insights</h2></header>
          <div className="ean-insight-list">
            {insights.map((item) => (
              <div key={item.title}><i className={item.tone}>{item.icon}</i><span><strong>{item.title}</strong><small>{item.copy}</small></span></div>
            ))}
          </div>
          <button type="button" className="ean-insight-link" onClick={() => onNavigate?.('Audience')}>View audience insights <FaChevronRight /></button>
        </article>
      </section>
    </section>
  );
};

export default CreatorAnalyticsConnectedWorkspace;
