import { useEffect, useRef, useState } from 'react';
import { FiClock, FiLoader, FiMusic, FiSearch, FiX } from 'react-icons/fi';

import studioService from '../../services/studioService';

const PAGE_SIZE = 24;

const mergeTracks = (current, incoming) => {
  const byId = new Map(current.map((track) => [String(track.id || track._id), track]));
  incoming.forEach((track) => byId.set(String(track.id || track._id), track));
  return [...byId.values()];
};

const CreatorAudioLibraryPicker = ({ open, busy = false, onClose, onSelect }) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const searchRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    setTracks([]);
    setPage(1);
    setError('');
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open, debouncedQuery]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await studioService.getContent({
          page,
          limit: PAGE_SIZE,
          search: debouncedQuery,
          sort: 'latest',
        });
        if (!active) return;
        const nextTracks = Array.isArray(response?.data?.tracks) ? response.data.tracks : [];
        setTracks((current) => page === 1 ? nextTracks : mergeTracks(current, nextTracks));
        setPagination(response?.data?.pagination || { page, totalPages: page, total: nextTracks.length });
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Echoo could not load your audio library.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [open, page, debouncedQuery, retryKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;
  const hasMore = Number(pagination.page || page) < Number(pagination.totalPages || 1);

  return (
    <div className="eam-library-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="eam-library-picker" role="dialog" aria-modal="true" aria-labelledby="eam-library-title">
        <header>
          <div>
            <span className="eam-library-eyebrow">Broadcast media</span>
            <h2 id="eam-library-title">Choose from Echoo Library</h2>
            <p>Select one of your recordings for the existing media channel.</p>
          </div>
          <button type="button" className="eam-library-close" onClick={onClose} disabled={busy} aria-label="Close Echoo Library"><FiX /></button>
        </header>

        <label className="eam-library-search">
          <FiSearch aria-hidden="true" />
          <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recordings by title" aria-label="Search Echoo Library" />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><FiX /></button> : null}
        </label>

        <div className="eam-library-summary" aria-live="polite">
          <span>{pagination.total || tracks.length} {Number(pagination.total || tracks.length) === 1 ? 'recording' : 'recordings'}</span>
          {loading ? <span><FiLoader className="eam-library-spinner" /> Loading</span> : null}
        </div>

        <div className="eam-library-results">
          {error ? (
            <div className="eam-library-state is-error" role="alert">
              <strong>Library unavailable</strong><p>{error}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)}>Try again</button>
            </div>
          ) : null}
          {!error && loading && page === 1 ? (
            <div className="eam-library-state" role="status"><FiLoader className="eam-library-spinner" /><strong>Loading your recordings…</strong></div>
          ) : null}
          {!error && !loading && !tracks.length ? (
            <div className="eam-library-state"><FiMusic /><strong>{debouncedQuery ? 'No matching recordings' : 'Your Library is empty'}</strong><p>{debouncedQuery ? 'Try a different title.' : 'Upload audio in Creator Studio, then return here.'}</p></div>
          ) : null}
          {tracks.map((track) => (
            <button type="button" className="eam-library-track" key={track.id || track._id} onClick={() => onSelect(track)} disabled={busy}>
              <span className="eam-library-art">{track.coverArt ? <img src={track.coverArt} alt="" /> : <FiMusic />}</span>
              <span className="eam-library-track-copy"><strong>{track.title || track.originalName || 'Untitled recording'}</strong><small>{track.genre || track.category || 'Audio recording'}</small></span>
              <span className="eam-library-track-meta"><FiClock /> {track.duration || '0:00'}<small>{track.isPublic ? 'Public' : 'Private'}</small></span>
              <span className="eam-library-use">{busy ? 'Adding…' : 'Add to mixer'}</span>
            </button>
          ))}
        </div>

        <footer>
          <span>Only recordings accessible to this creator account are shown.</span>
          {hasMore ? <button type="button" onClick={() => setPage((value) => value + 1)} disabled={loading || busy}>{loading ? 'Loading…' : 'Load more'}</button> : null}
        </footer>
      </section>
    </div>
  );
};

export default CreatorAudioLibraryPicker;
