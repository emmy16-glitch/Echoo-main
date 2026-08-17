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
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
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

  return (
    <div className="b6-analytics-wrap">
      <section className="b6-analytics-trust">
        <header>
          <div>
            <span className="b6-kicker">RECORDED ANALYTICS</span>
            <h2>Performance Echoo can actually measure.</h2>
            <p>
              No estimated geography, random trends, invented audience segments or
              synthetic percentages are shown.
            </p>
          </div>

          <button type="button" onClick={() => load(period)} disabled={loading}>
            <FaSyncAlt /> {loading ? 'Loading...' : 'Refresh'}
          </button>
        </header>

        <div className="b6-periods">
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

        <div className="b6-metric-grid">
          <article>
            <FaPlay />
            <div>
              <strong>{number(summary.totalPlays ?? overview.totalPlays)}</strong>
              <span>Total plays</span>
            </div>
          </article>
          <article>
            <FaUsers />
            <div>
              <strong>{number(overview.totalFollowers)}</strong>
              <span>Followers</span>
            </div>
          </article>
          <article>
            <FaHeadphones />
            <div>
              <strong>{number(overview.avgListeners)}</strong>
              <span>Avg recorded listeners</span>
            </div>
          </article>
          <article>
            <FaChartLine />
            <div>
              <strong>{number(overview.peakListeners)}</strong>
              <span>Peak listeners</span>
            </div>
          </article>
          <article>
            <FaBroadcastTower />
            <div>
              <strong>{number(contentByType?.broadcasts?.count)}</strong>
              <span>Broadcasts in period</span>
            </div>
          </article>
          <article>
            <FaChartLine />
            <div>
              <strong>{number(summary.totalTracks ?? overview.totalTracks)}</strong>
              <span>Published audio</span>
            </div>
          </article>
        </div>

        <div className="b6-data-boundary">
          Track play/like counters are cumulative. Broadcast analytics are limited to
          the selected window. Unsupported demographic fields remain empty instead of
          being estimated.
        </div>
      </section>

      <section className="b6-analytics-trust">
        <header>
          <div>
            <span className="b6-kicker">TOP AUDIO</span>
            <h2>Published audio by recorded plays.</h2>
          </div>
        </header>

        {topTracks.length === 0 ? (
          <div className="b6-data-boundary">No published audio analytics yet.</div>
        ) : (
          <div className="b6-history-manager">
            {topTracks.map((track) => (
              <div className="b6-history-manage-row" key={track.id || track._id}>
                <div>
                  <strong>{track.title || 'Untitled audio'}</strong>
                  <span>
                    {number(track.plays)} plays · {number(track.likes)} likes
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="b6-analytics-trust">
        <header>
          <div>
            <span className="b6-kicker">BROADCAST HISTORY</span>
            <h2>Recent broadcasts in this analytics window.</h2>
          </div>
        </header>

        {recentBroadcasts.length === 0 ? (
          <div className="b6-data-boundary">No broadcasts recorded in this period.</div>
        ) : (
          <div className="b6-history-manager">
            {recentBroadcasts.map((broadcast) => (
              <div
                className="b6-history-manage-row"
                key={broadcast.id || broadcast._id}
              >
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
    </div>
  );
};

export default CreatorAnalyticsConnectedWorkspace;
