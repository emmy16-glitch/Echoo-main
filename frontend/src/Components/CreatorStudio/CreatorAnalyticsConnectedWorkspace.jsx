import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiCalendar,
  FiClock,
  FiHeadphones,
  FiPlay,
  FiUsers,
} from 'react-icons/fi';

import batch6Service from '../../services/batch6Service';
import './CreatorAnalyticsReference.css';

const PERIODS = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
];

const count = (value) => new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0));

const duration = (seconds) => {
  const safe = Math.max(0, Number(seconds) || 0);
  if (!safe) return '—';
  const minutes = Math.floor(safe / 60);
  const remainingSeconds = Math.round(safe % 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m ${remainingSeconds}s`;
};

const dateLabel = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const timeLabel = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const changeCopy = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return fallback;
  return `${numeric > 0 ? '+' : '−'}${Math.abs(numeric).toFixed(1).replace('.0', '')}% vs prior period`;
};

const chartPoints = (rows, accessor, maximum) => rows.map((row, index) => {
  const width = 1000;
  const height = 250;
  const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * width;
  const y = height - ((Math.max(0, Number(accessor(row)) || 0) / maximum) * 190) - 28;
  return { x, y, value: Math.max(0, Number(accessor(row)) || 0), row };
});

function ListeningChart({ rows }) {
  const [hovered, setHovered] = useState(null);
  const maximum = Math.max(1, ...rows.flatMap((row) => [Number(row.listeners) || 0, Number(row.newListeners) || 0]));
  const listenerPoints = chartPoints(rows, (row) => row.listeners, maximum);
  const newListenerPoints = chartPoints(rows, (row) => row.newListeners, maximum);
  const polyline = (points) => points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const selected = hovered === null ? null : rows[hovered];

  return (
    <section className="analytics-chart-card" aria-labelledby="listening-activity-title">
      <header><div><h2 id="listening-activity-title">Listening activity</h2><div className="analytics-legend"><span className="listeners">Listeners</span><span className="new-listeners">New listeners</span></div></div></header>
      <div className="analytics-chart" role="img" aria-label="Listening activity from recorded analytics">
        {rows.length ? <svg viewBox="0 0 1000 250" preserveAspectRatio="none">
          {[32, 80, 128, 176, 222].map((y) => <line key={y} x1="0" y1={y} x2="1000" y2={y} className="analytics-grid-line" />)}
          <polyline points={polyline(listenerPoints)} className="analytics-listener-line" vectorEffect="non-scaling-stroke" />
          <polyline points={polyline(newListenerPoints)} className="analytics-new-listener-line" vectorEffect="non-scaling-stroke" />
          {listenerPoints.map((point, index) => <circle key={`listener-${index}`} cx={point.x} cy={point.y} r="7" className="analytics-point" tabIndex="0" onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}><title>{`${dateLabel(point.row.date)}: ${count(point.value)} listeners`}</title></circle>)}
        </svg> : <div className="analytics-chart-empty">Listening trend data will appear after completed broadcasts create analytics records.</div>}
        {selected && <div className="analytics-tooltip"><strong>{dateLabel(selected.date)}</strong><span>{count(selected.listeners)} listeners</span><span>{count(selected.newListeners)} new listeners</span></div>}
      </div>
      <div className="analytics-axis"><span>{dateLabel(rows[0]?.date)}</span><span>{dateLabel(rows[Math.floor(rows.length / 2)]?.date)}</span><span>{dateLabel(rows.at(-1)?.date)}</span></div>
    </section>
  );
}

export default function CreatorAnalyticsConnectedWorkspace() {
  const [period, setPeriod] = useState('30d');
  const [overview, setOverview] = useState(null);
  const [recentBroadcasts, setRecentBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (selectedPeriod) => {
    try {
      setLoading(true);
      setError('');
      const [overviewResponse, contentResponse] = await Promise.all([
        batch6Service.getAnalyticsOverview(selectedPeriod),
        batch6Service.getContentAnalytics(selectedPeriod),
      ]);
      setOverview(overviewResponse?.data || {});
      setRecentBroadcasts(Array.isArray(contentResponse?.data?.recentBroadcasts) ? contentResponse.data.recentBroadcasts : []);
    } catch (loadError) {
      setOverview(null);
      setRecentBroadcasts([]);
      setError(loadError?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  const metrics = overview?.overview || {};
  const changes = overview?.changes || {};
  const activity = useMemo(() => (Array.isArray(overview?.listenerActivity) ? overview.listenerActivity : []).filter((row) => row?.date).sort((first, second) => new Date(first.date) - new Date(second.date)), [overview]);
  const cards = [
    { label: 'Followers', value: count(metrics.totalFollowers), note: changeCopy(changes.followers, 'No change data yet'), icon: <FiUsers /> },
    { label: 'Listeners', value: count(metrics.totalListeners), note: changeCopy(changes.listeners, 'No comparison data yet'), icon: <FiHeadphones /> },
    { label: 'Avg. listening time', value: duration(metrics.averageListenDuration), note: metrics.averageListenDuration ? 'Average recorded in this period' : 'No listening-time data yet', icon: <FiClock /> },
  ];

  return (
    <section className="analytics-reference" aria-labelledby="analytics-reference-title">
      <header className="analytics-reference-header">
        <div><h1 id="analytics-reference-title">Analytics</h1><p>Track audience growth and listening performance.</p></div>
        <label className="analytics-period"><FiCalendar /><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Analytics date range">{PERIODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      </header>
      {error && <div className="analytics-alert" role="alert">{error}<button type="button" onClick={() => load(period)}>Retry</button></div>}
      <section className="analytics-kpis" aria-busy={loading}>{cards.map((card) => <article key={card.label}><i>{card.icon}</i><div><small>{card.label}</small><strong>{loading ? '—' : card.value}</strong><span>{loading ? 'Loading analytics…' : card.note}</span></div></article>)}</section>
      <ListeningChart rows={activity} />
      <section className="analytics-recent" aria-labelledby="recent-broadcasts-title"><header><h2 id="recent-broadcasts-title">Recent broadcasts</h2></header><div className="analytics-recent-head" aria-hidden="true"><span>Broadcast</span><span>Listeners</span><span>Avg. listening time</span><span /></div>{loading ? <div className="analytics-recent-empty">Loading recent broadcasts…</div> : recentBroadcasts.length ? recentBroadcasts.slice(0, 5).map((broadcast) => <div className="analytics-recent-row" key={broadcast.id || `${broadcast.title}-${broadcast.startTime}`}><span className="analytics-broadcast-name">{broadcast.replayUrl ? <button type="button" aria-label={`Play recording of ${broadcast.title || 'broadcast'}`} onClick={() => window.open(broadcast.replayUrl, '_blank', 'noopener,noreferrer')}><FiPlay /></button> : <i><FiHeadphones /></i>}<strong>{broadcast.title || 'Untitled broadcast'}</strong><small>{timeLabel(broadcast.startTime)}</small></span><strong>{count(broadcast.listeners)}</strong><span>{duration(broadcast.averageListenDuration)}</span><span className="analytics-status">{broadcast.status || 'completed'}</span></div>) : <div className="analytics-recent-empty">No broadcasts in this date range.</div>}</section>
    </section>
  );
}
