import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaBookmark,
  FaBroadcastTower,
  FaCheck,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaSearch,
  FaUser,
} from 'react-icons/fa';

import audioService from '../../services/audioService';
import batch1Service from '../../services/batch1Service';
import { getCreatorProfilePath } from '../../services/profileIdentifier';
import './ListenerSearch.css';

const DISCOVERY_PROMPTS = ['Faith', 'Talk', 'Music', 'Education', 'News', 'Sports'];

const creatorName = (creator) =>
  creator?.displayName ||
  creator?.artistName ||
  creator?.organizationName ||
  creator?.username ||
  'Echoo Creator';

const ListenerSearch = () => {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();

  const [query, setQuery] = useState('');
  const [data, setData] = useState({
    tracks: [],
    creators: [],
    stations: [],
    playlists: [],
  });
  const [savedIds, setSavedIds] = useState(new Set());
  const [savingId, setSavingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    batch1Service
      .getSavedTracks({ page: 1, limit: 100 })
      .then((response) => {
        if (!active) return;
        const tracks = response?.data?.tracks || [];
        setSavedIds(
          new Set(
            tracks
              .map((track) => String(track.id || track._id || ''))
              .filter(Boolean)
          )
        );
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const cleanQuery = query.trim();

    if (cleanQuery.length < 2) {
      setData({ tracks: [], creators: [], stations: [], playlists: [] });
      setLoading(false);
      setError('');
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError('');

        const response = await batch1Service.globalSearch(cleanQuery, {
          page: 1,
          limit: 20,
        });

        if (!active) return;

        const results = response?.data?.results || {};
        setData({
          tracks: Array.isArray(results.tracks)
            ? results.tracks.map(audioService.normalize).filter(Boolean)
            : [],
          creators: Array.isArray(results.creators) ? results.creators : [],
          stations: Array.isArray(results.stations) ? results.stations : [],
          playlists: Array.isArray(results.playlists) ? results.playlists : [],
        });
      } catch (searchError) {
        if (!active) return;
        setData({ tracks: [], creators: [], stations: [], playlists: [] });
        setError(searchError?.message || 'Search failed.');
      } finally {
        if (active) setLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const totalResults = useMemo(
    () =>
      data.tracks.length +
      data.creators.length +
      data.stations.length +
      data.playlists.length,
    [data]
  );

  const handlePlay = (item) => {
    const sameTrack =
      String(currentTrack?.id || '') === String(item.id || item._id || '');

    if (sameTrack) {
      togglePlay();
      return;
    }

    playTrack(
      {
        ...item,
        id: item.id || item._id,
        title: item.title || 'Untitled Audio',
        subtitle:
          item.artistName ||
          item.artist?.displayName ||
          item.artist?.username ||
          'Echoo Audio',
        coverArt: item.coverArt || null,
        fileUrl: item.fileUrl || null,
        duration: Number(item.duration) || 0,
        genre: item.genre || 'Audio',
      },
      data.tracks
    );
  };

  const toggleSaved = async (item) => {
    const id = String(item.id || item._id || '');
    if (!id || savingId === id) return;

    const wasSaved = savedIds.has(id);
    setSavingId(id);

    setSavedIds((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(id);
      else next.add(id);
      return next;
    });

    try {
      if (wasSaved) await batch1Service.unsaveTrack(id);
      else await batch1Service.saveTrack(id);
    } catch (saveError) {
      console.error('Library save error:', saveError);
      setSavedIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(id);
        else next.delete(id);
        return next;
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="listener-search-page batch1-search-page">
      <header className="listener-search-header">
        <span className="batch1-kicker">DISCOVER</span>
        <h1>Search</h1>
        <p>Find live events, stations, creators and recorded audio.</p>
      </header>

      <div className="listener-search-box">
        <FaSearch />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Echoo..."
          aria-label="Search Echoo"
          autoFocus
        />
      </div>

      {loading && <div className="search-message">Searching Echoo...</div>}
      {!loading && error && (
        <div className="search-message search-error">{error}</div>
      )}
      {!loading && !error && query.trim().length >= 2 && totalResults === 0 && (
        <div className="search-message batch1-search-empty">
          No matching audio, creators, stations or playlists found.
        </div>
      )}

      {!loading && data.creators.length > 0 && (
        <section className="batch1-search-section">
          <div className="batch1-search-heading">
            <div>
              <h2>Voices</h2>
              <p>Creators matching your search.</p>
            </div>
            <span>{data.creators.length}</span>
          </div>

          <div className="batch1-creator-grid">
            {data.creators.map((creator) => (
              <button
                type="button"
                className="batch1-creator-result"
                key={creator.id || creator.username}
                onClick={() => {
                  const profilePath = getCreatorProfilePath(creator);
                  if (profilePath) navigate(profilePath);
                }}
              >
                <span className="batch1-creator-avatar">
                  {creator.avatar ? <img src={creator.avatar} alt="" /> : <FaUser />}
                </span>
                <span className="batch1-creator-copy">
                  <strong>{creatorName(creator)}</strong>
                  <small>@{creator.username}</small>
                  <em>{Number(creator.totalListeners || 0).toLocaleString()} listeners</em>
                </span>
                <span className="batch1-open-profile">View profile</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!loading && data.stations.length > 0 && (
        <section className="batch1-search-section">
          <div className="batch1-search-heading">
            <div>
              <h2>Stations</h2>
              <p>Public Echoo stations matching your search.</p>
            </div>
            <span>{data.stations.length}</span>
          </div>

          <div className="batch1-creator-grid">
            {data.stations.map((station) => (
              <button
                type="button"
                className="batch1-creator-result"
                key={station.id}
                onClick={() => navigate(`/listen/stations/${station.id}`)}
              >
                <span className="batch1-creator-avatar">
                  {station.coverArt ? (
                    <img src={station.coverArt} alt="" />
                  ) : (
                    <FaBroadcastTower />
                  )}
                </span>
                <span className="batch1-creator-copy">
                  <strong>{station.name}</strong>
                  <small>{station.category || 'Station'}</small>
                  <em>
                    {station.isLive
                      ? `${Number(station.listenerCount || 0).toLocaleString()} listening now`
                      : `${Number(station.followerCount || 0).toLocaleString()} followers`}
                  </em>
                </span>
                <span className="batch1-open-profile">
                  {station.isLive ? 'LIVE' : 'View station'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!loading && data.tracks.length > 0 && (
        <section className="batch1-search-section">
          <div className="batch1-search-heading">
            <div>
              <h2>Audio</h2>
              <p>Published audio matching your search.</p>
            </div>
            <span>{data.tracks.length}</span>
          </div>

          <div className="listener-search-results">
            {data.tracks.map((item) => {
              const id = String(item.id || item._id || '');
              const playing = isPlaying && String(currentTrack?.id || '') === id;
              const saved = savedIds.has(id);
              const title = item.title || 'Untitled Audio';

              return (
                <article className="listener-search-result batch1-track-result" key={id}>
                  <button
                    type="button"
                    className="search-result-cover"
                    onClick={() => handlePlay(item)}
                    aria-label={`${playing ? 'Pause' : 'Play'} ${title}`}
                  >
                    {item.coverArt ? <img src={item.coverArt} alt="" /> : <FaHeadphones />}
                  </button>

                  <div className="search-result-main">
                    <h3>{title}</h3>
                    <p>
                      {item.artistName ||
                        item.artist?.displayName ||
                        item.artist?.username ||
                        'Echoo Creator'}
                    </p>
                  </div>

                  <span className="search-result-genre">{item.genre || 'Audio'}</span>

                  <button
                    type="button"
                    className={`batch1-save-track ${saved ? 'saved' : ''}`}
                    disabled={savingId === id}
                    onClick={() => toggleSaved(item)}
                  >
                    {saved ? <FaCheck /> : <FaBookmark />}
                    {saved ? 'Saved' : 'Save'}
                  </button>

                  <button
                    type="button"
                    className="search-result-play"
                    onClick={() => handlePlay(item)}
                    aria-label={`${playing ? 'Pause' : 'Play'} ${title}`}
                  >
                    {playing ? <FaPause /> : <FaPlay />}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {!loading && data.playlists.length > 0 && (
        <section className="batch1-search-section">
          <div className="batch1-search-heading">
            <div>
              <h2>Public playlists</h2>
              <p>Curated collections from Echoo users.</p>
            </div>
            <span>{data.playlists.length}</span>
          </div>

          <div className="batch1-playlist-grid">
            {data.playlists.map((playlist) => (
              <article className="batch1-playlist-result" key={playlist.id || playlist.name}>
                <div className="batch1-playlist-art">
                  {playlist.coverArt ? <img src={playlist.coverArt} alt="" /> : <FaHeadphones />}
                </div>
                <div>
                  <strong>{playlist.name}</strong>
                  <small>{playlist.owner?.displayName || playlist.owner?.username || 'Echoo'}</small>
                  <p>{playlist.description || `${playlist.trackCount || 0} tracks`}</p>
                </div>
                <button
                  type="button"
                  className="batch1-open-profile"
                  onClick={() => navigate('/listen/playlist')}
                  aria-label={`Open playlists to find ${playlist.name || 'this playlist'}`}
                >
                  Open playlists
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {query.trim().length < 2 && (
        <div className="batch1-search-guidance">
          <FaHeadphones />
          <strong>What do you want to hear?</strong>
          <span>Search by creator, station, topic or audio title.</span>
          <div className="listener-search-prompts" aria-label="Suggested searches">
            {DISCOVERY_PROMPTS.map((prompt) => (
              <button type="button" key={prompt} onClick={() => setQuery(prompt)}>{prompt}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ListenerSearch;
