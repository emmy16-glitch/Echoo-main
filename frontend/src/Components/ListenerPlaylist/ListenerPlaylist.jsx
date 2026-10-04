import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FaListUl,
  FaLock,
  FaPause,
  FaPlay,
  FaPlus,
  FaTrash,
} from 'react-icons/fa';

import playlistService from '../../services/playlistService';
import { useGuestAuth } from '../Auth/GuestAuthGate';
import ListenerHeroArtwork from '../ListenerHeroArtwork/ListenerHeroArtwork';
import ListenerToast from '../ListenerUI/ListenerToast';
import './ListenerPlaylist.css';

const idOf = (item) => String(item?.id || item?._id || '');

export default function ListenerPlaylist() {
  const { requestAuth, isGuest } = useGuestAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();
  const [sort, setSort] = useState('recent');
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });
  const [busyId, setBusyId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');

  const showToast = useCallback(
    (type, title, message) => setToast({ open: true, type, title, message }),
    [],
  );

  const load = useCallback(async () => {
    if (isGuest) {
      setPlaylists([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await playlistService.getMine();
      setPlaylists(Array.isArray(result?.data) ? result.data : []);
    } catch {
      showToast('error', 'Could not load playlists', 'Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [isGuest, showToast]);

  useEffect(() => {
    load();
  }, [load]);

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
    [currentTrack, playTrack, togglePlay],
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
        destination: '/listen/playlist',
        resume: async () => {
          await playlistService.create({
            name,
            description: createDesc.trim(),
            isPublic: false,
          });
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

      if (!idOf(created)) {
        throw new Error('Playlist creation returned no playlist.');
      }

      setCreateName('');
      setCreateDesc('');
      setCreateOpen(false);
      showToast('success', 'Playlist created', `"${name}" is ready.`);
      await load();
    } catch {
      showToast('error', 'Could not create', 'Something went wrong creating the playlist.');
    } finally {
      setBusyId('');
    }
  }, [createDesc, createName, isGuest, load, requestAuth, showToast]);

  const handleDeletePlaylist = useCallback(
    async (playlist) => {
      const playlistId = idOf(playlist);
      if (!playlistId || busyId) return;

      try {
        setBusyId(playlistId);
        await playlistService.delete(playlistId);
        setPlaylists((items) => items.filter((item) => idOf(item) !== playlistId));
        showToast('success', 'Playlist deleted', `"${playlist.name || 'Playlist'}" was removed.`);
      } catch {
        showToast('error', 'Could not delete', 'Something went wrong deleting the playlist.');
      } finally {
        setBusyId('');
      }
    },
    [busyId, showToast],
  );

  const sortedPlaylists = [...playlists].sort((a, b) => {
    if (sort === 'name') {
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    }
    if (sort === 'tracks') {
      return (b?.tracks?.length || 0) - (a?.tracks?.length || 0);
    }

    const aDate = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bDate = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bDate - aDate;
  });

  return (
    <div className="pl-page">
      <ListenerHeroArtwork className="listener-hero-artwork--playlist" />

      <div className="pl-heading">
        <div className="pl-heading-text">
          <h1>Playlists</h1>
          <p>Create and organize the audio you want to keep together.</p>
        </div>
        <button
          type="button"
          className="pl-hero-cta"
          onClick={() => setCreateOpen((open) => !open)}
        >
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
            onChange={(event) => setCreateName(event.target.value)}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            aria-label="Playlist description"
            value={createDesc}
            onChange={(event) => setCreateDesc(event.target.value)}
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
        <span className="pl-count">
          {sortedPlaylists.length} {sortedPlaylists.length === 1 ? 'playlist' : 'playlists'}
        </span>
        <select
          className="pl-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort playlists"
        >
          <option value="recent">Recently updated</option>
          <option value="name">Name</option>
          <option value="tracks">Most tracks</option>
        </select>
      </div>

      <section className="pl-section" aria-label="Your playlists">

        {isGuest ? (
          <div className="pl-empty">
            <FaListUl />
            <strong>Sign in to keep playlists</strong>
            <p>Your playlists stay with your Echoo account across devices.</p>
            <button
              type="button"
              className="pl-create-btn"
              onClick={() => requestAuth({
                action: 'Open playlists',
                destination: '/listen/playlist',
              })}
            >
              Sign in
            </button>
          </div>
        ) : loading ? (
          <div className="listener-v2-row-skeleton" role="status" aria-label="Loading playlists">
            <span /><span /><span />
          </div>
        ) : sortedPlaylists.length === 0 ? (
          <div className="pl-empty">
            <FaListUl />
            <strong>No playlists yet.</strong>
            <p>Create a playlist to organize the audio you want to hear again.</p>
          </div>
        ) : (
          <div className="pl-playlist-grid">
            {sortedPlaylists.map((playlist) => {
              const trackCount = Array.isArray(playlist?.tracks) ? playlist.tracks.length : 0;
              const firstTrack = trackCount ? playlist.tracks[0] : null;
              const playing =
                firstTrack &&
                String(currentTrack?.id || '') === String(firstTrack.id) &&
                isPlaying;

              return (
                <article key={idOf(playlist)} className="pl-playlist-card">
                  <div className="pl-playlist-art">
                    {playlist.coverArt ? (
                      <img src={playlist.coverArt} alt="" />
                    ) : (
                      <span aria-hidden="true"><FaListUl /></span>
                    )}
                    <span className="pl-playlist-art-badge">
                      {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
                    </span>
                    <button
                      type="button"
                      className="pl-playlist-art-play"
                      aria-label={`${playing ? 'Pause' : 'Play'} ${playlist.name || 'playlist'}`}
                      disabled={!firstTrack}
                      onClick={() => handlePlaylistPlay(playlist)}
                    >
                      {playing ? <FaPause /> : <FaPlay />}
                    </button>
                  </div>

                  <div className="pl-playlist-info">
                    <strong>{playlist.name || 'Untitled playlist'}</strong>
                    {playlist.description && <span>{playlist.description}</span>}
                    <div className="pl-playlist-meta">
                      <span className="pl-privacy">
                        <FaLock /> {playlist.isPublic ? 'Public' : 'Private'}
                      </span>
                      <button
                        type="button"
                        className="pl-more-btn"
                        aria-label={`Delete ${playlist.name || 'playlist'}`}
                        disabled={Boolean(busyId)}
                        onClick={() => handleDeletePlaylist(playlist)}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ListenerToast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((currentToast) => ({ ...currentToast, open: false }))}
      />
    </div>
  );
}
