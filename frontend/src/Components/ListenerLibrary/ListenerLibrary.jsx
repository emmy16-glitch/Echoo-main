import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaBookOpen,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaPlus,
  FaTrash,
} from 'react-icons/fa';

import audioService from '../../services/audioService';
import batch1Service from '../../services/batch1Service';
import playlistService from '../../services/playlistService';
import ListenerModal from '../ListenerUI/ListenerModal';
import ListenerToast from '../ListenerUI/ListenerToast';
import '../ListenerUI/ListenerBeautiful.css';
import './ListenerLibrary.css';

const getTrackId = (track) => track?.id || track?._id || null;

const getArtist = (track) =>
  track?.artistName ||
  track?.artist?.displayName ||
  track?.artist?.username ||
  track?.subtitle ||
  'Echoo Creator';

const AudioArtwork = ({ track }) => {
  const [failed, setFailed] = useState(false);
  const image = failed ? null : track?.coverArt || null;

  if (image) {
    return (
      <img
        src={image}
        alt=""
        draggable="false"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="figma-library-audio-fallback">
      <FaHeadphones />
    </div>
  );
};

const ListenerLibrary = () => {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();

  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [addingTrack, setAddingTrack] = useState(null);

  const [toast, setToast] = useState({
    open: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showToast = (type, title, message) => {
    setToast({ open: true, type, title, message });
  };

  const loadLibrary = async () => {
    try {
      setLoading(true);
      setError('');

      const [savedResult, playlistsResult] = await Promise.all([
        batch1Service.getSavedTracks({ page: 1, limit: 100 }),
        playlistService.getMine(),
      ]);

      const saved = Array.isArray(savedResult?.data?.tracks)
        ? savedResult.data.tracks.map(audioService.normalize).filter(Boolean)
        : [];

      setTracks(saved);
      setPlaylists(Array.isArray(playlistsResult?.data) ? playlistsResult.data : []);
    } catch (loadError) {
      console.error('Library load:', loadError);
      setTracks([]);
      setPlaylists([]);
      setError(loadError?.message || 'Could not load your library.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  const totalPlaylistTracks = useMemo(
    () => playlists.reduce((total, playlist) => total + (Number(playlist.trackCount) || 0), 0),
    [playlists]
  );

  const playAudio = (track) => {
    const id = getTrackId(track);
    const same = String(currentTrack?.id || '') === String(id || '');

    if (same) {
      togglePlay();
      return;
    }

    playTrack(
      {
        ...track,
        id,
        title: track.title || 'Untitled Audio',
        subtitle: getArtist(track),
        coverArt: track.coverArt || null,
        fileUrl: track.fileUrl || null,
        duration: Number(track.duration) || 0,
        genre: track.genre || 'Audio',
      },
      tracks
    );
  };

  const removeSaved = async (track) => {
    const id = getTrackId(track);
    if (!id || busyId) return;

    try {
      setBusyId(`save-${id}`);
      await batch1Service.unsaveTrack(id);
      setTracks((current) => current.filter((item) => String(getTrackId(item)) !== String(id)));
      showToast('success', 'Removed from Library', `“${track.title || 'Audio'}” was removed.`);
    } catch (removeError) {
      showToast('error', 'Could not remove audio', removeError?.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  };

  const createPlaylist = async (event) => {
    event.preventDefault();
    const name = playlistName.trim();
    if (!name || busyId) return;

    try {
      setBusyId('create-playlist');
      const response = await playlistService.create({
        name,
        description: playlistDescription.trim(),
        isPublic: false,
        isCollaborative: false,
      });

      if (!response?.data?.id) {
        throw new Error('Echoo did not return the new playlist.');
      }

      setPlaylists((current) => [response.data, ...current]);
      setPlaylistName('');
      setPlaylistDescription('');
      setCreateOpen(false);
      showToast('success', 'Playlist created', `${response.data.name} is ready.`);
    } catch (createError) {
      showToast('error', 'Could not create playlist', createError?.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  };

  const addToPlaylist = async (playlist) => {
    const trackId = getTrackId(addingTrack);
    if (!trackId || !playlist?.id || busyId) return;

    try {
      setBusyId(`playlist-${playlist.id}`);
      const response = await playlistService.addTrack(playlist.id, trackId);
      const updated = response?.data;

      if (updated?.id) {
        setPlaylists((current) =>
          current.map((item) => (String(item.id) === String(updated.id) ? updated : item))
        );
      } else {
        await loadLibrary();
      }

      showToast('success', 'Added to playlist', `“${addingTrack.title}” was added to ${playlist.name}.`);
      setAddingTrack(null);
    } catch (addError) {
      showToast('error', 'Could not add to playlist', addError?.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  };

  if (loading) {
    return <div className="figma-library-page">Loading your library...</div>;
  }

  return (
    <div className="figma-library-page">
      <ListenerToast
        {...toast}
        onClose={() => setToast((current) => ({ ...current, open: false }))}
      />

      <ListenerModal
        open={createOpen}
        title="Create playlist"
        subtitle="Organize saved Echoo audio into a private playlist."
        size="small"
        onClose={() => !busyId && setCreateOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="lb-button"
              disabled={Boolean(busyId)}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="echoo-create-playlist"
              className="lb-button primary"
              disabled={Boolean(busyId) || !playlistName.trim()}
            >
              <FaPlus /> {busyId === 'create-playlist' ? 'Creating...' : 'Create playlist'}
            </button>
          </>
        }
      >
        <form id="echoo-create-playlist" className="figma-library-form" onSubmit={createPlaylist}>
          <label>
            Playlist name
            <input
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
              maxLength={80}
              autoFocus
            />
          </label>
          <label>
            Description
            <textarea
              value={playlistDescription}
              onChange={(event) => setPlaylistDescription(event.target.value)}
              maxLength={300}
            />
          </label>
        </form>
      </ListenerModal>

      <ListenerModal
        open={Boolean(addingTrack)}
        title="Add to playlist"
        subtitle={addingTrack ? `Choose a playlist for “${addingTrack.title}”.` : ''}
        size="small"
        onClose={() => !busyId && setAddingTrack(null)}
      >
        {playlists.length === 0 ? (
          <div className="figma-library-empty">
            <FaBookOpen />
            <strong>No playlists yet.</strong>
            <button
              type="button"
              className="lb-button primary"
              onClick={() => {
                setAddingTrack(null);
                setCreateOpen(true);
              }}
            >
              <FaPlus /> Create playlist
            </button>
          </div>
        ) : (
          <div className="figma-library-playlist-list">
            {playlists.map((playlist) => (
              <button
                type="button"
                className="figma-library-playlist-row"
                key={playlist.id}
                disabled={Boolean(busyId)}
                onClick={() => addToPlaylist(playlist)}
              >
                <span><FaBookOpen /></span>
                <div>
                  <strong>{playlist.name}</strong>
                  <small>{playlist.trackCount || 0} tracks</small>
                </div>
              </button>
            ))}
          </div>
        )}
      </ListenerModal>

      <header className="figma-library-header">
        <div>
          <h1>Your Library</h1>
          <p>Saved audio and playlists synced with your Echoo account.</p>
        </div>
        <div className="figma-library-header-actions">
          <button type="button" onClick={() => navigate('/listen/library/following')}>
            Following
          </button>
          <button type="button" className="primary" onClick={() => setCreateOpen(true)}>
            <FaPlus /> New playlist
          </button>
        </div>
      </header>

      {error && (
        <div className="figma-library-empty">
          <strong>{error}</strong>
          <button type="button" className="lb-button" onClick={loadLibrary}>Try again</button>
        </div>
      )}

      {!error && (
        <>
          <section className="figma-library-summary">
            <article>
              <FaHeadphones />
              <div><strong>{tracks.length}</strong><span>Saved audio</span></div>
            </article>
            <article>
              <FaBookOpen />
              <div><strong>{playlists.length}</strong><span>Playlists</span></div>
            </article>
            <article>
              <FaPlay />
              <div><strong>{totalPlaylistTracks}</strong><span>Playlist tracks</span></div>
            </article>
          </section>

          <section className="figma-library-section">
            <div className="figma-library-section-heading">
              <div>
                <h2>Saved Audio</h2>
                <p>Audio you explicitly saved to your Echoo account.</p>
              </div>
              <span>{tracks.length}</span>
            </div>

            {tracks.length === 0 ? (
              <div className="figma-library-empty">
                <FaHeadphones />
                <strong>No saved audio yet.</strong>
                <span>Use Save on published audio and it will appear here.</span>
              </div>
            ) : (
              <div className="figma-library-audio-grid">
                {tracks.map((track) => {
                  const id = getTrackId(track);
                  const playing =
                    isPlaying && String(currentTrack?.id || '') === String(id || '');

                  return (
                    <article className="figma-library-audio-card" key={id}>
                      <button
                        type="button"
                        className="figma-library-audio-art"
                        onClick={() => playAudio(track)}
                      >
                        <AudioArtwork track={track} />
                        <span className="figma-library-play-overlay">
                          {playing ? <FaPause /> : <FaPlay />}
                        </span>
                      </button>
                      <div className="figma-library-audio-copy">
                        <strong>{track.title}</strong>
                        <span>{getArtist(track)}</span>
                      </div>
                      <div className="figma-library-card-actions">
                        <button type="button" onClick={() => setAddingTrack(track)}>
                          <FaPlus /> Playlist
                        </button>
                        <button
                          type="button"
                          disabled={busyId === `save-${id}`}
                          onClick={() => removeSaved(track)}
                        >
                          <FaTrash /> Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="figma-library-section">
            <div className="figma-library-section-heading">
              <div>
                <h2>Your Playlists</h2>
                <p>Private playlists created by this Echoo account.</p>
              </div>
              <span>{playlists.length}</span>
            </div>

            {playlists.length === 0 ? (
              <div className="figma-library-empty">
                <FaBookOpen />
                <strong>No playlists yet.</strong>
                <button type="button" className="lb-button primary" onClick={() => setCreateOpen(true)}>
                  <FaPlus /> Create your first playlist
                </button>
              </div>
            ) : (
              <div className="figma-library-playlist-grid">
                {playlists.map((playlist) => (
                  <article className="figma-library-playlist-card" key={playlist.id}>
                    <div className="figma-library-playlist-art">
                      {playlist.coverArt ? <img src={playlist.coverArt} alt="" /> : <FaBookOpen />}
                    </div>
                    <div>
                      <strong>{playlist.name}</strong>
                      <span>{playlist.trackCount || 0} tracks</span>
                      <p>{playlist.description || 'Private Echoo playlist.'}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default ListenerLibrary;
