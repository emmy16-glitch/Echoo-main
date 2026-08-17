import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useOutletContext,
} from "react-router-dom";

import {
  FaBookmark,
  FaCheck,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaSearch,
  FaUser,
} from "react-icons/fa";

import audioService from "../../services/audioService";
import batch1Service from "../../services/batch1Service";
import { getMockMediaForKey } from "../../services/mockMediaService.js";

import "./ListenerSearch.css";

const creatorName = (
  creator
) =>
  creator?.displayName ||
  creator?.artistName ||
  creator?.organizationName ||
  creator?.username ||
  "Echoo Creator";

const ListenerSearch = () => {
  const navigate =
    useNavigate();

  const {
    playTrack,
    currentTrack,
    isPlaying,
    togglePlay,
  } =
    useOutletContext();

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    data,
    setData,
  ] = useState({
    tracks: [],
    creators: [],
    playlists: [],
  });

  const [
    savedIds,
    setSavedIds,
  ] = useState(
    new Set()
  );

  const [
    savingId,
    setSavingId,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    let active = true;

    batch1Service
      .getSavedTracks({
        page: 1,
        limit: 100,
      })
      .then((response) => {
        if (!active) {
          return;
        }

        const tracks =
          response?.data
            ?.tracks || [];

        setSavedIds(
          new Set(
            tracks
              .map(
                (track) =>
                  String(
                    track.id ||
                    track._id ||
                    ""
                  )
              )
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
    const cleanQuery =
      query.trim();

    if (
      cleanQuery.length < 2
    ) {
      setData({
        tracks: [],
        creators: [],
        playlists: [],
      });
      setLoading(false);
      setError("");
      return;
    }

    let active = true;

    const timeout =
      setTimeout(
        async () => {
          try {
            setLoading(true);
            setError("");

            const response =
              await batch1Service.globalSearch(
                cleanQuery,
                {
                  page: 1,
                  limit: 20,
                }
              );

            if (!active) {
              return;
            }

            const results =
              response?.data
                ?.results || {};

            setData({
              tracks:
                Array.isArray(
                  results.tracks
                )
                  ? results.tracks
                      .map(
                        audioService.normalize
                      )
                      .filter(Boolean)
                  : [],
              creators:
                Array.isArray(
                  results.creators
                )
                  ? results.creators
                  : [],
              playlists:
                Array.isArray(
                  results.playlists
                )
                  ? results.playlists
                  : [],
            });
          } catch (
            backendError
          ) {
            console.warn(
              "Global search unavailable; using the existing audio fallback.",
              backendError
            );

            try {
              const fallback =
                await audioService.getAll({
                  search:
                    cleanQuery,
                  public: true,
                  limit: 20,
                });

              if (!active) {
                return;
              }

              setData({
                tracks:
                  fallback?.data ||
                  [],
                creators: [],
                playlists: [],
              });
            } catch (
              fallbackError
            ) {
              if (active) {
                setError(
                  fallbackError?.message ||
                  backendError?.message ||
                  "Search failed."
                );
                setData({
                  tracks: [],
                  creators: [],
                  playlists: [],
                });
              }
            }
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        },
        300
      );

    return () => {
      active = false;
      clearTimeout(
        timeout
      );
    };
  }, [query]);

  const totalResults =
    useMemo(
      () =>
        data.tracks.length +
        data.creators.length +
        data.playlists.length,
      [data]
    );

  const handlePlay = (
    item
  ) => {
    const sameTrack =
      currentTrack?.id ===
        item.id ||
      currentTrack?.title ===
        item.title;

    if (sameTrack) {
      togglePlay();
      return;
    }

    playTrack(
      {
        ...item,
        id:
          item.id ||
          item._id,
        title:
          item.title ||
          "Untitled Audio",
        subtitle:
          item.artistName ||
          item.artist
            ?.displayName ||
          item.artist
            ?.username ||
          "Echoo Audio",
        coverArt:
          item.coverArt ||
          getMockMediaForKey(
            `${item.id || ""} ${item.title || ""}`,
            "audio"
          ),
        duration:
          Number(
            item.duration
          ) || 0,
        genre:
          item.genre ||
          "Audio",
        coverClass:
          item.coverClass ||
          "motivation-cover",
      },
      data.tracks
    );
  };

  const toggleSaved =
    async (
      item
    ) => {
      const id =
        String(
          item.id ||
          item._id ||
          ""
        );

      if (
        !id ||
        savingId === id
      ) {
        return;
      }

      const wasSaved =
        savedIds.has(id);

      setSavingId(id);

      setSavedIds(
        (current) => {
          const next =
            new Set(
              current
            );

          if (wasSaved) {
            next.delete(id);
          } else {
            next.add(id);
          }

          return next;
        }
      );

      try {
        if (wasSaved) {
          await batch1Service.unsaveTrack(
            id
          );
        } else {
          await batch1Service.saveTrack(
            id
          );
        }
      } catch (saveError) {
        console.error(
          "Library save error:",
          saveError
        );

        setSavedIds(
          (current) => {
            const next =
              new Set(
                current
              );

            if (wasSaved) {
              next.add(id);
            } else {
              next.delete(id);
            }

            return next;
          }
        );
      } finally {
        setSavingId(null);
      }
    };

  return (
    <div className="listener-search-page batch1-search-page">
      <header className="listener-search-header">
        <span className="batch1-kicker">
          ECHOO / SEARCH
        </span>

        <h1>
          Search Echoo
        </h1>

        <p>
          Find audio, creators and public playlists.
        </p>
      </header>

      <div className="listener-search-box">
        <FaSearch />

        <input
          type="text"
          value={query}
          onChange={(event) =>
            setQuery(
              event.target.value
            )
          }
          placeholder="Search voices, audio, playlists..."
          autoFocus
        />
      </div>

      {loading && (
        <div className="search-message">
          Searching Echoo...
        </div>
      )}

      {!loading &&
        error && (
          <div className="search-message search-error">
            {error}
          </div>
        )}

      {!loading &&
        !error &&
        query.trim().length >=
          2 &&
        totalResults === 0 && (
          <div className="search-message batch1-search-empty">
            No matching audio, creators or playlists found.
          </div>
        )}

      {!loading &&
        data.creators.length > 0 && (
          <section className="batch1-search-section">
            <div className="batch1-search-heading">
              <div>
                <h2>
                  Voices
                </h2>
                <p>
                  Creators matching your search.
                </p>
              </div>

              <span>
                {data.creators.length}
              </span>
            </div>

            <div className="batch1-creator-grid">
              {data.creators.map(
                (creator) => {
                  const name =
                    creatorName(
                      creator
                    );

                  return (
                    <button
                      type="button"
                      className="batch1-creator-result"
                      key={
                        creator.id ||
                        creator.username
                      }
                      onClick={() =>
                        navigate(
                          `/listen/creator/${creator.username}`
                        )
                      }
                    >
                      <span className="batch1-creator-avatar">
                        {creator.avatar ? (
                          <img
                            src={
                              creator.avatar
                            }
                            alt=""
                          />
                        ) : (
                          <FaUser />
                        )}
                      </span>

                      <span className="batch1-creator-copy">
                        <strong>
                          {name}
                        </strong>

                        <small>
                          @{creator.username}
                        </small>

                        <em>
                          {Number(
                            creator.totalListeners ||
                            0
                          ).toLocaleString()} listeners
                        </em>
                      </span>

                      <span className="batch1-open-profile">
                        View profile
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </section>
        )}

      {!loading &&
        data.tracks.length > 0 && (
          <section className="batch1-search-section">
            <div className="batch1-search-heading">
              <div>
                <h2>
                  Audio
                </h2>
                <p>
                  Published audio matching your search.
                </p>
              </div>

              <span>
                {data.tracks.length}
              </span>
            </div>

            <div className="listener-search-results">
              {data.tracks.map(
                (item) => {
                  const playing =
                    isPlaying &&
                    (
                      currentTrack?.id ===
                        item.id ||
                      currentTrack?.title ===
                        item.title
                    );

                  const id =
                    String(
                      item.id ||
                      item._id ||
                      ""
                    );

                  const saved =
                    savedIds.has(id);

                  return (
                    <article
                      className="listener-search-result batch1-track-result"
                      key={
                        item.id ||
                        item.title
                      }
                    >
                      <button
                        type="button"
                        className="search-result-cover"
                        onClick={() =>
                          handlePlay(
                            item
                          )
                        }
                      >
                        <img
                          src={
                            item.coverArt ||
                            getMockMediaForKey(
                              `${item.id || ""} ${item.title || ""}`,
                              "audio"
                            )
                          }
                          alt=""
                        />
                      </button>

                      <div className="search-result-main">
                        <h3>
                          {item.title}
                        </h3>

                        <p>
                          {item.artistName ||
                            item.artist
                              ?.displayName ||
                            item.artist
                              ?.username ||
                            "Echoo Creator"}
                        </p>
                      </div>

                      <span className="search-result-genre">
                        {item.genre ||
                          "Audio"}
                      </span>

                      <button
                        type="button"
                        className={`batch1-save-track ${
                          saved
                            ? "saved"
                            : ""
                        }`}
                        disabled={
                          savingId === id
                        }
                        onClick={() =>
                          toggleSaved(
                            item
                          )
                        }
                      >
                        {saved ? (
                          <FaCheck />
                        ) : (
                          <FaBookmark />
                        )}

                        {saved
                          ? "Saved"
                          : "Save"}
                      </button>

                      <button
                        type="button"
                        className="search-result-play"
                        onClick={() =>
                          handlePlay(
                            item
                          )
                        }
                      >
                        {playing ? (
                          <FaPause />
                        ) : (
                          <FaPlay />
                        )}
                      </button>
                    </article>
                  );
                }
              )}
            </div>
          </section>
        )}

      {!loading &&
        data.playlists.length > 0 && (
          <section className="batch1-search-section">
            <div className="batch1-search-heading">
              <div>
                <h2>
                  Public playlists
                </h2>
                <p>
                  Curated audio collections on Echoo.
                </p>
              </div>

              <span>
                {data.playlists.length}
              </span>
            </div>

            <div className="batch1-playlist-grid">
              {data.playlists.map(
                (playlist) => (
                  <article
                    className="batch1-playlist-result"
                    key={
                      playlist.id ||
                      playlist.name
                    }
                  >
                    <div className="batch1-playlist-art">
                      <img
                        src={
                          playlist.coverArt ||
                          getMockMediaForKey(
                            playlist.id ||
                            playlist.name,
                            "playlists"
                          )
                        }
                        alt=""
                      />
                    </div>

                    <div>
                      <strong>
                        {playlist.name}
                      </strong>

                      <small>
                        {playlist.owner
                          ?.displayName ||
                          playlist.owner
                            ?.username ||
                          "Echoo"}
                      </small>

                      <p>
                        {playlist.description ||
                          `${playlist.trackCount || 0} tracks`}
                      </p>
                    </div>
                  </article>
                )
              )}
            </div>
          </section>
        )}

      {query.trim().length < 2 && (
        <div className="batch1-search-guidance">
          <FaHeadphones />
          <strong>
            Search for something worth hearing.
          </strong>
          <span>
            Type at least two characters to search Echoo.
          </span>
        </div>
      )}
    </div>
  );
};

export default ListenerSearch;
