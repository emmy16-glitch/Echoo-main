import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FaAngleRight,
  FaHeadphones,
  FaHeart,
  FaListUl,
  FaLock,
  FaPause,
  FaPlay,
  FaPlus,
  FaTrash,
} from 'react-icons/fa';
import batch6Service from '../../services/batch6Service';
import listenerService from '../../services/listenerService';
import playlistService from '../../services/playlistService';
import ListenerToast from '../ListenerUI/ListenerToast';
import '../../styles/listener-reference-pages.css';
import './ListenerPlaylist.css';

const TABS = ['All', 'My playlists', 'Downloaded'];
const idOf = (item) => String(item?.id || item?._id || '');

const formatDuration = (seconds) => {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

const relativeTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
};

const compactNumber = (value) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);

export default function ListenerPlaylist() {
  const { playTrack, currentTrack, isPlaying } = useOutletContext();
  const [tab, setTab] = useState('All');
  const [sort, setSort] = useState('recent');
  const [playlists, setPlaylists] = useState([]);
  const [continueListening, setContinueListening] = useState([]);
  const [publicPlaylists, setPublicPlaylists] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });
  const [busyId, setBusyId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');

  const showToast = useCallback((type, title, message) =>
    setToast({ open: true, type, title, message }), []);

  const load = useCallback(async () => {
    const [mineResult, contResult, pubResult, histResult, dlResult] = await Promise.allSettled([
      playlistService.getMine(),
      listenerService.getContinueListening(),
      playlistService.getAll({ page: 1, limit: 40, search: '' }),
      listenerService.getHistory(1, 20),
      batch6Service.getDownloads({ limit: 100 }),
    ]);

    if (mineResult.status === 'fulfilled') {
      const list = Array.isArray(mineResult.value?.data) ? mineResult.value.data : [];
      setPlaylists(list);
    }
    if (contResult.status === 'fulfilled') {
      const cont = Array.isArray(contResult.value?.data) ? contResult.value.data : [];
      setContinueListening(cont.filter((t) => t?.id));
    }
    if (pubResult.status === 'fulfilled') {
      const list = Array.isArray(pubResult.value?.data) ? pubResult.value.data : [];
      setPublicPlaylists(list.filter((p) => Array.isArray(p.tracks) && p.tracks.length > 0));
    }
    if (histResult.status === 'fulfilled') {
      const raw = histResult.value?.data || {};
      const history = Array.isArray(raw.history) ? raw.history : [];
      const recent = history
        .map((entry) => (entry?.track && typeof entry.track === 'object' ? entry.track : null))
        .filter(Boolean)
        .slice(0, 3);
      setRecentlyPlayed(recent);
    }
    if (dlResult.status === 'fulfilled') {
      const raw = dlResult.value?.data || {};
      const list = Array.isArray(raw.downloads) ? raw.downloads : [];
      setDownloads(list.filter((d) => d?.track));
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  const handlePlay = useCallback(
    (track) => {
      if (!track?.id) return;
      if (currentTrack?.id === track.id && isPlaying) {
        return;
      }
      playTrack({
        id: track.id,
        title: track.title,
        artistName: track.artistName,
        fileUrl: track.fileUrl,
        coverArt: track.coverArt || track.artwork,
        duration: track.duration,
      });
    },
    [playTrack, currentTrack, isPlaying],
  );

  const handleContinuePlay = useCallback(
    (track) => {
      handlePlay(track);
    },
    [handlePlay],
  );

  const handleCreatePlaylist = useCallback(async () => {
    const name = createName.trim();
    if (!name) {
      showToast('error', 'Name required', 'Give your playlist a name first.');
      return;
    }
    try {
      setBusyId('create');
      const result = await playlistService.create({
        name,
        description: createDesc.trim(),
        isPublic: false,
      });
      const created = result?.data || {};
      if (created?.id) {
        showToast('success', 'Playlist created', `"${name}" is ready.`);
        setCreateName('');
        setCreateDesc('');
        setCreateOpen(false);
        await load();
      } else {
        showToast('error', 'Could not create', 'Something went wrong creating the playlist.');
      }
    } catch {
      showToast('error', 'Could not create', 'Something went wrong creating the playlist.');
    } finally {
      setBusyId('');
    }
  }, [createName, createDesc, showToast, load]);

  const handleDeletePlaylist = useCallback(
    async (playlist) => {
      const pid = idOf(playlist);
      if (!pid) return;
      try {
        setBusyId(pid);
        await playlistService.delete(pid);
        showToast('success', 'Playlist deleted', `"${playlist.name || 'Playlist'}" was removed.`);
        await load();
      } catch {
        showToast('error', 'Could not delete', 'Something went wrong deleting the playlist.');
      } finally {
        setBusyId('');
      }
    },
    [showToast, load],
  );

  const sortLists = (list) => {
    if (sort === 'name') return [...list].sort((a, b) => String(a.name || '').localeCompare(b.name || ''));
    if (sort === 'tracks') return [...list].sort((a, b) => (b.tracks?.length || 0) - (a.tracks?.length || 0));
    return list; // recently updated (server order)
  };

  const downloadedTracks = useMemo(() => {
    const seen = new Set();
    return downloads
      .map((d) => d.track)
      .filter((t) => t && !seen.has(idOf(t)) && (seen.add(idOf(t)), true));
  }, [downloads]);

  const myPlaylists = sortLists(playlists);
  const topPublic = sortLists(publicPlaylists).slice(0, 5);

  return (
    <div className="pl-page">
      <div className="pl-heading">
        <div className="pl-heading-text">
          <h1>Playlist</h1>
          <p>Create, manage and enjoy your favorite audio collections.</p>
        </div>
      </div>

      <div className="pl-hero">
        <div className="pl-hero-content">
          <span className="pl-hero-kicker">My playlists</span>
          <h2>Your favorite audio, in one place.</h2>
          <p>Organize, listen and revisit the content you love.</p>
          <button type="button" className="pl-hero-cta" onClick={() => setCreateOpen((o) => !o)}>
            <FaPlus /> {createOpen ? 'Close' : 'Create playlist'}
          </button>
          {createOpen && (
            <div className="pl-create-form">
              <input
                type="text"
                placeholder="Playlist name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
              />
              <button
                type="button"
                className="pl-create-btn"
                disabled={busyId === 'create'}
                onClick={handleCreatePlaylist}
              >
                Create
              </button>
            </div>
          )}
        </div>
        <div className="pl-hero-visual" aria-hidden="true">
          <FaHeadphones />
          <span className="pl-hero-ring pl-hero-ring--1" />
          <span className="pl-hero-ring pl-hero-ring--2" />
        </div>
      </div>

      <div className="pl-controls">
        <div className="pl-tabs" role="tablist">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={`pl-tab ${tab === name ? 'pl-tab-active' : ''}`}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <select
          className="pl-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort playlists"
        >
          <option value="recent">Recently updated</option>
          <option value="name">Name</option>
          <option value="tracks">Most tracks</option>
        </select>
      </div>

      <div className="pl-layout">
        <div className="pl-main">
          {tab === 'Downloaded' ? (
            <section className="pl-section">
              <div className="pl-section-header">
                <h2>Downloaded</h2>
                <span className="pl-count">{downloadedTracks.length} items</span>
              </div>
              {downloadedTracks.length === 0 ? (
                <div className="pl-empty">
                  <FaListUl />
                  <strong>Nothing downloaded yet.</strong>
                  <p>Go to the Downloads page to save audio for offline listening.</p>
                </div>
              ) : (
                <div className="pl-download-grid">
                  {downloadedTracks.map((track) => (
                    <div key={idOf(track)} className="pl-download-card">
                      <div className="pl-download-art">
                        <img src={track.coverArt || track.artwork} alt={track.title || 'Audio'} />
                      </div>
                      <div className="pl-download-info">
                        <strong>{track.title || 'Untitled audio'}</strong>
                        <span>{track.artistName || track.genre || 'Audio'}</span>
                      </div>
                      <button
                        type="button"
                        className="pl-download-play"
                        aria-label="Play"
                        onClick={() => handlePlay(track)}
                      >
                        <FaPlay />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="pl-section">
                <div className="pl-section-header">
                  <h2>{tab === 'My playlists' ? 'My playlists' : 'My playlists'}</h2>
                  <button type="button" className="pl-view-all">
                    View all <FaAngleRight />
                  </button>
                </div>
                {myPlaylists.length === 0 ? (
                  <div className="pl-empty">
                    <FaListUl />
                    <strong>No playlists yet.</strong>
                    <p>Create a playlist to organize the audio you love.</p>
                  </div>
                ) : (
                  <div className="pl-playlist-grid">
                    {myPlaylists.map((playlist) => {
                      const trackCount = Array.isArray(playlist.tracks) ? playlist.tracks.length : 0;
                      const firstTrack = Array.isArray(playlist.tracks) ? playlist.tracks[0] : null;
                      return (
                        <div key={idOf(playlist)} className="pl-playlist-card">
                          <div className="pl-playlist-art">
                            <img
                              src={playlist.coverArt}
                              alt={playlist.name || 'Playlist'}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <span className="pl-playlist-art-badge">
                              <FaPlay /> {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
                            </span>
                            <button
                              type="button"
                              className="pl-playlist-art-play"
                              aria-label="Play playlist"
                              onClick={() => firstTrack && handlePlay(firstTrack)}
                            >
                              <FaPlay />
                            </button>
                          </div>
                          <div className="pl-playlist-info">
                            <strong>{playlist.name || 'Untitled Playlist'}</strong>
                            <span>{playlist.description || 'No description'}</span>
                            <div className="pl-playlist-meta">
                              <span className="pl-privacy">
                                <FaLock /> {playlist.isPublic ? 'Public' : 'Private'}
                              </span>
                              <button
                                type="button"
                                className="pl-more-btn"
                                aria-label="More options"
                                onClick={() => handleDeletePlaylist(playlist)}
                              >
                                <FaTrash />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="pl-section">
                <div className="pl-section-header">
                  <h2>Continue listening</h2>
                  <button type="button" className="pl-view-all">
                    View all <FaAngleRight />
                  </button>
                </div>
                {continueListening.length === 0 ? (
                  <div className="pl-empty">
                    <FaHeadphones />
                    <strong>Nothing in progress.</strong>
                    <p>Play some audio and your listening progress will appear here.</p>
                  </div>
                ) : (
                  <div className="pl-continue-list">
                    {continueListening.map((track) => {
                      const playing = currentTrack?.id === track.id;
                      const elapsed = Number(track.progress) || 0;
                      const total = Number(track.duration) || 0;
                      const percent = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
                      return (
                        <div key={idOf(track)} className="pl-continue-row">
                          <div className="pl-continue-art">
                            <img src={track.coverArt || track.artwork} alt={track.title || 'Audio'} />
                            <button
                              type="button"
                              className="pl-continue-art-play"
                              aria-label={playing && isPlaying ? 'Pause' : 'Play'}
                              onClick={() => handleContinuePlay(track)}
                            >
                              {playing && isPlaying ? <FaPause /> : <FaPlay />}
                            </button>
                          </div>
                          <div className="pl-continue-info">
                            <strong>{track.title || 'Untitled audio'}</strong>
                            <span>{track.artistName || track.genre || 'Audio'}</span>
                          </div>
                          <div className="pl-continue-progress">
                            <div className="pl-progress-track">
                              <span className="pl-progress-fill" style={{ width: `${percent}%` }} />
                            </div>
                            <span className="pl-progress-times">
                              {formatDuration(elapsed)} / {formatDuration(total)}
                            </span>
                          </div>
                          <span className="pl-continue-when">{relativeTime(track.playedAt)}</span>
                          <button
                            type="button"
                            className="pl-continue-play"
                            aria-label={playing && isPlaying ? 'Pause' : 'Play'}
                            onClick={() => handleContinuePlay(track)}
                          >
                            {playing && isPlaying ? <FaPause /> : <FaPlay />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="pl-section">
                <div className="pl-section-header">
                  <h2>Popular playlists</h2>
                  <button type="button" className="pl-view-all">
                    View all <FaAngleRight />
                  </button>
                </div>
                {topPublic.length === 0 ? (
                  <div className="pl-empty">
                    <FaHeart />
                    <strong>No public playlists yet.</strong>
                    <p>When creators publish playlists, they will show up here.</p>
                  </div>
                ) : (
                  <div className="pl-popular-grid">
                    {topPublic.map((playlist) => {
                      const trackCount = Array.isArray(playlist.tracks) ? playlist.tracks.length : 0;
                      const listens = Number(playlist.listenerCount || playlist.listens || 0);
                      return (
                        <button
                          key={idOf(playlist)}
                          type="button"
                          className="pl-popular-card"
                          onClick={() => {
                            const first = Array.isArray(playlist.tracks) ? playlist.tracks[0] : null;
                            if (first) handlePlay(first);
                          }}
                        >
                          <span className="pl-popular-art">
                            <img src={playlist.coverArt} alt={playlist.name || 'Playlist'} />
                            <span className="pl-popular-art-play" aria-hidden="true"><FaPlay /></span>
                          </span>
                          <strong>{playlist.name || 'Untitled Playlist'}</strong>
                          <span className="pl-popular-meta">
                            {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
                            {listens > 0 ? ` • ${compactNumber(listens)} listens` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="pl-sidebar">
          <div className="pl-card">
            <div className="pl-card-header">
              <strong>Recently played</strong>
              <button type="button" className="pl-view-all">
                View all <FaAngleRight />
              </button>
            </div>
            {recentlyPlayed.length === 0 ? (
              <p className="pl-empty-note">No recent plays yet.</p>
            ) : (
              <div className="pl-recent-list">
                {recentlyPlayed.map((track) => (
                  <button
                    key={idOf(track)}
                    type="button"
                    className="pl-recent-row"
                    onClick={() => handlePlay(track)}
                  >
                    <span className="pl-recent-art">
                      <img src={track.coverArt || track.artwork} alt={track.title || 'Audio'} />
                    </span>
                    <span className="pl-recent-info">
                      <strong>{track.title || 'Untitled audio'}</strong>
                      <span>{track.artistName || track.genre || 'Audio'}</span>
                      <span className="pl-recent-when">{relativeTime(track.playedAt)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pl-card">
            <div className="pl-card-header">
              <strong>Top playlists</strong>
              <button type="button" className="pl-view-all">
                View all <FaAngleRight />
              </button>
            </div>
            {topPublic.length === 0 ? (
              <p className="pl-empty-note">No playlists yet.</p>
            ) : (
              <div className="pl-top-list">
                {topPublic.map((playlist, index) => {
                  const trackCount = Array.isArray(playlist.tracks) ? playlist.tracks.length : 0;
                  const listens = Number(playlist.listenerCount || playlist.listens || 0);
                  return (
                    <div key={idOf(playlist)} className="pl-top-row">
                      <span className="pl-top-rank">{index + 1}</span>
                      <span className="pl-top-art">
                        <img src={playlist.coverArt} alt={playlist.name || 'Playlist'} />
                      </span>
                      <span className="pl-top-info">
                        <strong>{playlist.name || 'Untitled Playlist'}</strong>
                        <span>
                          {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
                          {listens > 0 ? ` • ${compactNumber(listens)} listens` : ''}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pl-card pl-cta-card">
            <FaHeadphones />
            <strong>Love Echoo?</strong>
            <p>Create your own playlists and share them with others.</p>
            <button type="button" className="pl-cta-btn" onClick={() => setCreateOpen(true)}>
              Create playlist
            </button>
          </div>
        </aside>
      </div>

      <ListenerToast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </div>
  );
}
