import { useCallback, useEffect, useState } from 'react';
import {
  FaCheckCircle,
  FaClock,
  FaHistory,
  FaSyncAlt,
  FaTrash,
} from 'react-icons/fa';

import batch6Service from '../../services/batch6Service';
import '../../styles/echoo-batch6.css';

const formatMinutes = (seconds) => Math.round((Number(seconds) || 0) / 60);

const ListenerHistoryConnected = () => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    totalPlays: 0,
    completedItems: 0,
    completionRate: 0,
    totalListeningTime: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [historyResult, statsResult] = await Promise.all([
        batch6Service.getHistory({
          page: 1,
          limit: 100,
          type: 'all',
          sort: 'recent',
        }),
        batch6Service.getHistoryStats(),
      ]);

      setItems(
        Array.isArray(historyResult?.data?.history)
          ? historyResult.data.history
          : []
      );
      setStats({
        totalPlays: Number(statsResult?.data?.totalPlays) || 0,
        completedItems: Number(statsResult?.data?.completedItems) || 0,
        completionRate: Number(statsResult?.data?.completionRate) || 0,
        totalListeningTime: Number(statsResult?.data?.totalListeningTime) || 0,
      });
    } catch (loadError) {
      setItems([]);
      setError(loadError?.message || 'Could not load listening history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (item) => {
    if (!item?.id || busyId) return;

    try {
      setBusyId(String(item.id));
      setMessage('');
      setError('');
      await batch6Service.removeHistoryItem(item.id);
      setItems((current) =>
        current.filter((entry) => String(entry.id) !== String(item.id))
      );
      setMessage('History item removed.');
      const statsResult = await batch6Service.getHistoryStats();
      setStats({
        totalPlays: Number(statsResult?.data?.totalPlays) || 0,
        completedItems: Number(statsResult?.data?.completedItems) || 0,
        completionRate: Number(statsResult?.data?.completionRate) || 0,
        totalListeningTime: Number(statsResult?.data?.totalListeningTime) || 0,
      });
    } catch (removeError) {
      setError(removeError?.message || 'Could not remove history item.');
    } finally {
      setBusyId('');
    }
  };

  const clear = async () => {
    if (busyId || stats.totalPlays === 0) return;
    if (!window.confirm('Clear your entire Echoo listening history?')) return;

    try {
      setBusyId('clear');
      setMessage('');
      setError('');
      await batch6Service.clearHistory();
      setItems([]);
      setStats({
        totalPlays: 0,
        completedItems: 0,
        completionRate: 0,
        totalListeningTime: 0,
      });
      setMessage('Listening history cleared.');
    } catch (clearError) {
      setError(clearError?.message || 'Could not clear listening history.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="b6-history-wrap">
      <section className="b6-history-control">
        <div className="b6-history-control-head">
          <div>
            <span className="b6-kicker">LISTENING HISTORY</span>
            <strong>Your real Echoo playback history.</strong>
            <small>Only activity recorded by the History API is shown here.</small>
          </div>

          <div className="b6-control-actions">
            <button type="button" onClick={load} disabled={loading || Boolean(busyId)}>
              <FaSyncAlt /> {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              type="button"
              className="danger"
              onClick={clear}
              disabled={busyId === 'clear' || stats.totalPlays === 0}
            >
              <FaTrash /> {busyId === 'clear' ? 'Clearing...' : 'Clear all'}
            </button>
          </div>
        </div>

        <div className="b6-history-stats">
          <article>
            <FaHistory />
            <div><strong>{stats.totalPlays}</strong><span>plays</span></div>
          </article>
          <article>
            <FaCheckCircle />
            <div><strong>{stats.completedItems}</strong><span>completed</span></div>
          </article>
          <article>
            <FaCheckCircle />
            <div><strong>{stats.completionRate}%</strong><span>completion rate</span></div>
          </article>
          <article>
            <FaClock />
            <div>
              <strong>{formatMinutes(stats.totalListeningTime)}</strong>
              <span>minutes</span>
            </div>
          </article>
        </div>

        {message && <div className="b6-alert success">{message}</div>}
        {error && <div className="b6-alert error">{error}</div>}

        {loading ? (
          <div className="b6-manager-empty">Loading listening history...</div>
        ) : items.length === 0 ? (
          <div className="b6-manager-empty">No listening history yet.</div>
        ) : (
          <div className="b6-history-manager">
            <header>
              <strong>Recent activity</strong>
              <span>{items.length} recorded item{items.length === 1 ? '' : 's'}</span>
            </header>

            {items.map((item) => (
              <div key={item.id} className="b6-history-manage-row">
                <div>
                  <strong>{item.track?.title || 'Unavailable audio'}</strong>
                  <span>
                    {item.track?.artist?.displayName ||
                      item.track?.artist?.username ||
                      'Echoo'}
                    {' · '}
                    {item.playedAt
                      ? new Date(item.playedAt).toLocaleString()
                      : 'Unknown time'}
                    {' · '}
                    {item.completed ? 'Completed' : 'In progress'}
                  </span>
                </div>

                <button
                  type="button"
                  title="Remove history item"
                  disabled={busyId === String(item.id)}
                  onClick={() => remove(item)}
                >
                  <FaTrash />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ListenerHistoryConnected;
