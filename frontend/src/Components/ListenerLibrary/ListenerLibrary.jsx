import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaBookOpen,
  FaCheck,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaPlus,
  FaTrash,
} from 'react-icons/fa';

import audioService from '../../services/audioService';
import batch1Service from '../../services/batch1Service';
import followService from '../../services/followService';
import playlistService from '../../services/playlistService';
import ListenerModal from '../ListenerUI/ListenerModal';
import ListenerToast from '../ListenerUI/ListenerToast';
import '../../styles/listener-reference-pages.css';

const idOf = (item) => item?.id || item?._id || null;
const getArtist = (track) => track?.artistName || track?.artist?.displayName || track?.artist?.username || 'Echoo Creator';
const initials = (value) => String(value || 'Echoo')
  .split(/\s+/).filter(Boolean).slice(0,2).map((part) => part[0]?.toUpperCase()).join('');
const formatTime = (seconds) => {
  const total = Number(seconds) || 0;
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const ListenerLibrary = () => {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();

  const [tab, setTab] = useState('overview');
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [creators, setCreators] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [toast, setToast] = useState({ open:false, type:'info', title:'', message:'' });

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) setError('');
      const [savedResult, playlistsResult, creatorsResult, stationsResult] = await Promise.allSettled([
        batch1Service.getSavedTracks({ page:1, limit:100 }),
        playlistService.getMine(),
        followService.getFollowingCreators(),
        followService.getFollowingStations(),
      ]);

      if (savedResult.status === 'fulfilled') {
        const raw = Array.isArray(savedResult.value?.data?.tracks) ? savedResult.value.data.tracks : [];
        setTracks(raw.map(audioService.normalize).filter(Boolean));
      }
      if (playlistsResult.status === 'fulfilled') {
        setPlaylists(Array.isArray(playlistsResult.value?.data) ? playlistsResult.value.data : []);
      }
      if (creatorsResult.status === 'fulfilled') {
        setCreators(Array.isArray(creatorsResult.value?.data) ? creatorsResult.value.data : []);
      }
      if (stationsResult.status === 'fulfilled') {
        setStations(Array.isArray(stationsResult.value?.data) ? stationsResult.value.data : []);
      }

      const failed = [savedResult, playlistsResult, creatorsResult, stationsResult].find((result) => result.status === 'rejected');
      if (failed && !silent) setError(failed.reason?.message || 'Some Library data could not be loaded.');
    } catch (loadError) {
      if (!silent) setError(loadError?.message || 'Could not load your Library.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const sync = () => load({ silent:true });
    const interval = window.setInterval(sync, 20000);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const showToast = (type, title, message) => setToast({ open:true, type, title, message });

  const playAudio = (track) => {
    const id = idOf(track);
    if (!id || !track.fileUrl) return;
    if (String(currentTrack?.id || '') === String(id)) {
      togglePlay();
      return;
    }
    playTrack({
      ...track,
      id,
      title:track.title || 'Untitled Audio',
      subtitle:getArtist(track),
      fileUrl:track.fileUrl,
      coverArt:track.coverArt || null,
      duration:Number(track.duration) || 0,
      genre:track.genre || 'Audio',
    }, tracks);
  };

  const removeSaved = async (track) => {
    const id = idOf(track);
    if (!id || busyId) return;
    try {
      setBusyId(`track-${id}`);
      await batch1Service.unsaveTrack(id);
      setTracks((current) => current.filter((item) => String(idOf(item)) !== String(id)));
      showToast('success', 'Removed from Library', `“${track.title || 'Audio'}” was removed.`);
    } catch (actionError) {
      showToast('error', 'Could not remove audio', actionError?.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  };

  const unfollowCreator = async (creator) => {
    const id = idOf(creator);
    if (!id || busyId) return;
    try {
      setBusyId(`creator-${id}`);
      await followService.unfollowCreator(id);
      setCreators((current) => current.filter((item) => String(idOf(item)) !== String(id)));
    } catch (actionError) {
      setError(actionError?.message || 'Could not unfollow this creator.');
    } finally { setBusyId(''); }
  };

  const unfollowStation = async (station) => {
    const id = idOf(station);
    if (!id || busyId) return;
    try {
      setBusyId(`station-${id}`);
      await followService.unfollowStation(id);
      setStations((current) => current.filter((item) => String(idOf(item)) !== String(id)));
    } catch (actionError) {
      setError(actionError?.message || 'Could not unfollow this station.');
    } finally { setBusyId(''); }
  };

  const createPlaylist = async (event) => {
    event.preventDefault();
    if (!playlistName.trim() || busyId) return;
    try {
      setBusyId('playlist-create');
      const response = await playlistService.create({
        name:playlistName.trim(),
        description:playlistDescription.trim(),
        isPublic:false,
        isCollaborative:false,
      });
      if (!response?.data?.id) throw new Error('Echoo did not return the new playlist.');
      setPlaylists((current) => [response.data, ...current]);
      setPlaylistName('');
      setPlaylistDescription('');
      setCreateOpen(false);
      showToast('success', 'Playlist created', `${response.data.name} is ready.`);
    } catch (actionError) {
      showToast('error', 'Could not create playlist', actionError?.message || 'Please try again.');
    } finally { setBusyId(''); }
  };

  const totalPlaylistTracks = useMemo(
    () => playlists.reduce((total, playlist) => total + (Number(playlist.trackCount) || 0), 0),
    [playlists]
  );

  if (loading) {
    return <main className="echoo-reference-page ref-library-page"><div className="ref-state-card"><strong>Loading your Library...</strong></div></main>;
  }

  const showCreators = tab === 'overview' || tab === 'creators';
  const showStations = tab === 'overview' || tab === 'stations';
  const showTracks = tab === 'overview' || tab === 'audio';
  const showPlaylists = tab === 'playlists';

  return (
    <main className="echoo-reference-page ref-library-page">
      <ListenerToast {...toast} onClose={() => setToast((current) => ({ ...current, open:false }))} />
      <ListenerModal
        open={createOpen}
        size="small"
        title="Create playlist"
        subtitle="Create a private playlist from your saved Echoo audio."
        onClose={() => !busyId && setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="lb-button" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" form="ref-library-playlist-form" className="lb-button primary" disabled={busyId === 'playlist-create' || !playlistName.trim()}>
              <FaPlus /> {busyId === 'playlist-create' ? 'Creating...' : 'Create playlist'}
            </button>
          </>
        }
      >
        <form id="ref-library-playlist-form" className="ref-modal-form" onSubmit={createPlaylist}>
          <label>Playlist name<input value={playlistName} maxLength={80} onChange={(event) => setPlaylistName(event.target.value)} autoFocus /></label>
          <label>Description<textarea value={playlistDescription} maxLength={300} onChange={(event) => setPlaylistDescription(event.target.value)} /></label>
        </form>
      </ListenerModal>

      <header className="ref-page-heading ref-library-heading">
        <div>
          <span className="ref-kicker">YOUR LIBRARY</span>
          <h1>Your Library</h1>
          <p>All of your followed creators, stations, saved audio and playlists.</p>
        </div>
        <button type="button" className="ref-primary-action" onClick={() => setCreateOpen(true)}><FaPlus /> New playlist</button>
      </header>

      {error && <div className="ref-inline-error">{error}</div>}

      <nav className="ref-library-tabs" aria-label="Library sections">
        {[
          ['overview','Overview'],['creators','Creators'],['stations','Stations'],['audio','Saved Audio'],['playlists','Playlists'],
        ].map(([key,label]) => (
          <button type="button" key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      {showCreators && (
        <section className="ref-library-section">
          <div className="ref-section-heading"><div><h2>Followed creators</h2><p>Creators you chose to hear from again.</p></div><span className="ref-count-pill">{creators.length}</span></div>
          {creators.length ? (
            <div className="ref-library-creator-grid">
              {creators.map((creator) => {
                const name = creator.name || creator.displayName || creator.username || 'Echoo Creator';
                return (
                  <article className="ref-library-creator-card" key={idOf(creator)}>
                    <button type="button" className="ref-library-avatar" onClick={() => navigate(`/listen/creator/${idOf(creator)}`)}>
                      {creator.avatar ? <img src={creator.avatar} alt="" /> : <span>{initials(name)}</span>}
                    </button>
                    <strong>{name}</strong>
                    <span>{creator.category || 'Creator'}</span>
                    <button type="button" disabled={busyId === `creator-${idOf(creator)}`} onClick={() => unfollowCreator(creator)}><FaCheck /> Following</button>
                  </article>
                );
              })}
            </div>
          ) : <div className="ref-state-card compact"><strong>You are not following any creators yet.</strong></div>}
        </section>
      )}

      {showStations && (
        <section className="ref-library-section">
          <div className="ref-section-heading"><div><h2>Followed stations</h2><p>Stations connected to your listener account.</p></div><span className="ref-count-pill">{stations.length}</span></div>
          {stations.length ? (
            <div className="ref-library-station-grid">
              {stations.map((station) => (
                <article className="ref-library-station-card" key={idOf(station)}>
                  <button type="button" className="ref-library-station-art" onClick={() => navigate(`/listen/stations/${idOf(station)}`)}>
                    {station.brandCover || station.coverArt ? <img src={station.brandCover || station.coverArt} alt="" /> : <FaHeadphones />}
                    {station.isLive && <span className="ref-live-chip"><i /> LIVE NOW</span>}
                  </button>
                  <div><strong>{station.name}</strong><span>{station.category || 'Other'}</span><small>{Number(station.listenerCount) || 0} listening</small></div>
                  <button type="button" disabled={busyId === `station-${idOf(station)}`} onClick={() => unfollowStation(station)}><FaCheck /> Following</button>
                </article>
              ))}
            </div>
          ) : <div className="ref-state-card compact"><strong>You are not following any stations yet.</strong></div>}
        </section>
      )}

      {showTracks && (
        <section className="ref-library-section">
          <div className="ref-section-heading"><div><h2>Saved audio</h2><p>Audio you explicitly saved to your Echoo account.</p></div><span className="ref-count-pill">{tracks.length}</span></div>
          {tracks.length ? (
            <div className="ref-saved-audio-list">
              {tracks.map((track) => {
                const playing = isPlaying && String(currentTrack?.id || '') === String(idOf(track));
                return (
                  <article className="ref-saved-audio-row" key={idOf(track)}>
                    <button type="button" className="ref-saved-audio-art" onClick={() => navigate(`/listen/audio/${idOf(track)}`)}>
                      {track.coverArt ? <img src={track.coverArt} alt="" /> : <FaHeadphones />}
                    </button>
                    <button type="button" className="ref-saved-audio-copy" onClick={() => navigate(`/listen/audio/${idOf(track)}`)}>
                      <strong>{track.title}</strong><span>{getArtist(track)}</span>
                    </button>
                    <time>{formatTime(track.duration)}</time>
                    <button type="button" className="ref-row-play" onClick={() => playAudio(track)}>{playing ? <FaPause /> : <FaPlay />}</button>
                    <button type="button" className="ref-row-more" title="Remove from Library" disabled={busyId === `track-${idOf(track)}`} onClick={() => removeSaved(track)}><FaTrash /></button>
                  </article>
                );
              })}
            </div>
          ) : <div className="ref-state-card compact"><FaHeadphones /><strong>No saved audio yet.</strong><span>Save published audio and it will appear here.</span></div>}
        </section>
      )}

      {showPlaylists && (
        <section className="ref-library-section">
          <div className="ref-section-heading"><div><h2>Your playlists</h2><p>{totalPlaylistTracks} tracks organized across {playlists.length} playlists.</p></div><span className="ref-count-pill">{playlists.length}</span></div>
          {playlists.length ? (
            <div className="ref-playlist-grid">
              {playlists.map((playlist) => (
                <article className="ref-playlist-card" key={idOf(playlist)}>
                  <div className="ref-playlist-art">{playlist.coverArt ? <img src={playlist.coverArt} alt="" /> : <FaBookOpen />}</div>
                  <div><strong>{playlist.name}</strong><span>{playlist.trackCount || 0} tracks</span><p>{playlist.description || 'Private Echoo playlist.'}</p></div>
                </article>
              ))}
            </div>
          ) : <div className="ref-state-card compact"><FaBookOpen /><strong>No playlists yet.</strong><button type="button" onClick={() => setCreateOpen(true)}><FaPlus /> Create playlist</button></div>}
        </section>
      )}
    </main>
  );
};

export default ListenerLibrary;
