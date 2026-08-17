import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FaCheckCircle,
  FaClock,
  FaHistory,
  FaPause,
  FaPlay,
  FaSyncAlt,
  FaTrash,
} from 'react-icons/fa';

import batch6Service from '../../services/batch6Service';
import { buildMediaUrl } from '../../services/api';
import '../../styles/echoo-batch6.css';

const formatMinutes = (seconds) => Math.round((Number(seconds) || 0) / 60);

const playableTrack = (item) => {
  const track = item?.track;
  if (!track?.id || !track?.fileUrl) return null;

  return {
    ...track,
    id: track.id,
    title: track.title || 'Untitled Audio',
    subtitle:
      track.artist?.displayName ||
      track.artist?.username ||
      'Echoo Creator',
    fileUrl: buildMediaUrl(track.fileUrl),
    coverArt: buildMediaUrl(track.coverArt || null),
    duration: Number(track.duration) || 0,
    genre: track.genre || 'Audio',
  };
};

const ListenerHistoryConnected = () => {
  const {
    playTrack,
    playTrackAt,
    currentTrack,
    isPlaying,
    togglePlay,
  } = useOutletContext();

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

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
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
      if (!silent) setItems([]);
      setError(loadError?.message || 'Could not load listening history.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [load]);

  const queue = useMemo(
    () => items.map(playableTrack).filter(Boolean),
    [items]
  );

  const play = (item) => {
    const track = playableTrack(item);
    if (!track) {
      setError('This history item no longer has a playable audio file.');
      return;
    }

    const same = String(currentTrack?.id || '') === String(track.id);
    if (same) {
      togglePlay();
      return;
    }

    const progress = Math.max(0, Math.min(100, Number(item.progress) || 0));
    const resumeAt = item.completed
      ? 0
      : (track.duration * progress) / 100;

    if (playTrackAt) {
      playTrackAt(track, resumeAt, queue);
    } else {
      playTrack(track, queue);
    }
  };

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
            <strong>Your Echoo playback history.</strong>
            <small>Resume anything you have listened to from the same persistent player.</small>
          </div>

          <div className="b6-control-actions">
            <button type="button" onClick={() => load()} disabled={loading || Boolean(busyId)}>
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

            {items.map((item) => {
              const track = playableTrack(item);
              const playing = Boolean(
                track &&
                isPlaying &&
                String(currentTrack?.id || '') === String(track.id)
              );

              return (
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
                      {item.completed
                        ? 'Completed'
                        : `${Math.round(Number(item.progress) || 0)}% listened`}
                    </span>
                  </div>

                  <button
                    type="button"
                    title={playing ? 'Pause audio' : item.completed ? 'Play again' : 'Resume audio'}
                    disabled={!track}
                    onClick={() => play(item)}
                  >
                    {playing ? <FaPause /> : <FaPlay />}
                  </button>

                  <button
                    type="button"
                    title="Remove history item"
                    disabled={busyId === String(item.id)}
                    onClick={() => remove(item)}
                  >
                    <FaTrash />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default ListenerHistoryConnected;
