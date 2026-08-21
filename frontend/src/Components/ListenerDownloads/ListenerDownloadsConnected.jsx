import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FaCheck,
  FaClock,
  FaEllipsisV,
  FaPause,
  FaPlay,
  FaTrash,
} from 'react-icons/fa';
import Toast from '../ListenerUI/ListenerToast';
import audioService from '../../services/audioService';
import batch6Service from '../../services/batch6Service';
import downloadService from '../../services/downloadService';
import '../../styles/listener-reference-pages.css';
import './ListenerDownloads.css';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'episodes', label: 'Episodes' },
  { id: 'shows', label: 'Shows' },
  { id: 'messages', label: 'Messages' },
  { id: 'music', label: 'Music' },
];

const STORAGE_LIMIT_GB = 25;

const formatBytes = (bytes) => {
  const total = Math.max(0, Number(bytes) || 0);
  if (total >= 1024 * 1024 * 1024)
    return `${(total / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (total >= 1024 * 1024)
    return `${(total / (1024 * 1024)).toFixed(1)} MB`;
  if (total >= 1024) return `${Math.round(total / 1024)} KB`;
  return `${total} B`;
};

const formatGb = (bytes) => {
  const gb = (Math.max(0, Number(bytes) || 0)) / (1024 * 1024 * 1024);
  return gb >= 1 ? gb.toFixed(1) : gb.toFixed(2);
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

const normalizedRow = (download) => {
  const track = download?.track && typeof download.track === 'object' ? download.track : null;
  if (!track) return null;
  const normalized = audioService.normalize(track);
  if (!normalized?.id) return null;
  const duration = Number(track.duration) || 0;
  const progress = Math.max(0, Math.min(1, Number(download.progress) || 0));
  return {
    ...normalized,
    downloadId: download.id,
    duration,
    listenedSeconds: duration > 0 ? Math.round(duration * progress) : 0,
    fileSize: Number(download.fileSize) || 0,
    downloadedSize: Number(download.downloadedSize) || 0,
    status: download.status || 'completed',
    downloadedAt: download.createdAt,
    genre: track.genre || null,
    completed: progress >= 1,
  };
};

const ListenerDownloadsConnected = () => {
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });
  const notify = useCallback((message, type = 'info') => {
    setToast({
      open: true,
      type,
      title: type === 'error' ? 'Something went wrong' : 'Downloads',
      message,
    });
  }, []);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [playingId, setPlayingId] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await batch6Service.getDownloads({ page: 1, limit: 100 });
      const raw = response?.data || {};
      const downloads = Array.isArray(raw.downloads) ? raw.downloads : [];
      setItems(downloads.map(normalizedRow).filter(Boolean));
    } catch (error) {
      console.error('Downloads load failed', error);
      if (!silent) notify('Could not load downloads', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    const key = String(tab).toLowerCase();
    return items.filter((t) => String(t.genre || '').toLowerCase().includes(key));
  }, [items, tab]);

  const storage = useMemo(() => {
    const usedBytes = items.reduce(
      (sum, t) => sum + Math.max(t.fileSize, t.downloadedSize, 0),
      0
    );
    const usedGb = Number(formatGb(usedBytes));
    return {
      usedBytes,
      usedGb,
      limitGb: STORAGE_LIMIT_GB,
      percent: Math.min(100, Math.max(0, Math.round((usedGb / STORAGE_LIMIT_GB) * 100))),
      usedLabel: `${usedGb >= 1 ? usedGb.toFixed(1) : usedGb.toFixed(2)} GB of ${STORAGE_LIMIT_GB} GB used`,
    };
  }, [items]);

  const handleDelete = async (downloadId) => {
    if (busyId) return;
    try {
      setBusyId(String(downloadId));
      await batch6Service.deleteDownload(String(downloadId));
      setItems((prev) => prev.filter((t) => String(t.downloadId) !== String(downloadId)));
      notify('Download removed', 'success');
    } catch (error) {
      console.error('Delete download failed', error);
      notify('Could not remove download', 'error');
    } finally {
      setBusyId('');
    }
  };

  const isCurrent = (track) =>
    Boolean(currentTrack && currentTrack.id && String(currentTrack.id) === String(track.id));

  const handleRowClick = async (track) => {
    if (isCurrent(track)) {
      togglePlay();
      return;
    }

    try {
      setPlayingId(String(track.id));
      const playableUrl = await downloadService.getPlayableUrl(track.id);
      playTrack({ ...track, fileUrl: playableUrl, storageMode: 'offline' });
    } catch (error) {
      notify(error?.message || 'This downloaded audio is no longer available offline.', 'error');
    } finally {
      setPlayingId('');
    }
  };

  return (
    <div className="ld-page">
      <div className="ld-header">
        <div>
          <h1>Downloads</h1>
          <p className="ld-subtitle">Listen offline anytime, anywhere.</p>
        </div>
      </div>

      <div className="ld-tabs-row">
        <div className="ld-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ld-tab ${tab === t.id ? 'ld-tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ld-section-header">
        <h2>Downloaded audio</h2>
        <span className="ld-storage-caption">
          {items.length > 0 ? storage.usedLabel : 'No storage used yet'}
        </span>
      </div>

      {loading ? (
        <div className="ld-empty ld-empty-loading">Loading your downloads…</div>
      ) : filtered.length === 0 ? (
        <div className="ld-empty">
          <FaClock />
          <strong>
            {items.length === 0 ? 'No downloads yet.' : 'Nothing matches this filter.'}
          </strong>
          <p>
            {items.length === 0
              ? 'Request a download on any audio and it will be available here for offline listening.'
              : 'Try a different filter to see more downloads.'}
          </p>
        </div>
      ) : (
        <div className="ld-list">
          {filtered.map((track) => {
            const current = isCurrent(track);
            const ready = track.status === 'completed' && track.fileSize > 0;
            return (
              <button
                key={track.downloadId}
                type="button"
                className={`ld-row ${current && isPlaying ? 'ld-row-current' : ''}`}
                onClick={() => handleRowClick(track)}
                disabled={!ready}
              >
                <span className="ld-row-art">
                  <img src={track.coverArt} alt="" loading="lazy" />
                  <span className="ld-row-art-icon">
                    {current && isPlaying ? <FaPause /> : playingId === String(track.id) ? <FaClock /> : <FaPlay />}
                  </span>
                </span>
                <span className="ld-row-info">
                  <span className="ld-row-title">{track.title}</span>
                  <span className="ld-row-sub">
                    {track.artistName || 'Unknown creator'}
                    {track.genre ? ` · ${track.genre}` : ''}
                  </span>
                </span>
                <span className="ld-row-meta">
                  <span className="ld-row-size">
                    {ready ? formatBytes(track.fileSize) : '—'}
                  </span>
                  <span className="ld-row-when">{relativeTime(track.downloadedAt)}</span>
                </span>
                <span className="ld-row-actions">
                  {track.completed && (
                    <span className="ld-row-check" title="Downloaded fully">
                      <FaCheck />
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    className={`ld-row-more ${busyId === track.downloadId ? 'ld-more-busy' : ''}`}
                    title={busyId === track.downloadId ? 'Removing…' : 'Remove download'}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(track.downloadId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        handleDelete(track.downloadId);
                      }
                    }}
                  >
                    {busyId === track.downloadId ? <FaTrash /> : <FaEllipsisV />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}


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

export default ListenerDownloadsConnected;
