import { useMemo, useRef, useState } from 'react';
import {
  FaCloudUploadAlt,
  FaHeart,
  FaLock,
  FaPause,
  FaPlay,
  FaSearch,
  FaTrash,
} from 'react-icons/fa';

import './CreatorContentExact.css';

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US').format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const parseDurationSeconds = (value) => {
  if (typeof value === 'number') return value;
  const parts = String(value || '').split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
};

const formatLibraryDuration = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const getId = (track) => track?.id || track?._id || null;
const getArtwork = (track) =>
  track?.coverArt || track?.artwork || track?.image || track?.thumbnail || null;

const CreatorContentWorkspace = ({
  tracks = [],
  loading = false,
  page = 1,
  pagination = {},
  deletingId = '',
  onUpload,
  onDelete,
  onPageChange,
}) => {
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState('All');
  const [playingId, setPlayingId] = useState('');
  const audioRef = useRef(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tracks.filter((track) => {
      const searchMatch =
        !query ||
        String(track.title || '').toLowerCase().includes(query) ||
        String(track.genre || '').toLowerCase().includes(query);

      const visibilityMatch =
        visibility === 'All'
          ? true
          : visibility === 'Public'
            ? Boolean(track.isPublic)
            : !track.isPublic;

      return searchMatch && visibilityMatch;
    });
  }, [tracks, search, visibility]);

  const totals = useMemo(() => ({
    uploads: tracks.length,
    plays: tracks.reduce((sum, track) => sum + (Number(track.plays) || 0), 0),
    likes: tracks.reduce((sum, track) => sum + (Number(track.likes) || 0), 0),
    duration: tracks.reduce((sum, track) => sum + parseDurationSeconds(track.duration), 0),
  }), [tracks]);

  const totalPages = Number(pagination?.totalPages) || 1;

  const togglePlay = async (track) => {
    const id = String(getId(track) || '');
    const url = track.fileUrl || track.audioUrl || '';
    if (!url) return;

    if (playingId === id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId('');
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const player = new Audio(url);
    audioRef.current = player;
    player.addEventListener('ended', () => setPlayingId(''), { once: true });
    player.addEventListener('error', () => setPlayingId(''), { once: true });

    try {
      await player.play();
      setPlayingId(id);
    } catch {
      setPlayingId('');
    }
  };

  return (
    <section className="eca">
      <header className="eca-header">
        <div>
          <span>AUDIO</span>
          <h1>Your audio, in one place.</h1>
          <p>Manage the recordings you have published on Echoo.</p>
        </div>
        <button type="button" className="eca-upload" onClick={onUpload}><FaCloudUploadAlt /> Upload audio</button>
      </header>

      <div className="eca-toolbar">
        <label className="eca-search"><FaSearch /><input type="search" value={search} placeholder="Search your audio..." onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="eca-tabs">
          {['All', 'Public', 'Private'].map((item) => (
            <button type="button" key={item} className={visibility === item ? 'active' : ''} onClick={() => setVisibility(item)}>{item}</button>
          ))}
        </div>
      </div>

      <section className="eca-summary">
        <div><i className="blue"><FaCloudUploadAlt /></i><span><small>Total uploads</small><strong>{formatNumber(totals.uploads)}</strong></span></div>
        <div><i className="green"><FaPlay /></i><span><small>Total plays</small><strong>{formatNumber(totals.plays)}</strong></span></div>
        <div><i className="purple"><FaHeart /></i><span><small>Total likes</small><strong>{formatNumber(totals.likes)}</strong></span></div>
        <div><i className="gold"><FaPause /></i><span><small>Library duration</small><strong>{formatLibraryDuration(totals.duration)}</strong></span></div>
      </section>

      <section className="eca-library">
        <div className="eca-library-head"><div><h2>Your audio library</h2><span>{tracks.length} {tracks.length === 1 ? 'item' : 'items'}</span></div></div>

        {loading ? (
          <div className="eca-loading"><span /><span /><span /><span /></div>
        ) : filtered.length === 0 ? (
          <div className="eca-empty">
            <div className="eca-empty-icon"><FaCloudUploadAlt /></div>
            <div><h2>{tracks.length ? 'No matching audio' : 'Your library is ready for your first upload'}</h2><p>{tracks.length ? 'Try another search or visibility filter.' : 'Upload your first recording and it will appear here.'}</p></div>
            {!tracks.length && <button type="button" onClick={onUpload}><FaCloudUploadAlt /> Upload audio</button>}
          </div>
        ) : (
          <div className="eca-list">
            {filtered.map((track, index) => {
              const id = String(getId(track) || index);
              const artwork = getArtwork(track);
              const isPlaying = playingId === id;

              return (
                <article key={id}>
                  <button type="button" className="eca-art" onClick={() => togglePlay(track)} disabled={!track.fileUrl} aria-label={isPlaying ? 'Pause audio' : 'Play audio'}>
                    {artwork ? <img src={artwork} alt="" /> : <span>{String(track.title || 'E').charAt(0).toUpperCase()}</span>}
                    <i>{isPlaying ? <FaPause /> : <FaPlay />}</i>
                  </button>

                  <div className="eca-copy">
                    <div><strong>{track.title || 'Untitled Audio'}</strong><span className={track.isPublic ? 'published' : 'private'}>{track.isPublic ? 'Published' : 'Private'}</span></div>
                    <p><span>{track.duration || '—'}</span><span>{formatDate(track.createdAt)}</span><span><FaPlay /> {formatNumber(track.plays)}</span><span><FaHeart /> {formatNumber(track.likes)}</span></p>
                  </div>

                  <span className={`eca-visibility ${track.isPublic ? 'public' : 'private'}`}>{track.isPublic ? 'Public' : <><FaLock /> Private</>}</span>

                  <div className="eca-actions">
                    <button type="button" onClick={() => togglePlay(track)} disabled={!track.fileUrl}>{isPlaying ? <FaPause /> : <FaPlay />}</button>
                    <button type="button" className="danger" disabled={deletingId === getId(track)} onClick={() => onDelete(getId(track), track.title)} aria-label="Delete audio"><FaTrash /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <div className="eca-pagination">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
        </div>
      )}
    </section>
  );
};

export default CreatorContentWorkspace;
