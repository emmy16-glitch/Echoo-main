import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBroadcastTower,
  FaDownload,
  FaHeadphones,
  FaMapMarkerAlt,
  FaMobileAlt,
  FaShareAlt,
  FaTrophy,
  FaUserPlus,
  FaUsers,
} from 'react-icons/fa';

import { apiRequest, buildMediaUrl } from '../../services/api.js';
import batch2Service from '../../services/batch2Service.js';
import batch6Service from '../../services/batch6Service.js';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding.js';
import './CreatorAudienceReference.css';

const PERIODS = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
];

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US').format(Number(value) || 0);

const formatPercent = (value) => `${Math.max(0, Number(value) || 0).toFixed(1).replace('.0', '')}%`;

const changeText = (value, fallback = 'No prior-period change') => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return fallback;
  return `${numeric > 0 ? '↑' : '↓'} ${Math.abs(numeric).toFixed(1).replace('.0', '')}% vs previous period`;
};

const timeAgo = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const polylinePoints = (items, width = 520, height = 170) => {
  if (!items.length) return '';
  const values = items.map((item) => Number(item.count) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  return items.map((item, index) => {
    const x = items.length === 1 ? width / 2 : (index / (items.length - 1)) * width;
    const y = height - (((Number(item.count) || 0) - min) / range) * (height - 24) - 12;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
};

const stationArtwork = (station) => {
  const custom = buildMediaUrl(station?.logo || station?.image || null);
  return custom || buildGeneratedStationBrandCoverUrl(station || {});
};

const CreatorAudienceWorkspace = ({ audience = null, loading: shellLoading = false, onNavigate }) => {
  const [period, setPeriod] = useState('30d');
  const [analytics, setAnalytics] = useState(null);
  const [overview, setOverview] = useState(null);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [audienceResult, overviewResult, stationsResult] = await Promise.allSettled([
        apiRequest(`/analytics/audience?period=${encodeURIComponent(period)}`),
        batch6Service.getAnalyticsOverview(period),
        batch2Service.getMyStations(),
      ]);

      setAnalytics(audienceResult.status === 'fulfilled' ? audienceResult.value?.data || null : null);
      setOverview(overviewResult.status === 'fulfilled' ? overviewResult.value?.data?.overview || null : null);
      setStations(
        stationsResult.status === 'fulfilled' && Array.isArray(stationsResult.value?.data)
          ? stationsResult.value.data
          : []
      );

      if (audienceResult.status === 'rejected' && overviewResult.status === 'rejected') {
        throw audienceResult.reason || overviewResult.reason;
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not load audience insights.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const legacyFollowers = Array.isArray(audience?.followers) ? audience.followers : [];
  const recentFollowers = Array.isArray(analytics?.recentFollowers)
    ? analytics.recentFollowers
    : legacyFollowers.map((item) => ({
        id: item.id || item._id,
        displayName: item.displayName || item.username,
        username: item.username,
        followedAt: item.createdAt,
      }));

  const totalListeners = Number(overview?.totalListeners) || 0;
  const newFollowers = Number(analytics?.followers?.addedThisPeriod) || 0;
  const listeningNow = Number(audience?.topListeners?.total) || 0;
  const returningListeners = Number(analytics?.returningListeners?.total) || 0;
  const engagementRate = Number(analytics?.engagementRate?.rate ?? overview?.engagementRate) || 0;

  const metrics = [
    {
      label: 'Total listeners',
      value: formatNumber(totalListeners),
      icon: <FaUsers />,
      change: changeText(overview?.changes?.listeners),
    },
    {
      label: 'New followers',
      value: formatNumber(newFollowers),
      icon: <FaUserPlus />,
      change: changeText(analytics?.followers?.change),
    },
    {
      label: 'Listening now',
      value: formatNumber(listeningNow),
      icon: <FaHeadphones />,
      change: listeningNow > 0 ? 'Live audience right now' : 'No live listeners right now',
    },
    {
      label: 'Returning listeners',
      value: formatNumber(returningListeners),
      icon: <FaUsers />,
      change: changeText(analytics?.returningListeners?.change),
    },
    {
      label: 'Engagement rate',
      value: formatPercent(engagementRate),
      icon: <FaBroadcastTower />,
      change: changeText(analytics?.engagementRate?.change),
    },
  ];

  const followerSeries = Array.isArray(overview?.followerGrowth?.data)
    ? overview.followerGrowth.data
    : [];
  const chartPoints = polylinePoints(followerSeries);

  const topStations = useMemo(
    () => [...stations]
      .sort((a, b) => {
        const aScore = Number(a.listeningNow ?? a.listenerCount ?? a.followerCount) || 0;
        const bScore = Number(b.listeningNow ?? b.listenerCount ?? b.followerCount) || 0;
        return bScore - aScore;
      })
      .slice(0, 5),
    [stations]
  );

  const engagementTotal = Math.max(1, returningListeners + Number(analytics?.newListeners?.total || 0));
  const returningShare = Math.round((returningListeners / engagementTotal) * 100);
  const newShare = Math.max(0, 100 - returningShare);

  const exportAudience = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total listeners', totalListeners],
      ['New followers', newFollowers],
      ['Listening now', listeningNow],
      ['Returning listeners', returningListeners],
      ['Engagement rate', engagementRate],
      [],
      ['Recent followers', 'Followed at'],
      ...recentFollowers.map((follower) => [
        follower.displayName || follower.username || 'Echoo listener',
        follower.followedAt || '',
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `echoo-audience-${period}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = loading || shellLoading;

  return (
    <section className="eau">
      <header className="eau-header">
        <div>
          <span>CREATOR STUDIO</span>
          <h1>Audience</h1>
          <p>Understand your listeners, track community growth,<br />and keep your audience engaged.</p>
        </div>
        <div className="eau-header-actions">
          <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Audience period">
            {PERIODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button type="button" onClick={exportAudience}><FaDownload /> Export</button>
        </div>
      </header>

      {error && <div className="eau-alert">{error}<button type="button" onClick={load}>Retry</button></div>}

      <section className="eau-metrics" aria-busy={isLoading}>
        {metrics.map((metric) => (
          <article key={metric.label}>
            <i>{metric.icon}</i>
            <div><small>{metric.label}</small><strong>{isLoading ? '—' : metric.value}</strong><span>{isLoading ? 'Loading audience data…' : metric.change}</span></div>
          </article>
        ))}
      </section>

      <section className="eau-main-grid">
        <article className="eau-card eau-overview">
          <header><h2>Audience overview</h2></header>
          <div className="eau-chart-wrap">
            <div className="eau-chart-main">
              <div className="eau-chart-legend"><span><i /> Followers</span><span className="muted"><i /> Current period</span></div>
              <svg viewBox="0 0 520 210" preserveAspectRatio="none" role="img" aria-label="Follower growth chart">
                {[35, 75, 115, 155, 195].map((y) => <line key={y} x1="0" y1={y} x2="520" y2={y} className="grid" />)}
                {chartPoints ? <polyline points={chartPoints} className="series" vectorEffect="non-scaling-stroke" /> : null}
              </svg>
              <div className="eau-chart-axis">
                <span>{followerSeries[0]?.date || 'Start'}</span>
                <span>{followerSeries[Math.floor(followerSeries.length / 2)]?.date || 'Period'}</span>
                <span>{followerSeries.at(-1)?.date || 'Now'}</span>
              </div>
            </div>
            <aside className="eau-overview-stats">
              <div><strong>{formatNumber(totalListeners)}</strong><span>Total listeners</span></div>
              <div><strong>{formatNumber(analytics?.activeListeners?.total)}</strong><span>Avg. active listeners</span></div>
              <div><strong>{formatNumber(overview?.peakListeners)}</strong><span>Peak listeners</span></div>
            </aside>
          </div>
          <button type="button" className="eau-wide-link" onClick={() => onNavigate?.('Analytics')}>View full analytics →</button>
        </article>

        <article className="eau-card eau-top-stations">
          <header><h2>Top stations / shows</h2></header>
          <div className="eau-station-list">
            {topStations.length ? topStations.map((station, index) => {
              const listeners = Number(station.listeningNow ?? station.listenerCount) || 0;
              return (
                <div key={station.id || station._id || index}>
                  <strong>{index + 1}</strong>
                  <img src={stationArtwork(station)} alt="" />
                  <span><b>{station.name || 'Untitled station'}</b><small>{formatNumber(listeners)} listening now</small></span>
                </div>
              );
            }) : <div className="eau-empty-row">Your stations will appear here as audience activity grows.</div>}
          </div>
        </article>

        <article className="eau-card eau-engagement">
          <header><h2>Audience engagement</h2></header>
          <div className="eau-donut" style={{ background: `conic-gradient(#1769ee 0 ${Math.min(100, engagementRate)}%, #e7eef8 ${Math.min(100, engagementRate)}% 100%)` }}>
            <div><small>Engagement rate</small><strong>{formatPercent(engagementRate)}</strong><span>{changeText(analytics?.engagementRate?.change, 'Current period')}</span></div>
          </div>
          <div className="eau-engagement-legend">
            <div><span><i className="blue" /> Returning listeners</span><strong>{returningShare}%</strong></div>
            <div><span><i className="light" /> New listeners</span><strong>{newShare}%</strong></div>
          </div>
        </article>
      </section>

      <section className="eau-bottom-grid">
        <article className="eau-card eau-activity">
          <header><h2>Recent audience activity</h2><span>{recentFollowers.length ? `${recentFollowers.length} recent` : ''}</span></header>
          <div className="eau-activity-list">
            {recentFollowers.length ? recentFollowers.slice(0, 5).map((follower, index) => (
              <div key={follower.id || index}>
                <i className="blue"><FaUserPlus /></i>
                <span><strong>New follower</strong><small>{follower.displayName || follower.username || 'Echoo listener'} started following you</small></span>
                <time>{timeAgo(follower.followedAt)}</time>
              </div>
            )) : (
              <div className="eau-empty-activity"><i><FaTrophy /></i><span><strong>No recent follower activity yet</strong><small>New audience activity will appear here as listeners follow your creator profile.</small></span></div>
            )}
          </div>
        </article>

        <article className="eau-card eau-snapshot">
          <header><h2>Audience snapshot</h2><span>{PERIODS.find((item) => item.id === period)?.label}</span></header>
          <div className="eau-snapshot-columns">
            <section><h3><FaMapMarkerAlt /> Top locations</h3><p>Not collected yet</p><small>Echoo does not estimate listener location data.</small></section>
            <section><h3><FaMobileAlt /> Top device</h3><p>Not collected yet</p><small>Device analytics will appear when Echoo records them.</small></section>
            <section><h3><FaUsers /> Age range</h3><p>Not collected yet</p><small>Age demographics are intentionally not fabricated.</small></section>
          </div>
          <div className="eau-snapshot-note"><FaShareAlt /> Only real audience data collected by Echoo is shown here.</div>
        </article>
      </section>
    </section>
  );
};

export default CreatorAudienceWorkspace;
