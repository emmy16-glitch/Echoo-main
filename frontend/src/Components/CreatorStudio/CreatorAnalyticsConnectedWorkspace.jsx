import { useCallback, useEffect, useState } from 'react';
import {
  FaBroadcastTower,
  FaChartLine,
  FaHeadphones,
  FaPlay,
  FaSyncAlt,
  FaUsers,
} from 'react-icons/fa';

import batch6Service from '../../services/batch6Service';
import '../../styles/echoo-batch6.css';

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

const CreatorAnalyticsConnectedWorkspace = () => {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (selectedPeriod) => {
    try {
      setLoading(true);
      setError('');
      const response = await batch6Service.getTrustedAnalytics(selectedPeriod);
      setData(response);
    } catch (loadError) {
      setData(null);
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
  const recentBroadcasts = Array.isArray(data?.recentBroadcasts)
    ? data.recentBroadcasts
    : [];

  const totals = {
    plays: Number(summary.totalPlays ?? overview.totalPlays) || 0,
    followers: Number(overview.totalFollowers) || 0,
    average: Number(overview.avgListeners) || 0,
    peak: Number(overview.peakListeners) || 0,
    broadcasts: Number(contentByType?.broadcasts?.count) || 0,
    tracks: Number(summary.totalTracks ?? overview.totalTracks) || 0,
  };

  const hasActivity =
    totals.plays > 0 ||
    totals.followers > 0 ||
    totals.average > 0 ||
    totals.peak > 0 ||
    totals.broadcasts > 0 ||
    totals.tracks > 0 ||
    topTracks.length > 0 ||
    recentBroadcasts.length > 0;

  return (
    <div className="b6-analytics-wrap">
      <section className="b6-analytics-trust">
        <header>
          <div>
            <span className="b6-kicker">ANALYTICS</span>
            <h2>Performance.</h2>
            <p>See how your broadcasts and published audio are performing.</p>
          </div>
          <button type="button" onClick={() => load(period)} disabled={loading}>
            <FaSyncAlt /> {loading ? 'Loading...' : 'Refresh'}
          </button>
        </header>

        <div className="b6-periods" aria-label="Analytics period">
          {PERIODS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={period === item.id ? 'active' : ''}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && <div className="b6-alert error">{error}</div>}

        {hasActivity && (
          <div className="b6-metric-grid">
            <article><FaPlay /><div><strong>{number(totals.plays)}</strong><span>Total plays</span></div></article>
            <article><FaUsers /><div><strong>{number(totals.followers)}</strong><span>Followers</span></div></article>
            <article><FaHeadphones /><div><strong>{number(totals.average)}</strong><span>Average listeners</span></div></article>
            <article><FaChartLine /><div><strong>{number(totals.peak)}</strong><span>Peak listeners</span></div></article>
            <article><FaBroadcastTower /><div><strong>{number(totals.broadcasts)}</strong><span>Broadcasts</span></div></article>
            <article><FaChartLine /><div><strong>{number(totals.tracks)}</strong><span>Published audio</span></div></article>
          </div>
        )}
      </section>

      {!loading && !error && !hasActivity ? (
        <section className="b6-analytics-empty">
          <div className="b6-analytics-empty-inner">
            <div className="b6-analytics-empty-icon"><FaChartLine /></div>
            <h2>Your analytics start with your first listeners.</h2>
            <p>
              Go live or publish audio. Plays, listener peaks, followers and broadcast performance
              will appear here as real activity arrives.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="b6-analytics-trust">
            <header>
              <div>
                <span className="b6-kicker">TOP AUDIO</span>
                <h2>Your most played audio.</h2>
                <p>Recordings ranked by the real play totals available for this period.</p>
              </div>
            </header>
            {topTracks.length === 0 ? (
              <div className="b6-data-boundary">No audio performance in this period yet.</div>
            ) : (
              <div className="b6-history-manager">
                {topTracks.map((track, index) => (
                  <div className="b6-history-manage-row" key={track.id || track._id}>
                    <div>
                      <strong>{index + 1}. {track.title || 'Untitled audio'}</strong>
                      <span>{number(track.plays)} plays · {number(track.likes)} likes</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="b6-analytics-trust">
            <header>
              <div>
                <span className="b6-kicker">BROADCASTS</span>
                <h2>Recent broadcasts.</h2>
                <p>Your latest sessions and the listener totals Echoo has recorded.</p>
              </div>
            </header>
            {recentBroadcasts.length === 0 ? (
              <div className="b6-data-boundary">No broadcasts in this period.</div>
            ) : (
              <div className="b6-history-manager">
                {recentBroadcasts.map((broadcast) => (
                  <div className="b6-history-manage-row" key={broadcast.id || broadcast._id}>
                    <div>
                      <strong>{broadcast.title || 'Untitled broadcast'}</strong>
                      <span>
                        {dateTime(broadcast.startTime)} · {number(broadcast.listeners)} listeners
                        {Number(broadcast.peakListeners) > 0
                          ? ` · ${number(broadcast.peakListeners)} peak`
                          : ''}
                      </span>
                    </div>
                    <span>{broadcast.status || 'completed'}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default CreatorAnalyticsConnectedWorkspace;
