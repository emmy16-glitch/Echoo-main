import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FaCheckCircle,
  FaCloudDownloadAlt,
  FaDownload,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaTrash,
} from 'react-icons/fa';

import audioService from '../../services/audioService';
import downloadService from '../../services/downloadService';
import ListenerToast from '../ListenerUI/ListenerToast';
import ListenerModal from '../ListenerUI/ListenerModal';
import '../ListenerUI/ListenerBeautiful.css';
import './ListenerDownloads.css';

const normalizeTrack = (track) => {
  const artist = track?.artist;

  return {
    ...track,
    id: track?.id || track?._id || null,
    title: track?.title || 'Untitled Audio',
    artistName:
      track?.artistName ||
      (typeof artist === 'string'
        ? artist
        : artist?.displayName || artist?.username) ||
      track?.subtitle ||
      'Echoo Creator',
    genre: track?.genre || 'Audio',
    duration: Number(track?.duration) || 0,
    coverArt:
      track?.coverArt ||
      track?.artwork ||
      track?.image ||
      track?.thumbnail ||
      null,
    fileUrl: track?.fileUrl || null,
  };
};

const extractAudio = (response) => {
  const list = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.data?.tracks)
      ? response.data.tracks
      : [];

  return list.map(normalizeTrack).filter((track) => track?.id);
};

const formatTime = (seconds) => {
  const total = Number(seconds) || 0;
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const formatDownloadedDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const DownloadArtwork = ({ track }) => {
  const [failed, setFailed] = useState(false);
  const source = failed ? null : track?.coverArt || null;

  if (source) {
    return (
      <img
        src={source}
        alt=""
        draggable="false"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="figma-download-art-fallback">
      <FaHeadphones />
    </div>
  );
};

const ListenerDownloads = () => {
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();

  const [available, setAvailable] = useState([]);
  const [downloaded, setDownloaded] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [toast, setToast] = useState({
    open: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showToast = (type, title, message) => {
    setToast({ open: true, type, title, message });
  };

  const readDownloads = () => {
    const items = downloadService.getAll();
    setDownloaded(
      Array.isArray(items)
        ? items.map(normalizeTrack).filter((track) => track?.id)
        : []
    );
  };

  const load = async () => {
    setLoading(true);
    try {
      const response = await audioService.getAll({
        public: true,
        page: 1,
        limit: 100,
      });
      setAvailable(extractAudio(response));
    } catch (error) {
      setAvailable([]);
      showToast(
        'error',
        'Could not load audio',
        error?.message || 'Available audio could not be loaded.'
      );
    } finally {
      readDownloads();
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const downloadedIds = useMemo(
    () => new Set(downloaded.map((item) => String(item.id)).filter(Boolean)),
    [downloaded]
  );

  const availableToDownload = useMemo(
    () => available.filter((item) => !downloadedIds.has(String(item.id))),
    [available, downloadedIds]
  );

  const totalDuration = useMemo(
    () => downloaded.reduce((total, item) => total + (Number(item.duration) || 0), 0),
    [downloaded]
  );

  const downloadTrack = async (track) => {
    if (!track?.id || busyId) return;

    try {
      setBusyId(String(track.id));
      await downloadService.download(track);
      readDownloads();
      showToast('success', 'Download complete', `“${track.title}” is ready offline.`);
    } catch (error) {
      showToast('error', 'Download failed', error?.message || 'Could not download this audio.');
    } finally {
      setBusyId(null);
    }
  };

  const removeTrack = async (track) => {
    if (!track?.id || busyId) return;

    try {
      setBusyId(String(track.id));
      await downloadService.remove(track.id);
      readDownloads();
      showToast('success', 'Download removed', `“${track.title}” was removed from this device.`);
    } catch (error) {
      showToast('error', 'Could not remove download', error?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const clearDownloads = async () => {
    try {
      setBusyId('clear');
      await downloadService.clear();
      readDownloads();
      setClearOpen(false);
      showToast('success', 'Downloads cleared', 'Offline audio has been removed from this browser.');
    } catch (error) {
      showToast('error', 'Could not clear downloads', error?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const playAvailable = (track, queue) => {
    if (String(currentTrack?.id || '') === String(track.id)) {
      togglePlay();
      return;
    }
    playTrack(track, queue);
  };

  const playDownloaded = async (track) => {
    if (String(currentTrack?.id || '') === String(track.id) && isPlaying) {
      togglePlay();
      return;
    }

    try {
      setBusyId(`play-${track.id}`);
      const playableUrl = await downloadService.getPlayableUrl(track.id);
      playTrack({ ...track, fileUrl: playableUrl || track.fileUrl }, downloaded);
    } catch (error) {
      showToast('error', 'Could not play download', error?.message || 'This offline audio is unavailable.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="figma-downloads-page">Loading downloads...</div>;
  }

  return (
    <div className="figma-downloads-page">
      <ListenerToast
        {...toast}
        onClose={() => setToast((current) => ({ ...current, open: false }))}
      />

      <ListenerModal
        open={clearOpen}
        size="small"
        title="Clear downloads?"
        subtitle="This removes every downloaded audio item stored by Echoo on this browser."
        onClose={() => !busyId && setClearOpen(false)}
        footer={
          <>
            <button type="button" className="lb-button" onClick={() => setClearOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="lb-button danger"
              onClick={clearDownloads}
              disabled={busyId === 'clear'}
            >
              <FaTrash /> {busyId === 'clear' ? 'Clearing...' : 'Clear downloads'}
            </button>
          </>
        }
      >
        <div className="figma-download-clear-copy">
          You currently have <strong>{downloaded.length}</strong> downloaded item{downloaded.length === 1 ? '' : 's'}.
        </div>
      </ListenerModal>

      <header className="figma-downloads-header">
        <div>
          <h1>Downloads</h1>
          <p>Keep real published Echoo audio available on this device.</p>
        </div>
        {downloaded.length > 0 && (
          <button
            type="button"
            className="figma-download-clear-button"
            onClick={() => setClearOpen(true)}
          >
            <FaTrash /> Clear downloads
          </button>
        )}
      </header>

      <section className="figma-download-summary">
        <article>
          <div><FaDownload /></div>
          <span><strong>{downloaded.length}</strong><small>Downloaded</small></span>
        </article>
        <article>
          <div><FaCheckCircle /></div>
          <span><strong>{downloaded.length ? 'Ready' : 'Empty'}</strong><small>Offline status</small></span>
        </article>
        <article>
          <div><FaHeadphones /></div>
          <span><strong>{Math.round(totalDuration / 60)}</strong><small>Minutes</small></span>
        </article>
        <article>
          <div><FaCloudDownloadAlt /></div>
          <span><strong>{availableToDownload.length}</strong><small>Available</small></span>
        </article>
      </section>

      <section className="figma-download-section">
        <div className="figma-download-section-heading">
          <div>
            <h2>Offline Audio</h2>
            <p>Audio already stored on this browser.</p>
          </div>
          <span>{downloaded.length}</span>
        </div>

        {downloaded.length === 0 ? (
          <div className="figma-download-empty">
            <FaHeadphones />
            <strong>No downloads yet.</strong>
            <span>Choose published audio below to keep it available offline.</span>
          </div>
        ) : (
          <div className="figma-download-list">
            {downloaded.map((track) => {
              const playing =
                isPlaying && String(currentTrack?.id || '') === String(track.id);
              return (
                <article className="figma-download-row" key={track.id}>
                  <div className="figma-download-art"><DownloadArtwork track={track} /></div>
                  <div className="figma-download-copy">
                    <strong>{track.title}</strong>
                    <span>{track.artistName}</span>
                    <small>
                      {formatTime(track.duration)}
                      {track.downloadedAt ? ` · ${formatDownloadedDate(track.downloadedAt)}` : ''}
                    </small>
                  </div>
                  <button type="button" onClick={() => playDownloaded(track)} disabled={busyId === `play-${track.id}`}>
                    {playing ? <FaPause /> : <FaPlay />}
                  </button>
                  <button type="button" onClick={() => removeTrack(track)} disabled={busyId === String(track.id)}>
                    <FaTrash />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="figma-download-section">
        <div className="figma-download-section-heading">
          <div>
            <h2>Available to Download</h2>
            <p>Published audio from the Echoo backend.</p>
          </div>
          <span>{availableToDownload.length}</span>
        </div>

        {availableToDownload.length === 0 ? (
          <div className="figma-download-empty">No additional downloadable audio is available.</div>
        ) : (
          <div className="figma-download-list">
            {availableToDownload.map((track) => {
              const playing =
                isPlaying && String(currentTrack?.id || '') === String(track.id);
              return (
                <article className="figma-download-row" key={track.id}>
                  <div className="figma-download-art"><DownloadArtwork track={track} /></div>
                  <div className="figma-download-copy">
                    <strong>{track.title}</strong>
                    <span>{track.artistName}</span>
                    <small>{formatTime(track.duration)}</small>
                  </div>
                  <button type="button" onClick={() => playAvailable(track, available)}>
                    {playing ? <FaPause /> : <FaPlay />}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadTrack(track)}
                    disabled={busyId === String(track.id) || !track.fileUrl}
                  >
                    <FaDownload />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default ListenerDownloads;
