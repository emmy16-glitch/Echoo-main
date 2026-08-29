import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiEdit2,
  FiFilter,
  FiFolder,
  FiMoreVertical,
  FiPlay,
  FiPause,
  FiSearch,
  FiSettings,
  FiTrash2,
  FiUploadCloud,
} from 'react-icons/fi';
import { TbWorld } from 'react-icons/tb';

import { buildMediaUrl } from '../../services/api.js';
import studioService from '../../services/studioService.js';
import { buildGeneratedAudioCoverUrl } from '../../audioCover/audioCover.js';
import CreatorAudioDetailModal from './CreatorAudioDetailModal.jsx';
import './CreatorCollectionsWorkspace.css';

const getId = (track) => track?.id || track?._id || null;

const parseDurationSeconds = (value) => {
  if (typeof value === 'number') return Math.max(0, value);
  const parts = String(value || '').split(':').map(Number);
  if (!parts.length || parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return Number(parts[0]) || 0;
};

const formatDuration = (value) => {
  const seconds = Math.max(0, Math.round(parseDurationSeconds(value)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

const formatDate = (value) => {
  if (!value) return { date: '—', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '—', time: '' };
  return {
    date: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
};

const recordingStatus = (track = {}) => {
  const raw = String(track.status || track.processingStatus || track.state || '').toLowerCase();
  if (raw === 'draft') return 'draft';
  return track.isPublic ? 'published' : 'unpublished';
};

const getArtwork = (track, studioName) => (
  buildMediaUrl(track?.coverArt || track?.artwork || track?.image || track?.thumbnail || null) ||
  buildGeneratedAudioCoverUrl({
    title: track?.title || 'Echoo recording',
    artistName: studioName,
    genre: track?.genre || 'Recording',
  })
);

const statusLabel = {
  published: 'Published',
  unpublished: 'Unpublished',
  draft: 'Draft',
};

export default function CreatorCollectionsWorkspace({
  tracks = [],
  studioName = 'Echoo Creator',
  onChanged,
}) {
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('newest');
  const [filterOpen, setFilterOpen] = useState(false);
  const [playingId, setPlayingId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => () => {
    audioRef.current?.pause?.();
    studioService.releaseFallbackPlaybackUrl?.();
  }, []);

  const counts = useMemo(() => {
    const published = tracks.filter((track) => recordingStatus(track) === 'published').length;
    const draft = tracks.filter((track) => recordingStatus(track) === 'draft').length;
    return {
      total: tracks.length,
      published,
      private: tracks.length - published,
      draft,
    };
  }, [tracks]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = tracks.filter((track) => {
      const status = recordingStatus(track);
      const matchesTab = tab === 'all' || status === tab;
      const matchesQuery = !needle || [track.title, track.genre, track.description, studioName]
        .some((value) => String(value || '').toLowerCase().includes(needle));
      return matchesTab && matchesQuery;
    });

    return [...rows].sort((a, b) => {
      const left = new Date(a.createdAt || a.updatedAt || 0).getTime() || 0;
      const right = new Date(b.createdAt || b.updatedAt || 0).getTime() || 0;
      return sortMode === 'oldest' ? left - right : right - left;
    });
  }, [query, sortMode, studioName, tab, tracks]);

  useEffect(() => { setPage(1); }, [query, tab, sortMode, perPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const rangeStart = filtered.length ? ((safePage - 1) * perPage) + 1 : 0;
  const rangeEnd = Math.min(filtered.length, safePage * perPage);

  const announce = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const refresh = () => {
    onChanged?.();
    window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
  };

  const stopPlayback = () => {
    audioRef.current?.pause?.();
    audioRef.current = null;
    setPlayingId('');
  };

  const togglePlay = async (track) => {
    const id = String(getId(track) || '');
    if (!id) return;
    if (playingId === id) {
      stopPlayback();
      return;
    }

    try {
      stopPlayback();
      setError('');
      const { streamUrl } = await studioService.getAudioStreamUrl(id);
      const player = new Audio(streamUrl);
      audioRef.current = player;
      player.addEventListener('ended', () => setPlayingId(''), { once: true });
      player.addEventListener('error', () => setPlayingId(''), { once: true });
      await player.play();
      setPlayingId(id);
    } catch (playError) {
      setError(playError?.message || 'Could not play this recording.');
    }
  };

  const setVisibility = async (track, makePublic) => {
    const id = getId(track);
    if (!id || busyId) return;
    try {
      setBusyId(String(id));
      setError('');
      await studioService.updateAudio(id, { isPublic: Boolean(makePublic) });
      setMenuId('');
      announce(makePublic ? 'Recording published.' : 'Recording unpublished.');
      refresh();
    } catch (actionError) {
      setError(actionError?.message || 'Could not update this recording.');
    } finally {
      setBusyId('');
    }
  };

  const download = async (track) => {
    const id = getId(track);
    if (!id || busyId) return;
    try {
      setBusyId(String(id));
      setError('');
      await studioService.downloadAudio(id, {
        title: track.title,
        originalName: track.originalName,
        mimeType: track.mimeType,
      });
      setMenuId('');
    } catch (downloadError) {
      setError(downloadError?.message || 'Could not download this recording.');
    } finally {
      setBusyId('');
    }
  };

  const remove = async (track) => {
    const id = getId(track);
    if (!id || busyId) return;
    if (!window.confirm(`Delete “${track.title || 'this recording'}”?`)) return;
    try {
      setBusyId(String(id));
      setError('');
      await studioService.deleteAudio(id);
      setMenuId('');
      announce('Recording deleted.');
      refresh();
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete this recording.');
    } finally {
      setBusyId('');
    }
  };

  const uploadSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;
    try {
      setUploading(true);
      setError('');
      const title = String(file.name || 'New recording').replace(/\.[^/.]+$/, '');
      await studioService.uploadAudio({
        file,
        title,
        description: '',
        genre: 'Other',
        tags: [],
        isPublic: false,
      });
      announce('Audio uploaded. Review it before publishing.');
      refresh();
    } catch (uploadError) {
      setError(uploadError?.message || 'Could not upload this audio.');
    } finally {
      setUploading(false);
    }
  };

  const tabs = [
    ['all', 'All recordings'],
    ['published', 'Published'],
    ['unpublished', 'Unpublished'],
    ['draft', 'Drafts'],
  ];

  return (
    <section className="recordings-page">
      <header className="recordings-heading">
        <div className="recordings-heading-copy">
          <h1>Recordings</h1>
          <p>All your live broadcasts are saved automatically.</p>
          <strong>Review, publish and manage your recordings.</strong>
        </div>

        <div className="recordings-heading-actions">
          <div className="recordings-total-card" aria-label={`${counts.total} total recordings`}>
            <span className="recordings-total-icon"><FiFolder /></span>
            <span>
              <small>Total recordings</small>
              <b>{counts.total}</b>
              <em>{counts.published} published <i>•</i> {counts.private} private</em>
            </span>
          </div>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.webm" hidden onChange={uploadSelected} />
          <button type="button" className="recordings-upload" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <FiUploadCloud /> {uploading ? 'Uploading…' : 'Upload audio'}
          </button>
        </div>
      </header>

      {(notice || error) && (
        <div className={`recordings-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>
          {error || notice}
          {error && <button type="button" onClick={() => setError('')}>Dismiss</button>}
        </div>
      )}

      <section className="recordings-surface">
        <div className="recordings-toolbar">
          <div className="recordings-tabs" role="tablist" aria-label="Recording status">
            {tabs.map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>
            ))}
          </div>

          <div className="recordings-tools">
            <label className="recordings-search">
              <FiSearch aria-hidden="true" />
              <span className="recordings-sr-only">Search recordings</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recordings..." />
            </label>
            <div className="recordings-filter-wrap">
              <button type="button" className="recordings-filter" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}><FiFilter /> Filter <FiChevronDown /></button>
              {filterOpen && (
                <div className="recordings-filter-menu">
                  <button type="button" className={sortMode === 'newest' ? 'active' : ''} onClick={() => { setSortMode('newest'); setFilterOpen(false); }}>Newest first</button>
                  <button type="button" className={sortMode === 'oldest' ? 'active' : ''} onClick={() => { setSortMode('oldest'); setFilterOpen(false); }}>Oldest first</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="recordings-table" role="table" aria-label="Recordings">
          <div className="recordings-table-head" role="row">
            <span role="columnheader">Recording</span>
            <span role="columnheader">Duration</span>
            <span role="columnheader">Date</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Actions</span>
          </div>

          {pageRows.length ? pageRows.map((track) => {
            const id = String(getId(track) || '');
            const status = recordingStatus(track);
            const isPlaying = playingId === id;
            const date = formatDate(track.createdAt || track.updatedAt);
            const artwork = getArtwork(track, studioName);
            const metadata = [track.genre, track.description].filter(Boolean).join(' • ');

            return (
              <article className="recordings-row" role="row" key={id || track.title}>
                <div className="recordings-recording-cell" role="cell">
                  <button type="button" className="recordings-art" aria-label={`${isPlaying ? 'Pause' : 'Play'} ${track.title || 'recording'}`} onClick={() => togglePlay(track)}>
                    <img src={artwork} alt="" />
                    <span className="recordings-art-play">{isPlaying ? <FiPause /> : <FiPlay />}</span>
                    <small>{formatDuration(track.duration)}</small>
                  </button>
                  <div className="recordings-copy">
                    <button type="button" className="recordings-title" onClick={() => setSelectedTrack(track)}>{track.title || 'Untitled recording'} <FiEdit2 /></button>
                    <p>{studioName}</p>
                    {metadata && <span>{metadata}</span>}
                  </div>
                </div>

                <div className="recordings-duration" role="cell">{formatDuration(track.duration)}</div>
                <div className="recordings-date" role="cell"><strong>{date.date}</strong><span>{date.time}</span></div>
                <div className="recordings-status-cell" role="cell"><span className={`recordings-status is-${status}`}><i />{statusLabel[status]}</span></div>

                <div className="recordings-actions" role="cell">
                  {status === 'published' ? (
                    <button type="button" className="recordings-primary-action" onClick={() => setSelectedTrack(track)}><FiSettings /> Manage</button>
                  ) : (
                    <button type="button" className="recordings-primary-action" disabled={busyId === id} onClick={() => setVisibility(track, true)}><TbWorld /> Publish</button>
                  )}
                  <button type="button" className="recordings-icon-action" aria-label={isPlaying ? 'Pause recording' : 'Play recording'} onClick={() => togglePlay(track)}>{isPlaying ? <FiPause /> : <FiPlay />}</button>
                  <button type="button" className="recordings-icon-action" aria-label="Download recording" disabled={busyId === id} onClick={() => download(track)}><FiDownload /></button>
                  <div className="recordings-more-wrap">
                    <button type="button" className="recordings-more" aria-label="More recording actions" aria-expanded={menuId === id} onClick={() => setMenuId((current) => current === id ? '' : id)}><FiMoreVertical /></button>
                    {menuId === id && (
                      <div className="recordings-more-menu">
                        <button type="button" onClick={() => setSelectedTrack(track)}>Manage recording</button>
                        {status === 'published' && <button type="button" onClick={() => setVisibility(track, false)}>Unpublish</button>}
                        <button type="button" className="danger" onClick={() => remove(track)}><FiTrash2 /> Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          }) : (
            <div className="recordings-empty">
              <FiFolder />
              <strong>{tracks.length ? 'No recordings found.' : 'No recordings yet.'}</strong>
              <p>{tracks.length ? 'Try another search or status filter.' : 'Completed live broadcasts and uploaded audio will appear here.'}</p>
            </div>
          )}
        </div>

        <footer className="recordings-footer">
          <span>Showing {rangeStart} to {rangeEnd} of {filtered.length} recordings</span>
          <div className="recordings-pagination">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Previous page"><FiChevronLeft /></button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((number) => (
              <button type="button" key={number} className={safePage === number ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>
            ))}
            <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} aria-label="Next page"><FiChevronRight /></button>
          </div>
          <label className="recordings-page-size"><span>Show</span><select value={perPage} onChange={(event) => setPerPage(Number(event.target.value))}><option value="5">5 per page</option><option value="10">10 per page</option><option value="20">20 per page</option></select></label>
        </footer>
      </section>

      {selectedTrack && <CreatorAudioDetailModal track={selectedTrack} onClose={() => setSelectedTrack(null)} onChanged={refresh} />}
    </section>
  );
}
