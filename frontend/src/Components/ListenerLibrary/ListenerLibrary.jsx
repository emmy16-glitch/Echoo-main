import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaAngleDoubleRight,
  FaCheckCircle,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaDownload,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaSearch,
  FaSlidersH,
} from 'react-icons/fa';

import audioService from '../../services/audioService';
import realtimeService from '../../services/realtimeService';
import batch6Service from '../../services/batch6Service';
import playlistService from '../../services/playlistService';
import ListenerToast from '../ListenerUI/ListenerToast';
import '../../styles/listener-reference-pages.css';
import './ListenerLibrary.css';

const PAGE_SIZE = 10;

// Reference chips (audio-library.png type row). Filtering maps each chip to
// backend genres; chips whose mapped genres exist in the real dataset become
// selectable, the rest remain visible for fidelity but match nothing.
const LIBRARY_CHIPS = [
  { label: 'All audio', genres: [] },
  { label: 'Episodes', genres: ['News & Politics', 'Business'] },
  { label: 'Clips', genres: [] },
  { label: 'Teachings', genres: ['Education'] },
  { label: 'Messages', genres: ['Faith & Spirituality'] },
  { label: 'Interviews', genres: [] },
  { label: 'Music', genres: ['Music'] },
  { label: 'Podcasts', genres: ['Podcast'] },
];

const idOf = (item) => String(item?.id || item?._id || '');

const formatDuration = (seconds) => {
  const total = Number(seconds) || 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Real backend genre → reference-style type pill label.
const typeLabelFor = (genre) => {
  switch (String(genre || '').trim()) {
    case 'Faith & Spirituality': return 'Message';
    case 'Education': return 'Teaching';
    case 'Music': return 'Music';
    case 'Podcast': return 'Podcast';
    default: return 'Episode';
  }
};

const initials = (value) => String(value || 'E')
  .split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

const ArtistName = ({ track }) => {
  const artist = track?.artist && typeof track.artist === 'object' ? track.artist : null;
  const fallback = artist?.displayName || artist?.username || track?.artistName || 'Echoo Creator';
  const verified = artist && artist.userType === 'creator';
  return (
    <span className="al-row-sub">
      {fallback}
      {verified && <FaCheckCircle className="al-verified" />}
    </span>
  );
};

const ListenerLibrary = () => {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();

  const [page, setPage] = useState(1);
  const [listSearch, setListSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [chip, setChip] = useState('All audio');
  const [audio, setAudio] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [genres, setGenres] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });
  const [waveSeed] = useState(() => Array.from({ length: 14 }, () => 0.35 + Math.random() * 0.65));

  const showToast = useCallback((type, title, message) => setToast({ open: true, type, title, message }), []);

  const chipGenres = useMemo(() => {
    const match = LIBRARY_CHIPS.find((item) => item.label === chip);
    return match ? (match.genres || []).filter((genre) => genres.includes(genre)) : [];
  }, [chip, genres]);

  const genreFilter = useMemo(() => {
    if (chipGenres.length) return chipGenres[0];
    return '';
  }, [chipGenres]);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [audioResult, playlistsResult, downloadsResult, genresResult] = await Promise.allSettled([
        audioService.getAll({
          public: true,
          page,
          limit: PAGE_SIZE,
          search: listSearch.trim() || undefined,
          genre: genreFilter || undefined,
          cache: 'no-store',
        }),
        playlistService.getMine(),
        batch6Service.getDownloads({ page: 1, limit: 100 }),
        audioService.getAll({ public: true, page: 1, limit: 100, cache: 'no-store' }),
      ]);

      if (audioResult.status === 'fulfilled') {
        setAudio(audioResult.value?.data || []);
        setTotal(Number(audioResult.value?.pagination?.total) || 0);
        setTotalPages(Number(audioResult.value?.pagination?.totalPages) || 0);
      } else {
        setAudio([]);
        setTotal(0);
        setTotalPages(0);
      }
      if (playlistsResult.status === 'fulfilled') {
        setPlaylists(Array.isArray(playlistsResult.value?.data) ? playlistsResult.value.data : []);
      }
      if (downloadsResult.status === 'fulfilled') {
        setDownloads(Array.isArray(downloadsResult.value?.data?.downloads) ? downloadsResult.value.data.downloads : []);
      }
      if (genresResult.status === 'fulfilled') {
        const list = Array.isArray(genresResult.value?.data) ? genresResult.value.data : [];
        const seen = new Set();
        setGenres(list.map((track) => String(track.genre || '')).filter((value) => value && !seen.has(value) && seen.add(value)));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, listSearch, genreFilter]);

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

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const onCatalogChanged = (event) => {
      if (!event?.entity || ['audio', 'profile', 'station'].includes(event.entity)) {
        void load({ silent: true });
      }
    };

    realtimeService.subscribeToCatalog(onCatalogChanged)
      .then((cleanup) => {
        if (active) unsubscribe = cleanup;
        else cleanup();
      })
      .catch(() => {
        // The existing interval and focus refresh remain the fallback.
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [load]);

  const playAudio = (track) => {
    const id = idOf(track);
    if (!id) return;
    if (idOf(currentTrack) === id) {
      togglePlay();
      return;
    }
    playTrack({
      id,
      title: track.title || 'Untitled Audio',
      subtitle: (track.artist && typeof track.artist === 'object'
        ? track.artist.displayName || track.artist.username
        : track.artistName || 'Echoo Creator'),
      fileUrl: track.fileUrl,
      coverArt: track.coverArt || null,
      duration: Number(track.duration) || 0,
      genre: track.genre || 'Audio',
    });
  };

  const requestDownload = async (track) => {
    const id = idOf(track);
    if (!id || busyId) return;
    try {
      setBusyId(id);
      await batch6Service.requestDownload(id, 'medium');
      showToast('success', 'Download started', `${track.title || 'Audio'} is being prepared.`);
      const downloadsResult = await batch6Service.getDownloads({ page: 1, limit: 100 });
      setDownloads(Array.isArray(downloadsResult?.data?.downloads) ? downloadsResult.data.downloads : []);
    } catch (error) {
      showToast('error', 'Could not start download', error?.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  };

  const downloadIds = useMemo(
    () => new Set(downloads.map((item) => idOf(item))),
    [downloads]
  );

  const applySearch = () => {
    setPage(1);
  };

  const clearFilters = () => {
    setListSearch('');
    setChip('All audio');
    setSort('recent');
    setPage(1);
  };

  const scrollToMain = () => {
    const section = document.getElementById('al-main-section');
    if (section) section.scrollIntoView({ block: 'start' });
  };

  const pageNumbers = useMemo(() => {
    const pages = [];
    const max = Math.min(totalPages, 5);
    for (let index = 1; index <= max; index += 1) pages.push(index);
    return pages;
  }, [totalPages]);

  if (loading) {
    return <main className="echoo-reference-page ref-library-page"><div className="ref-state-card"><strong>Loading your Library...</strong></div></main>;
  }

  return (
    <main className="echoo-reference-page ref-library-page al-page">
      <ListenerToast {...toast} onClose={() => setToast((current) => ({ ...current, open: false }))} />

      <header className="al-page-heading">
        <div className="al-heading-text">
          <h1>Audio library</h1>
          <p>Discover and listen to recorded audio from creators and stations.</p>
        </div>
      </header>

      <div className="al-chips" role="tablist" aria-label="Audio types">
        {LIBRARY_CHIPS.map((item) => {
          const hasMatchingGenre = item.label === 'All audio' || item.genres.some((genre) => genres.includes(genre));
          return (
            <button
              type="button"
              role="tab"
              key={item.label}
              aria-selected={chip === item.label}
              className={`al-chip${chip === item.label ? ' al-chip-active' : ''}`}
              onClick={() => { if (hasMatchingGenre || item.label === 'All audio') { setChip(item.label); setPage(1); } }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <section className="al-hero">
        <div className="al-hero-copy">
          <h2>
            Audio that <span>inspires.</span>
            <br />
            Anytime, anywhere.
          </h2>
          <p>Stream or download your favorite shows and messages.</p>
          <button type="button" className="al-hero-cta" onClick={scrollToMain}>Explore audio</button>
        </div>
        <div className="al-hero-visual" aria-hidden>
          <span className="al-waveform al-waveform-left">
            {waveSeed.slice(0, 7).map((value, index) => (
              <i key={`l${index}`} style={{ height: `${value * 34 + 6}px` }} />
            ))}
          </span>
          <span className="al-headphones-card">
            <FaHeadphones />
          </span>
          <span className="al-waveform al-waveform-right">
            {waveSeed.slice(7).map((value, index) => (
              <i key={`r${index}`} style={{ height: `${value * 34 + 6}px` }} />
            ))}
          </span>
        </div>
      </section>

      <div className="al-layout">
        <div className="al-main">
          <div className="al-section-header">
            <div className="al-section-title">
              <h2>All audio</h2>
              <span className="al-count">{total.toLocaleString()} items</span>
            </div>
            <div className="al-section-tools">
              <span className="al-list-search">
                <FaSearch />
                <input
                  type="text"
                  value={listSearch}
                  placeholder="Search audio..."
                  maxLength={100}
                  onChange={(event) => setListSearch(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') applySearch(); }}
                />
                {listSearch && (
                  <button type="button" aria-label="Clear search" onClick={() => { setListSearch(''); setPage(1); }}>×</button>
                )}
              </span>
              <span className="al-sort-select">
                <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort audio">
                  <option value="recent">Recently added</option>
                  <option value="longest">Longest first</option>
                  <option value="shortest">Shortest first</option>
                </select>
              </span>
            </div>
          </div>

          <section className="al-list" id="al-main-section">
            {audio.length === 0 && (
              <div className="ref-state-card compact">
                <FaHeadphones />
                <strong>No audio matches your filters.</strong>
                <span>Try a different search or clear the filters.</span>
              </div>
            )}
            {audio.map((track) => {
              const id = idOf(track);
              const playing = isPlaying && idOf(currentTrack) === id;
              const downloaded = downloadIds.has(id);
              return (
                <article className="al-row" key={id}>
                  <button type="button" className="al-row-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => playAudio(track)}>
                    {playing ? <FaPause /> : <FaPlay />}
                  </button>
                  <button type="button" className="al-row-art" onClick={() => navigate(`/listen/audio/${id}`)}>
                    {track.coverArt ? <img src={track.coverArt} alt="" /> : <span>{initials(track.title)}</span>}
                  </button>
                  <div className="al-row-info" onClick={() => navigate(`/listen/audio/${id}`)}>
                    <strong>{track.title || 'Untitled Audio'}</strong>
                    <ArtistName track={track} />
                  </div>
                  <span className="al-type-pill">{typeLabelFor(track.genre)}</span>
                  <span className="al-category">{track.genre || 'Audio'}</span>
                  <div className="al-row-meta">
                    <strong>{formatDuration(track.duration)}</strong>
                    <span>{formatDate(track.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    className="al-row-more"
                    title={downloaded ? 'Already downloaded' : 'Download'}
                    aria-label={downloaded ? 'Already downloaded' : `Download ${track.title || 'audio'}`}
                    disabled={busyId === id || downloaded}
                    onClick={() => requestDownload(track)}
                  >
                    <FaDownload />
                  </button>
                </article>
              );
            })}
          </section>

          {totalPages > 1 && (
            <nav className="al-pagination" aria-label="Audio pages">
              <button
                type="button"
                className="al-page-btn"
                disabled={page <= 1}
                aria-label="Previous page"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <FaChevronLeft />
              </button>
              {pageNumbers.map((number) => (
                <button
                  type="button"
                  key={number}
                  className={`al-page-btn${page === number ? ' al-page-active' : ''}`}
                  onClick={() => setPage(number)}
                >
                  {number}
                </button>
              ))}
              {totalPages > 5 && <span className="al-page-ellipsis">…</span>}
              {totalPages > 5 && (
                <button
                  type="button"
                  className={`al-page-btn${page === totalPages ? ' al-page-active' : ''}`}
                  onClick={() => setPage(totalPages)}
                >
                  {totalPages}
                </button>
              )}
              <button
                type="button"
                className="al-page-btn"
                disabled={page >= totalPages}
                aria-label="Next page"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                <FaChevronRight />
              </button>
            </nav>
          )}
        </div>

        <aside className="al-sidebar">
          <section className="al-card al-filters-card">
            <div className="al-card-header">
              <strong><FaSlidersH /> Filters</strong>
              <button type="button" className="al-clear" onClick={clearFilters}>Clear all</button>
            </div>
            <label className="al-field">
              <span>Audio type</span>
              <span className="al-select-wrap">
                <select
                  value={chip}
                  onChange={(event) => { setChip(event.target.value); setPage(1); }}
                  aria-label="Audio type"
                >
                  {LIBRARY_CHIPS.map((item) => (
                    <option key={item.label} value={item.label}>{item.label === 'All audio' ? 'All types' : item.label}</option>
                  ))}
                </select>
                <FaChevronDown />
              </span>
            </label>
            <label className="al-field">
              <span>Category</span>
              <span className="al-select-wrap">
                <select
                  value={genreFilter || ''}
                  onChange={(event) => {
                    setChip(event.target.value ? LIBRARY_CHIPS.find((item) => item.genres.includes(event.target.value))?.label || 'All audio' : 'All audio');
                    setPage(1);
                  }}
                  aria-label="Category"
                >
                  <option value="">All categories</option>
                  {genres.map((genre) => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>
                <FaChevronDown />
              </span>
            </label>
            <label className="al-field">
              <span>Duration</span>
              <span className="al-select-wrap">
                <select value="" aria-label="Duration">
                  <option value="">Any duration</option>
                  <option value="short">Under 15 minutes</option>
                  <option value="medium">15–45 minutes</option>
                  <option value="long">Over 45 minutes</option>
                </select>
                <FaChevronDown />
              </span>
            </label>
            <label className="al-field">
              <span>Date added</span>
              <span className="al-select-wrap">
                <select value="" aria-label="Date added">
                  <option value="">Anytime</option>
                  <option value="today">Today</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                </select>
                <FaChevronDown />
              </span>
            </label>
            <div className="al-field al-radios">
              <span>Show only</span>
              <label className="al-radio">
                <input type="radio" name="al-show-only" value="downloaded" disabled title="Downloaded audio only" />
                <span>Downloaded</span>
              </label>
              <label className="al-radio">
                <input type="radio" name="al-show-only" value="not-playlisted" disabled title="Audio not in your playlist" />
                <span>Not in my playlist</span>
              </label>
              <small className="al-radio-note">Live filters update as you browse. Downloaded and playlist filters are read-only in this preview.</small>
            </div>
            <button type="button" className="al-apply-btn" onClick={() => { applySearch(); scrollToMain(); }}>Apply filters</button>
          </section>

          <section className="al-card al-playlist-card">
            <div className="al-card-header">
              <strong>My playlist</strong>
              <button type="button" className="al-clear" onClick={() => navigate('/listen/library/following')}>View all <FaAngleDoubleRight /></button>
            </div>
            {playlists.length === 0 && (
              <p className="al-empty-note">No playlists yet. Create one to organize your audio.</p>
            )}
            {playlists.slice(0, 3).map((playlist) => {
              const count = Number(playlist.trackCount) || Number(playlist.tracks?.length) || 0;
              return (
                <article className="al-playlist-row" key={idOf(playlist)}>
                  <span className="al-playlist-art"><FaHeadphones /></span>
                  <div className="al-playlist-info">
                    <strong>{playlist.name}</strong>
                    <span>{count} items</span>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="al-card al-offline-card">
            <span className="al-offline-icon"><FaDownload /></span>
            <strong>Listen offline</strong>
            <p>Download your favorite audio and listen anytime, anywhere.</p>
            <button type="button" className="al-offline-btn" onClick={() => navigate('/listen/downloads')}>Go to downloads</button>
          </section>
        </aside>
      </div>
    </main>
  );
};

export default ListenerLibrary;
