import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaAngleRight,
  FaHeadphones,
  FaListUl,
  FaLock,
  FaPause,
  FaPlay,
  FaPlus,
  FaTrash,
} from 'react-icons/fa';
import listenerService from '../../services/listenerService';
import playlistService from '../../services/playlistService';
import ListenerToast from '../ListenerUI/ListenerToast';
import ListenerHeroArtwork from '../ListenerHeroArtwork/ListenerHeroArtwork';
import { useGuestAuth } from '../Auth/GuestAuthGate';
import '../../styles/listener-reference-pages.css';
import './ListenerPlaylist.css';

const TABS = ['All', 'My playlists'];
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


export default function ListenerPlaylist() {
  const navigate = useNavigate();
  const { requestAuth, isGuest } = useGuestAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();
  const [tab, setTab] = useState('All');
  const [sort, setSort] = useState('recent');
  const [playlists, setPlaylists] = useState([]);
  const [continueListening, setContinueListening] = useState([]);
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });
  const [busyId, setBusyId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');

  const showToast = useCallback((type, title, message) =>
    setToast({ open: true, type, title, message }), []);

  const load = useCallback(async () => {
    const [mineResult, contResult] = await Promise.allSettled([
      playlistService.getMine(),
      listenerService.getContinueListening(),
    ]);

    if (mineResult.status === 'fulfilled') {
      const list = Array.isArray(mineResult.value?.data) ? mineResult.value.data : [];
      setPlaylists(list);
    }
    if (contResult.status === 'fulfilled') {
      const cont = Array.isArray(contResult.value?.data) ? contResult.value.data : [];
      setContinueListening(cont.filter((t) => t?.id));
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
      if (String(currentTrack?.id || '') === String(track.id)) {
        togglePlay();
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
    [playTrack, currentTrack, togglePlay],
  );

  const handlePlaylistPlay = useCallback(
    (playlist) => {
      const queue = (Array.isArray(playlist?.tracks) ? playlist.tracks : [])
        .filter((track) => track?.id && track?.fileUrl);
      if (!queue.length) return;
      const firstTrack = queue[0];
      if (String(currentTrack?.id || '') === String(firstTrack.id)) {
        togglePlay();
        return;
      }
      playTrack({
        id: firstTrack.id,
        title: firstTrack.title,
        artistName: firstTrack.artistName,
        fileUrl: firstTrack.fileUrl,
        coverArt: firstTrack.coverArt || firstTrack.artwork,
        duration: firstTrack.duration,
      }, queue);
    },
    [playTrack, currentTrack, togglePlay],
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
    if (isGuest) {
      requestAuth({
        action: 'Save playlist',
        title: 'Save this playlist?',
        message: 'Create an Echoo account to keep your library across devices.',
        resume: async () => {
          await playlistService.create({ name, description: createDesc.trim(), isPublic: false });
          await load();
        },
      });
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
        setTab('My playlists');
        await load();
      } else {
        showToast('error', 'Could not create', 'Something went wrong creating the playlist.');
      }
    } catch {
      showToast('error', 'Could not create', 'Something went wrong creating the playlist.');
    } finally {
      setBusyId('');
    }
  }, [createName, createDesc, showToast, load, isGuest, requestAuth]);

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
    return list;
  };

  const myPlaylists = sortLists(playlists);

  return (
    <div className="pl-page">
      <ListenerHeroArtwork className="listener-hero-artwork--playlist" />
      <div className="pl-heading">
        <div className="pl-heading-text">
          <h1>Playlists</h1>
          <p>Play a collection, continue listening, or organize your own.</p>
        </div>
        <button type="button" className="pl-hero-cta" onClick={() => setCreateOpen((open) => !open)}>
          <FaPlus /> {createOpen ? 'Close' : 'Create playlist'}
        </button>
      </div>

      {createOpen && (
        <div className="pl-create-form pl-create-form--panel">
          <input
            type="text"
            placeholder="Playlist name"
            aria-label="Playlist name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            aria-label="Playlist description"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
          />
          <button
            type="button"
            className="pl-create-btn"
            disabled={busyId === 'create'}
            onClick={handleCreatePlaylist}
          >
            {busyId === 'create' ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

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
          <>
              <section className="pl-section">
                <div className="pl-section-header">
                  <h2>My playlists</h2>
                  {tab === 'All' && (
                    <button type="button" className="pl-view-all" onClick={() => setTab('My playlists')}>
                      View all <FaAngleRight />
                    </button>
                  )}
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
                      const playing = firstTrack && String(currentTrack?.id || '') === String(firstTrack.id) && isPlaying;
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
                              aria-label={`${playing ? 'Pause' : 'Play'} ${playlist.name || 'playlist'}`}
                              disabled={!firstTrack}
                              onClick={() => firstTrack && handlePlaylistPlay(playlist)}
                            >
                              {playing ? <FaPause /> : <FaPlay />}
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
                                aria-label={`Delete ${playlist.name || 'playlist'}`}
                                disabled={busyId === idOf(playlist)}
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

              {tab === 'All' && (
                <>
                  <section className="pl-section">
                    <div className="pl-section-header">
                      <h2>Continue listening</h2>
                      <button type="button" className="pl-view-all" onClick={() => navigate('/listen/history')}>
                        View history <FaAngleRight />
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
                          const playing = String(currentTrack?.id || '') === String(track.id);
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


                </>
              )}
            </>
        </div>


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
