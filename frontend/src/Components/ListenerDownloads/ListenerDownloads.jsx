import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
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
import '../../styles/listener-reference-pages.css';

const normalizeTrack = (track) => {
  const artist = track?.artist;
  return {
    ...track,
    id:track?.id || track?._id || null,
    title:track?.title || 'Untitled Audio',
    artistName:track?.artistName ||
      (typeof artist === 'string' ? artist : artist?.displayName || artist?.username) ||
      track?.subtitle || 'Echoo Creator',
    genre:track?.genre || 'Audio',
    duration:Number(track?.duration) || 0,
    coverArt:track?.coverArt || track?.artwork || track?.image || track?.thumbnail || null,
    fileUrl:track?.fileUrl || null,
  };
};
const extractAudio = (response) => {
  const list = Array.isArray(response?.data) ? response.data : Array.isArray(response?.data?.tracks) ? response.data.tracks : [];
  return list.map(normalizeTrack).filter((track) => track?.id);
};
const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2,'0')}`;
};
const formatDownloadedDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month:'short', day:'numeric' });
};

const ListenerDownloads = () => {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();
  const [available, setAvailable] = useState([]);
  const [downloaded, setDownloaded] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [toast, setToast] = useState({ open:false, type:'info', title:'', message:'' });

  const showToast = (type,title,message) => setToast({ open:true,type,title,message });
  const readDownloads = () => {
    const items = downloadService.getAll();
    setDownloaded(Array.isArray(items) ? items.map(normalizeTrack).filter((track) => track?.id) : []);
  };

  const load = async () => {
    setLoading(true);
    try {
      const response = await audioService.getAll({ public:true, page:1, limit:100 });
      setAvailable(extractAudio(response));
    } catch (loadError) {
      setAvailable([]);
      showToast('error','Could not load audio',loadError?.message || 'Available audio could not be loaded.');
    } finally {
      readDownloads();
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const refresh = () => readDownloads();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const downloadedIds = useMemo(() => new Set(downloaded.map((item) => String(item.id))), [downloaded]);
  const availableToDownload = useMemo(() => available.filter((item) => !downloadedIds.has(String(item.id))), [available, downloadedIds]);
  const totalDuration = useMemo(() => downloaded.reduce((total,item) => total + (Number(item.duration) || 0), 0), [downloaded]);

  const downloadTrack = async (track) => {
    if (!track?.id || busyId) return;
    try {
      setBusyId(`download-${track.id}`);
      await downloadService.download(track);
      readDownloads();
      showToast('success','Download complete',`“${track.title}” is ready offline on this browser.`);
    } catch (actionError) {
      showToast('error','Download failed',actionError?.message || 'Could not download this audio.');
    } finally { setBusyId(''); }
  };

  const removeTrack = async (track) => {
    if (!track?.id || busyId) return;
    try {
      setBusyId(`remove-${track.id}`);
      await downloadService.remove(track.id);
      readDownloads();
      showToast('success','Download removed',`“${track.title}” was removed from this browser.`);
    } catch (actionError) {
      showToast('error','Could not remove download',actionError?.message || 'Please try again.');
    } finally { setBusyId(''); }
  };

  const clearDownloads = async () => {
    try {
      setBusyId('clear');
      await downloadService.clear();
      readDownloads();
      setClearOpen(false);
      showToast('success','Downloads cleared','Offline audio has been removed from this browser.');
    } catch (actionError) {
      showToast('error','Could not clear downloads',actionError?.message || 'Please try again.');
    } finally { setBusyId(''); }
  };

  const playAvailable = (track, queue) => {
    if (String(currentTrack?.id || '') === String(track.id)) {
      togglePlay();
      return;
    }
    playTrack({ ...track, subtitle:track.artistName }, queue);
  };

  const playDownloaded = async (track) => {
    if (String(currentTrack?.id || '') === String(track.id) && isPlaying) {
      togglePlay();
      return;
    }
    try {
      setBusyId(`play-${track.id}`);
      const playableUrl = await downloadService.getPlayableUrl(track.id);
      playTrack({ ...track, subtitle:track.artistName, fileUrl:playableUrl || track.fileUrl }, downloaded);
    } catch (actionError) {
      showToast('error','Could not play download',actionError?.message || 'This offline audio is unavailable.');
    } finally { setBusyId(''); }
  };

  return (
    <main className="echoo-reference-page ref-downloads-page">
      <ListenerToast {...toast} onClose={() => setToast((current) => ({ ...current, open:false }))} />
      <ListenerModal
        open={clearOpen}
        size="small"
        title="Clear downloads?"
        subtitle="This removes every audio file Echoo saved in this browser."
        onClose={() => !busyId && setClearOpen(false)}
        footer={
          <>
            <button type="button" className="lb-button" onClick={() => setClearOpen(false)}>Cancel</button>
            <button type="button" className="lb-button danger" onClick={clearDownloads} disabled={busyId === 'clear'}><FaTrash /> {busyId === 'clear' ? 'Clearing...' : 'Clear downloads'}</button>
          </>
        }
      ><p>You currently have <strong>{downloaded.length}</strong> downloaded item{downloaded.length === 1 ? '' : 's'} on this browser.</p></ListenerModal>

      <header className="ref-page-heading ref-downloads-heading">
        <div>
          <span className="ref-kicker">OFFLINE LISTENING</span>
          <h1>Your downloads</h1>
          <p>Keep public Echoo audio available when this device is offline.</p>
        </div>
        {downloaded.length > 0 && <button type="button" className="ref-danger-action" onClick={() => setClearOpen(true)}><FaTrash /> Clear downloads</button>}
      </header>

      <section className="ref-download-summary">
        <article><FaDownload /><div><strong>{downloaded.length}</strong><span>Downloaded</span><small>On this browser</small></div></article>
        <article><FaCheckCircle /><div><strong>{downloaded.length ? 'Ready' : 'Empty'}</strong><span>Offline status</span><small>{downloaded.length ? 'Playable locally' : 'Nothing stored yet'}</small></div></article>
        <article><FaHeadphones /><div><strong>{Math.round(totalDuration / 60)}</strong><span>Minutes</span><small>Downloaded audio</small></div></article>
        <article><FaCloudDownloadAlt /><div><strong>{availableToDownload.length}</strong><span>Available</span><small>Public audio</small></div></article>
      </section>

      {loading ? (
        <div className="ref-state-card"><strong>Checking downloadable Echoo audio...</strong></div>
      ) : (
        <>
          <section className="ref-download-section">
            <div className="ref-section-heading"><div><h2>Offline audio</h2><p>Files stored on this browser and playable without another download.</p></div><span className="ref-count-pill">{downloaded.length}</span></div>
            {downloaded.length ? (
              <div className="ref-download-list">
                {downloaded.map((track) => {
                  const playing = isPlaying && String(currentTrack?.id || '') === String(track.id);
                  return (
                    <article className="ref-download-row" key={track.id}>
                      <button type="button" className="ref-download-art" onClick={() => navigate(`/listen/audio/${track.id}`)}>
                        {track.coverArt ? <img src={track.coverArt} alt="" /> : <FaHeadphones />}
                      </button>
                      <button type="button" className="ref-download-copy" onClick={() => navigate(`/listen/audio/${track.id}`)}>
                        <strong>{track.title}</strong><span>{track.artistName}</span><small>{formatTime(track.duration)}{track.downloadedAt ? ` · Downloaded ${formatDownloadedDate(track.downloadedAt)}` : ''}</small>
                      </button>
                      <span className="ref-download-ready"><FaCheckCircle /> Ready offline</span>
                      <button type="button" className="ref-row-play" disabled={busyId === `play-${track.id}`} onClick={() => playDownloaded(track)}>{playing ? <FaPause /> : <FaPlay />}</button>
                      <button type="button" className="ref-row-more danger" title="Remove download" disabled={busyId === `remove-${track.id}`} onClick={() => removeTrack(track)}><FaTrash /></button>
                    </article>
                  );
                })}
              </div>
            ) : <div className="ref-state-card compact"><FaDownload /><strong>No downloads yet.</strong><span>Choose a public audio item below and keep it available on this device.</span></div>}
          </section>

          <section className="ref-download-section">
            <div className="ref-section-heading"><div><h2>Available to download</h2><p>Real public audio currently published by creators.</p></div><span className="ref-count-pill">{availableToDownload.length}</span></div>
            {availableToDownload.length ? (
              <div className="ref-download-available-grid">
                {availableToDownload.slice(0,16).map((track) => {
                  const playing = isPlaying && String(currentTrack?.id || '') === String(track.id);
                  return (
                    <article className="ref-download-card" key={track.id}>
                      <button type="button" className="ref-download-card-art" onClick={() => navigate(`/listen/audio/${track.id}`)}>
                        {track.coverArt ? <img src={track.coverArt} alt="" /> : <FaHeadphones />}
                      </button>
                      <div><span>{track.genre || 'Audio'}</span><strong>{track.title}</strong><small>{track.artistName}</small></div>
                      <div className="ref-download-card-actions">
                        <button type="button" onClick={() => playAvailable(track, available)}>{playing ? <FaPause /> : <FaPlay />}</button>
                        <button type="button" disabled={!track.fileUrl || busyId === `download-${track.id}`} onClick={() => downloadTrack(track)}><FaDownload /> {busyId === `download-${track.id}` ? 'Saving...' : 'Download'}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <div className="ref-state-card compact"><strong>No additional public audio is available to download.</strong></div>}
          </section>
        </>
      )}
    </main>
  );
};

export default ListenerDownloads;
