import { useMemo, useRef, useState } from 'react';
import {
  FaChevronLeft,
  FaChevronRight,
  FaClock,
  FaCloudUploadAlt,
  FaDownload,
  FaEllipsisH,
  FaGlobeAfrica,
  FaHeart,
  FaList,
  FaLock,
  FaPause,
  FaPlay,
  FaSearch,
  FaTrash,
} from 'react-icons/fa';

import { buildMediaUrl } from '../../services/api.js';
import studioService from '../../services/studioService.js';
import CreatorAudioDetailModal from './CreatorAudioDetailModal.jsx';
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
  buildMediaUrl(track?.coverArt || track?.artwork || track?.image || track?.thumbnail || null);

const CreatorContentWorkspace = ({
  tracks = [],
  loading = false,
  page = 1,
  pagination = {},
  deletingId = '',
  onUpload,
  onDelete,
  onPageChange,
  onChanged,
}) => {
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState('All');
  const [sortMode, setSortMode] = useState('newest');
  const [playingId, setPlayingId] = useState('');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [openMenuId, setOpenMenuId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const audioRef = useRef(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matches = tracks.filter((track) => {
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

    return [...matches].sort((a, b) => {
      if (sortMode === 'oldest') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (sortMode === 'plays') {
        return (Number(b.plays ?? b.playCount) || 0) - (Number(a.plays ?? a.playCount) || 0);
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [tracks, search, visibility, sortMode]);

  const totals = useMemo(() => ({
    uploads: tracks.length,
    plays: tracks.reduce((sum, track) => sum + (Number(track.plays ?? track.playCount) || 0), 0),
    likes: tracks.reduce((sum, track) => sum + (Number(track.likes ?? track.likeCount) || 0), 0),
    duration: tracks.reduce((sum, track) => sum + parseDurationSeconds(track.duration), 0),
  }), [tracks]);

  const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
  const totalItems = Number(pagination?.total) || tracks.length;
  const pageSize = Number(pagination?.limit) || tracks.length || 1;
  const rangeStart = totalItems === 0 ? 0 : (Math.max(1, page) - 1) * pageSize + 1;
  const rangeEnd = Math.min(totalItems, rangeStart + Math.max(0, tracks.length - 1));

  const stopQuickPlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId('');
  };

  const openTrack = (track) => {
    stopQuickPlayer();
    setOpenMenuId('');
    setSelectedTrack(track);
  };

  const togglePlay = async (track) => {
    const id = String(getId(track) || '');
    const url = buildMediaUrl(track.fileUrl || track.audioUrl || '');
    if (!url) return;

    if (playingId === id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId('');
      return;
    }

    stopQuickPlayer();

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

  const notifyChanged = () => {
    if (onChanged) {
      onChanged();
      return;
    }
    window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
  };

  const toggleVisibility = async (track) => {
    const id = getId(track);
    if (!id || busyId) return;
    try {
      setBusyId(String(id));
      setActionError('');
      await studioService.updateAudio(id, { isPublic: !track.isPublic });
      setOpenMenuId('');
      notifyChanged();
    } catch (error) {
      setActionError(error?.message || 'Could not update audio visibility.');
    } finally {
      setBusyId('');
    }
  };

  const downloadTrack = async (track) => {
    const id = getId(track);
    if (!id || busyId) return;
    try {
      setBusyId(String(id));
      setActionError('');
      await studioService.downloadAudio(id, {
        title: track.title,
        originalName: track.originalName,
        mimeType: track.mimeType,
      });
      setOpenMenuId('');
    } catch (error) {
      setActionError(error?.message || 'Could not download this audio.');
    } finally {
      setBusyId('');
    }
  };

  const deleteTrack = (track) => {
    setOpenMenuId('');
    onDelete?.(getId(track), track.title);
  };

  return (
    <section className="eca">
      <header className="eca-header">
        <div>
          <span>AUDIO</span>
          <h1>Your <em>audio</em>, in one place.</h1>
          <p>Manage the recordings you’ve uploaded to Echoo.<br />Organize, share, and grow your audience.</p>
        </div>
        <button type="button" className="eca-upload" onClick={onUpload}><FaCloudUploadAlt /> Upload audio</button>
      </header>

      <div className="eca-toolbar">
        <label className="eca-search"><FaSearch /><input type="search" value={search} placeholder="Search your audio..." onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="eca-toolbar-right">
          <div className="eca-tabs" aria-label="Audio visibility filter">
            {['All', 'Public', 'Private'].map((item) => (
              <button type="button" key={item} className={visibility === item ? 'active' : ''} onClick={() => setVisibility(item)}>{item}</button>
            ))}
          </div>
          <select className="eca-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="Sort audio">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="plays">Most played</option>
          </select>
        </div>
      </div>

      <section className="eca-summary">
        <div><i className="blue"><FaCloudUploadAlt /></i><span><small>Total uploads</small><strong>{formatNumber(totals.uploads)}</strong><em>Current library</em></span></div>
        <div><i className="green"><FaPlay /></i><span><small>Total plays</small><strong>{formatNumber(totals.plays)}</strong><em className={totals.plays > 0 ? 'positive' : ''}>{totals.plays > 0 ? 'Plays recorded' : 'No plays yet'}</em></span></div>
        <div><i className="purple"><FaHeart /></i><span><small>Total likes</small><strong>{formatNumber(totals.likes)}</strong><em>{totals.likes > 0 ? 'Likes received' : 'No likes yet'}</em></span></div>
        <div><i className="gold"><FaPause /></i><span><small>Library duration</small><strong>{formatLibraryDuration(totals.duration)}</strong><em>Current library</em></span></div>
      </section>

      <section className="eca-library">
        <div className="eca-library-head">
          <div><h2>Your audio library</h2><span>{totalItems} {totalItems === 1 ? 'item' : 'items'}</span></div>
        </div>

        {actionError && <div className="eca-action-error">{actionError}<button type="button" onClick={() => setActionError('')}>Dismiss</button></div>}

        {loading ? (
          <div className="eca-loading"><span /><span /><span /></div>
        ) : filtered.length === 0 ? (
          <div className="eca-empty">
            <div className="eca-empty-icon"><FaCloudUploadAlt /></div>
            <div><h2>{tracks.length ? 'No matching audio' : 'Your library is ready for your first upload'}</h2><p>{tracks.length ? 'Try another search or visibility filter.' : 'Upload your first recording and it will appear here.'}</p></div>
            {!tracks.length && <button type="button" onClick={onUpload}><FaCloudUploadAlt /> Upload audio</button>}
          </div>
        ) : (
          <div className="eca-list list-view">
            {filtered.map((track, index) => {
              const id = String(getId(track) || index);
              const artwork = getArtwork(track);
              const isPlaying = playingId === id;
              const plays = Number(track.plays ?? track.playCount) || 0;
              const likes = Number(track.likes ?? track.likeCount) || 0;

              return (
                <article key={id}>
                  <button
                    type="button"
                    className="eca-art"
                    onClick={() => openTrack(track)}
                    aria-label={`Open ${track.title || 'audio'} details`}
                  >
                    {artwork ? <img src={artwork} alt="" /> : <span>{track.title || 'Echoo audio'}</span>}
                    <i onClick={(event) => { event.stopPropagation(); togglePlay(track); }} role="button" tabIndex="0" aria-label={isPlaying ? 'Pause audio' : 'Play audio'}>{isPlaying ? <FaPause /> : <FaPlay />}</i>
                  </button>

                  <div className="eca-copy">
                    <div className="eca-title-row">
                      <button type="button" className="eca-title-button" onClick={() => openTrack(track)}>{track.title || 'Untitled Audio'}</button>
                      <span className={track.isPublic ? 'public' : 'private'}>{track.isPublic ? <><FaGlobeAfrica /> Public</> : <><FaLock /> Private</>}</span>
                    </div>
                    <p className="eca-meta"><span><FaClock /> {track.duration || '0:00'}</span><span>•</span><span>{formatDate(track.createdAt)}</span></p>
                    <p className="eca-performance"><span><FaPlay /> {formatNumber(plays)} plays</span><span>•</span><span><FaHeart /> {formatNumber(likes)} likes</span></p>
                  </div>

                  <div className="eca-actions">
                    <button type="button" className="icon-primary" onClick={() => togglePlay(track)} disabled={!track.fileUrl && !track.audioUrl} aria-label={isPlaying ? 'Pause audio' : 'Play audio'}>{isPlaying ? <FaPause /> : <FaPlay />}</button>
                    <button type="button" className="details" onClick={() => openTrack(track)}><FaList /> Details</button>
                    <div className="eca-more-wrap">
                      <button type="button" className="more" onClick={() => setOpenMenuId((current) => current === id ? '' : id)} aria-expanded={openMenuId === id} aria-label={`More actions for ${track.title || 'audio'}`}><FaEllipsisH /></button>
                      {openMenuId === id && (
                        <div className="eca-more-menu">
                          <button type="button" disabled={busyId === id} onClick={() => toggleVisibility(track)}>
                            {track.isPublic ? <><FaLock /> Make private</> : <><FaGlobeAfrica /> Make public</>}
                          </button>
                          <button type="button" disabled={busyId === id} onClick={() => downloadTrack(track)}><FaDownload /> Download audio</button>
                          <button type="button" className="danger" disabled={deletingId === getId(track)} onClick={() => deleteTrack(track)}><FaTrash /> Delete audio</button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="eca-library-footer">
          <span>Showing {rangeStart}–{rangeEnd} of {totalItems} items</span>
          <div>
            <button type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} aria-label="Previous page"><FaChevronLeft /></button>
            <strong>{page}</strong>
            <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page"><FaChevronRight /></button>
          </div>
        </div>
      </section>

      {selectedTrack && (
        <CreatorAudioDetailModal
          track={selectedTrack}
          onClose={() => setSelectedTrack(null)}
          onChanged={notifyChanged}
        />
      )}
    </section>
  );
};

export default CreatorContentWorkspace;
