import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FaCheck,
  FaClock,
  FaEllipsisV,
  FaPause,
  FaPlay,
} from 'react-icons/fa';
import { GiClockwork } from 'react-icons/gi';
import Toast from '../ListenerUI/ListenerToast';
import audioService from '../../services/audioService';
import batch6Service from '../../services/batch6Service';
import '../../styles/listener-reference-pages.css';
import './ListenerHistory.css';
import './ListenerHistoryInteractionFix.css';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'stations', label: 'Stations' },
  { id: 'shows', label: 'Shows' },
  { id: 'episodes', label: 'Episodes' },
  { id: 'clips', label: 'Clips' },
];

const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours)
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const formatListeningTotal = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const relativeTime = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const WEEKDAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];

const normalizedTrack = (item) => {
  const raw = item?.track && typeof item.track === 'object' ? item.track : null;
  if (!raw) return null;
  const track = audioService.normalize(raw);
  if (!track?.id) return null;
  const duration = Number(raw.duration) || 0;
  const progress = Math.max(0, Math.min(1, Number(item.progress) || 0));
  return {
    ...track,
    duration,
    listenedSeconds: duration > 0 ? Math.round(duration * progress) : 0,
    playedAt: item.playedAt,
    entryId: item.id,
    completed: Boolean(item.completed),
  };
};

const ListenerHistoryConnected = () => {
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });
  const notify = useCallback((message, type = 'info') => {
    setToast({ open: true, type, title: type === 'error' ? 'Something went wrong' : 'History', message });
  }, []);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    totalPlays: 0,
    totalListeningTime: 0,
  });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [clearing, setClearing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const statsResult = await batch6Service.getHistoryStats();
      const raw = statsResult?.data || {};
      setStats({
        totalPlays: Number(raw.totalPlays || raw.total || 0),
        totalListeningTime: Number(raw.totalListeningTime || 0),
      });
    } catch (error) {
      console.error('History stats failed', error);
    }
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await batch6Service.getHistory({
        page: 1,
        limit: 100,
        type: 'all',
        sort: 'recent',
      });
      const raw = response?.data || {};
      const history = Array.isArray(raw.history) ? raw.history : [];
      const tracks = history.map(normalizedTrack).filter(Boolean);
      setItems(tracks);
      if (!silent) await loadStats();
    } catch (error) {
      console.error('History load failed', error);
      if (!silent) notify('Could not load listening history', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadStats, notify]);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, 20000);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    const key = String(tab).toLowerCase();
    return items.filter((t) => {
      const genre = String(t.genre || '').toLowerCase();
      const title = String(t.title || '').toLowerCase();
      return genre.includes(key) || title.includes(key);
    });
  }, [items, tab]);

  const patterns = useMemo(() => {
    const byGenre = {};
    const byDay = new Array(7).fill(0);
    let sessionTotal = 0;
    let sessions = 0;
    items.forEach((t) => {
      const g = t.genre || 'Unknown';
      byGenre[g] = (byGenre[g] || 0) + 1;
      if (t.playedAt) {
        const d = new Date(t.playedAt);
        if (!Number.isNaN(d.getTime())) byDay[d.getDay()] += 1;
      }
      if (t.listenedSeconds > 0) {
        sessionTotal += t.listenedSeconds;
        sessions += 1;
      }
    });
    const sorted = Object.entries(byGenre).sort((a, b) => b[1] - a[1]);
    const topGenre = sorted[0];
    const topDayIdx = byDay.indexOf(Math.max(...byDay));
    const dayTotal = byDay.reduce((a, b) => a + b, 0);
    return {
      topCategory: topGenre ? topGenre[0] : '—',
      topCategoryShare:
        items.length > 0 && topGenre
          ? Math.round((topGenre[1] / items.length) * 100)
          : 0,
      mostActiveDay: dayTotal > 0 ? WEEKDAYS[topDayIdx] : '—',
      mostActiveDayShare: dayTotal > 0 ? Math.round((byDay[topDayIdx] / dayTotal) * 100) : 0,
      avgSessionMinutes:
        sessions > 0 ? Math.max(1, Math.round(sessionTotal / sessions / 60)) : 0,
    };
  }, [items]);

  const timeSummary = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    let today = 0;
    let week = 0;
    items.forEach((t) => {
      if (!t.playedAt) return;
      const ms = new Date(t.playedAt).getTime();
      if (ms >= todayStart) today += t.listenedSeconds || 0;
      if (ms >= weekStart) week += t.listenedSeconds || 0;
    });
    return { today, week, total: stats.totalListeningTime };
  }, [items, stats.totalListeningTime]);

  const handleClear = async () => {
    if (busyId || clearing || items.length === 0) return;
    try {
      setClearing(true);
      await batch6Service.clearHistory();
      setItems([]);
      await loadStats();
      notify('Listening history cleared', 'success');
    } catch (error) {
      console.error('Clear history failed', error);
      notify('Could not clear history', 'error');
    } finally {
      setClearing(false);
    }
  };

  const handleRemove = async (entryId) => {
    if (busyId) return;
    try {
      setBusyId(String(entryId));
      await batch6Service.removeHistoryItem(String(entryId));
      setItems((prev) => prev.filter((t) => String(t.entryId) !== String(entryId)));
      await loadStats();
      notify('Removed from history', 'success');
    } catch (error) {
      console.error('Remove history item failed', error);
      notify('Could not remove item', 'error');
    } finally {
      setBusyId('');
    }
  };

  const isCurrent = (track) =>
    Boolean(currentTrack && currentTrack.id && String(currentTrack.id) === String(track.id));

  const handleRowClick = (track) => {
    if (isCurrent(track)) {
      togglePlay();
      return;
    }
    playTrack(track);
  };

  return (
    <div className="lh-page">
      <div className="lh-header">
        <div>
          <h1>History</h1>
          <p className="lh-subtitle">Audio you&rsquo;ve listened to recently across Echoo.</p>
        </div>
      </div>

      <div className="lh-tabs-row">
        <div className="lh-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`lh-tab ${tab === t.id ? 'lh-tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lh-body">
        <div className="lh-main">
          <div className="lh-section-header">
            <h2>Recently listened</h2>
            <button
              type="button"
              className="lh-clear-btn"
              onClick={handleClear}
              disabled={clearing || items.length === 0}
            >
              {clearing ? 'Clearing…' : 'Clear history'}
            </button>
          </div>

          {loading ? (
            <div className="lh-empty lh-empty-loading">Loading your listening history…</div>
          ) : filtered.length === 0 ? (
            <div className="lh-empty">
              <FaClock />
              <strong>
                {items.length === 0
                  ? 'No listening history yet.'
                  : 'Nothing matches this filter.'}
              </strong>
              <p>
                {items.length === 0
                  ? 'Start playing audio and your history will appear here.'
                  : 'Try a different filter to see more of your history.'}
              </p>
            </div>
          ) : (
            <div className="lh-list">
              {filtered.map((track) => {
                const current = isCurrent(track);
                const removing = busyId === String(track.entryId);
                return (
                  <div
                    key={track.entryId}
                    className={`lh-row ${current && isPlaying ? 'lh-row-current' : ''}`}
                  >
                    <button
                      type="button"
                      className="lh-row-art lh-row-art-button"
                      onClick={() => handleRowClick(track)}
                      aria-label={`${current && isPlaying ? 'Pause' : 'Play'} ${track.title || 'history item'}`}
                    >
                      <img src={track.coverArt} alt="" loading="lazy" />
                      <span className="lh-row-art-icon" aria-hidden="true">
                        {current && isPlaying ? <FaPause /> : <FaPlay />}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="lh-row-info lh-row-info-button"
                      onClick={() => handleRowClick(track)}
                    >
                      <span className="lh-row-title">{track.title}</span>
                      <span className="lh-row-sub">
                        {track.artistName || 'Unknown creator'}
                        {track.genre ? ` · ${track.genre}` : ''}
                      </span>
                    </button>
                    <span className="lh-row-meta">
                      <span className="lh-row-duration">{formatTime(track.duration)}</span>
                      <span className="lh-row-when">{relativeTime(track.playedAt)}</span>
                    </span>
                    <span className="lh-row-actions">
                      {track.completed && (
                        <span className="lh-row-check" title="Completed">
                          <FaCheck />
                        </span>
                      )}
                      <button
                        type="button"
                        className={`lh-row-more ${removing ? 'lh-more-busy' : ''}`}
                        title={removing ? 'Removing…' : 'Remove from history'}
                        aria-label={removing ? `Removing ${track.title || 'history item'}` : `Remove ${track.title || 'history item'} from history`}
                        disabled={removing}
                        onClick={() => handleRemove(track.entryId)}
                      >
                        <FaEllipsisV />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lh-sidebar">
          <div className="lh-card lh-summary-card">
            <div className="lh-card-header">
              <h3>History summary</h3>
              <span className="lh-summary-icon" aria-hidden="true">
                <GiClockwork />
              </span>
            </div>
            <div className="lh-summary-grid">
              <div className="lh-summary-cell">
                <span className="lh-summary-label">Today</span>
                <span className="lh-summary-value lh-summary-blue">
                  {formatListeningTotal(timeSummary.today)}
                </span>
                <span className="lh-summary-sub">Listening time</span>
              </div>
              <div className="lh-summary-cell">
                <span className="lh-summary-label">This week</span>
                <span className="lh-summary-value lh-summary-dark">
                  {formatListeningTotal(timeSummary.week)}
                </span>
                <span className="lh-summary-sub">Listening time</span>
              </div>
              <div className="lh-summary-cell">
                <span className="lh-summary-label">All time</span>
                <span className="lh-summary-value lh-summary-blue">
                  {formatListeningTotal(timeSummary.total)}
                </span>
                <span className="lh-summary-sub">All time listening</span>
              </div>
              <div className="lh-summary-cell">
                <span className="lh-summary-label">Total</span>
                <span className="lh-summary-value lh-summary-dark">
                  {formatListeningTotal(stats.totalListeningTime)}
                </span>
                <span className="lh-summary-sub">Tracked listening</span>
              </div>
            </div>
          </div>

          <div className="lh-card lh-patterns-card">
            <div className="lh-card-header">
              <h3>Your listening patterns</h3>
            </div>
            <div className="lh-pattern">
              <span className="lh-pattern-label">Top category</span>
              <span className="lh-pattern-value">{patterns.topCategory}</span>
              <span className="lh-pattern-sub">
                {patterns.topCategoryShare > 0
                  ? `${patterns.topCategoryShare}% of your listening`
                  : 'No data yet'}
              </span>
            </div>
            <div className="lh-pattern">
              <span className="lh-pattern-label">Most active day</span>
              <span className="lh-pattern-value">{patterns.mostActiveDay}</span>
              <span className="lh-pattern-sub">
                {patterns.mostActiveDayShare > 0
                  ? `${patterns.mostActiveDayShare}% of your listening`
                  : 'No data yet'}
              </span>
            </div>
            <div className="lh-pattern">
              <span className="lh-pattern-label">Average session</span>
              <span className="lh-pattern-value">
                {patterns.avgSessionMinutes > 0 ? `${patterns.avgSessionMinutes}m` : '—'}
              </span>
              <span className="lh-pattern-sub">Per listening session</span>
            </div>
          </div>
        </div>
      </div>
      <Toast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </div>
  );
};

export default ListenerHistoryConnected;