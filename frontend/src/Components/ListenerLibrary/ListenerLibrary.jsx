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
  FaBookOpen,
  FaCheck,
  FaHeadphones,
  FaHeart,
  FaPause,
  FaPlay,
  FaPlus,
  FaUsers,
} from "react-icons/fa";

import audioService from "../../services/audioService";
import { API_BASE_URL } from "../../services/api.js";

import {
  getCreatorLive,
  getStationLive,
  mockSocial,
} from "../../services/listenerMockService";

import HorizontalDragRail from "../FigmaUI/HorizontalDragRail";
import ListenerModal from "../ListenerUI/ListenerModal";
import ListenerToast from "../ListenerUI/ListenerToast";

import "../ListenerUI/ListenerBeautiful.css";
import "./ListenerLibrary.css";

import { getMockMediaForKey } from "../../services/mockMediaService.js";
import batch1Service from "../../services/batch1Service";
const SAVED_KEY =
  "echoo-listener-saved-audio-v1";

const getAuthHeaders =
  () => {
    const token =
      localStorage.getItem(
        "accessToken"
      );

    return token
      ? {
          Authorization:
            `Bearer ${token}`,
        }
      : {};
  };

const getStoredUser =
  () => {
    try {
      return JSON.parse(
        localStorage.getItem(
          "user"
        ) || "{}"
      );
    } catch {
      return {};
    }
  };

const getSavedIds =
  () => {
    try {
      const value =
        JSON.parse(
          localStorage.getItem(
            SAVED_KEY
          ) || "[]"
        );

      return Array.isArray(
        value
      )
        ? value.map(String)
        : [];
    } catch {
      return [];
    }
  };

const writeSavedIds =
  (ids) => {
    localStorage.setItem(
      SAVED_KEY,
      JSON.stringify(
        ids
      )
    );
  };

const normalizeTracks =
  (
    response
  ) => {
    if (
      Array.isArray(
        response?.data
      )
    ) {
      return response.data;
    }

    if (
      Array.isArray(
        response?.data
          ?.tracks
      )
    ) {
      return response
        .data
        .tracks;
    }

    return [];
  };

const normalizePlaylists =
  (
    response
  ) => {
    if (
      Array.isArray(
        response?.data
      )
    ) {
      return response.data;
    }

    if (
      Array.isArray(
        response?.data
          ?.playlists
      )
    ) {
      return response
        .data
        .playlists;
    }

    return [];
  };

const getTrackId =
  (
    track
  ) =>
    track?.id ||
    track?._id ||
    null;

const getArtist =
  (
    track
  ) =>
    track?.artistName ||
    track?.artist
      ?.displayName ||
    track?.artist
      ?.username ||
    track?.subtitle ||
    "Echoo Creator";

const getArtwork =
  (
    track
  ) =>
    track?.coverArt ||
    track?.artwork ||
    track?.image ||
    track?.thumbnail ||
    null;

const AudioArtwork = ({
  track,
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  const image =
    getArtwork(
      track
    );

  if (
    image &&
    !failed
  ) {
    return (
      <img
        src={image}
        alt=""
        draggable="false"
        onError={() =>
          setFailed(true)
        }
      />
    );
  }

  return (
    <div className="figma-library-audio-fallback">
      <FaHeadphones />
    </div>
  );
};

const ListenerLibrary =
  () => {
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
      tracks,
      setTracks,
    ] = useState([]);

    const [
      playlists,
      setPlaylists,
    ] = useState([]);

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      savedIds,
      setSavedIds,
    ] = useState(
      getSavedIds
    );

    const [
      createOpen,
      setCreateOpen,
    ] = useState(false);

    const [
      creating,
      setCreating,
    ] = useState(false);

    const [
      playlistName,
      setPlaylistName,
    ] = useState("");

    const [
      playlistDescription,
      setPlaylistDescription,
    ] = useState("");

    const [
      toast,
      setToast,
    ] = useState({
      open: false,
      type: "info",
      title: "",
      message: "",
    });

    const user =
      useMemo(
        getStoredUser,
        []
      );

    const displayName =
      user.displayName ||
      user.fullname ||
      user.name ||
      user.username ||
      "Echoo Listener";

    const followingCreators =
      mockSocial.getFollowingCreators();

    const followingStations =
      mockSocial.getFollowingStations();

    const followedTotal =
      followingCreators.length +
      followingStations.length;

    const followedLive =
      [
        ...followingCreators.map(
          (
            creator
          ) =>
            getCreatorLive(
              creator.id
            )
        ),

        ...followingStations.map(
          (
            station
          ) =>
            getStationLive(
              station.id
            )
        ),
      ].filter(Boolean);

    const showToast =
      (
        type,
        title,
        message
      ) => {
        setToast({
          open: true,
          type,
          title,
          message,
        });
      };

    const loadLibrary =
      async () => {
        setLoading(true);

        const [
          audioResult,
          playlistResult,
        ] =
          await Promise.allSettled(
            [
              batch1Service
              .getSavedTracks({
                page: 1,
                limit: 50,
              })
              .then((response) => ({
                ...response,
                data: {
                  ...(response?.data || {}),
                  tracks:
                    Array.isArray(
                      response?.data?.tracks
                    )
                      ? response.data.tracks
                          .map(
                            audioService.normalize
                          )
                          .filter(Boolean)
                      : [],
                },
              }))
              .catch(async (error) => {
                console.warn(
                  "Saved Library backend unavailable; using the previous audio fallback.",
                  error
                );

                return audioService.getAll({
                  public: true,
                  page: 1,
                  limit: 50,
                });
              }),

              fetch(
                `${API_BASE_URL}/playlists`,
                {
                  headers: {
                    ...getAuthHeaders(),
                  },
                }
              ).then(
                async (
                  response
                ) => {
                  let data = {};

                  try {
                    data =
                      await response.json();
                  } catch {
                    data = {};
                  }

                  if (
                    !response.ok
                  ) {
                    throw new Error(
                      data?.error
                        ?.message ||
                        "Could not load playlists."
                    );
                  }

                  return data;
                }
              ),
            ]
          );

        if (
          audioResult.status ===
          "fulfilled"
        ) {
          setTracks(
            normalizeTracks(
              audioResult.value
            )
          );
        } else {
          console.error(
            audioResult.reason
          );

          setTracks([]);
        }

        if (
          playlistResult.status ===
          "fulfilled"
        ) {
          setPlaylists(
            normalizePlaylists(
              playlistResult.value
            )
          );
        } else {
          console.error(
            playlistResult.reason
          );

          setPlaylists([]);
        }

        setLoading(false);
      };

    useEffect(() => {
      loadLibrary();
    }, []);

    const savedTracks =
      useMemo(
        () =>
          tracks.filter(
            (
              track
            ) => {
              const id =
                getTrackId(
                  track
                );

              return (
                id &&
                savedIds.includes(
                  String(id)
                )
              );
            }
          ),
        [
          tracks,
          savedIds,
        ]
      );

    const toggleSave =
      (
        track
      ) => {
        const id =
          getTrackId(
            track
          );

        if (!id) {
          return;
        }

        const stringId =
          String(id);

        const exists =
          savedIds.includes(
            stringId
          );

        const next =
          exists
            ? savedIds.filter(
                (
                  item
                ) =>
                  item !==
                  stringId
              )
            : [
                ...savedIds,
                stringId,
              ];

        setSavedIds(
          next
        );

        writeSavedIds(
          next
        );

        showToast(
          exists
            ? "info"
            : "success",
          exists
            ? "Removed from Library"
            : "Saved to Library",
          exists
            ? `${track.title || "Audio"} was removed from Saved Audio.`
            : `${track.title || "Audio"} is now in Saved Audio.`
        );
      };

    const isSaved =
      (
        track
      ) => {
        const id =
          getTrackId(
            track
          );

        return (
          id &&
          savedIds.includes(
            String(id)
          )
        );
      };

    const playAudio =
      (
        track,
        queue =
          tracks
      ) => {
        const id =
          getTrackId(
            track
          );

        const same =
          (
            id &&
            currentTrack?.id ===
              id
          ) ||
          currentTrack?.title ===
            track.title;

        if (same) {
          togglePlay();

          return;
        }

        playTrack(
          {
            ...track,

            id,

            title:
              track.title ||
              "Untitled Audio",

            subtitle:
              getArtist(
                track
              ),

            coverArt:
              getArtwork(
                track
              ),

            fileUrl:
              track.fileUrl ||
              null,

            duration:
              Number(
                track.duration
              ) || 0,

            genre:
              track.genre ||
              "Audio",
          },
          queue
        );
      };

    const itemPlaying =
      (
        track
      ) => {
        const id =
          getTrackId(
            track
          );

        return (
          isPlaying &&
          (
            (
              id &&
              currentTrack?.id ===
                id
            ) ||
            currentTrack?.title ===
              track.title
          )
        );
      };

    const createPlaylist =
      async (
        event
      ) => {
        event.preventDefault();

        const name =
          playlistName.trim();

        if (
          !name ||
          creating
        ) {
          return;
        }

        try {
          setCreating(true);

          const response =
            await fetch(
              `${API_BASE_URL}/playlists`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  ...getAuthHeaders(),
                },

                body:
                  JSON.stringify({
                    name,

                    description:
                      playlistDescription.trim(),

                    isPublic:
                      false,
                  }),
              }
            );

          let data = {};

          try {
            data =
              await response.json();
          } catch {
            data = {};
          }

          if (
            !response.ok
          ) {
            throw new Error(
              data?.error
                ?.message ||
                "Could not create playlist."
            );
          }

          const created =
            data?.data || {
              id:
                `local-${Date.now()}`,

              name,

              description:
                playlistDescription.trim(),

              tracks: [],
            };

          setPlaylists(
            (
              current
            ) => [
              created,
              ...current,
            ]
          );

          setPlaylistName("");
          setPlaylistDescription("");
          setCreateOpen(false);

          showToast(
            "success",
            "Playlist created",
            `${name} is ready.`
          );
        } catch (
          error
        ) {
          showToast(
            "error",
            "Could not create playlist",
            error.message ||
              "Please try again."
          );
        } finally {
          setCreating(false);
        }
      };

    if (loading) {
      return (
        <div className="figma-library-page">
          <div className="figma-library-loading-heading" />

          <div className="figma-library-loading-subheading" />

          <div className="figma-library-loading-row">
            <span />
            <span />
            <span />
          </div>
        </div>
      );
    }

    return (
      <div className="figma-library-page">
        <ListenerToast
          {...toast}
          onClose={() =>
            setToast(
              (
                current
              ) => ({
                ...current,
                open: false,
              })
            )
          }
        />

        <ListenerModal
          open={
            createOpen
          }
          title="Create playlist"
          subtitle="Organize audio you want to return to."
          size="small"
          onClose={() =>
            !creating &&
            setCreateOpen(
              false
            )
          }
          footer={
            <>
              <button
                type="button"
                className="lb-button"
                disabled={
                  creating
                }
                onClick={() =>
                  setCreateOpen(
                    false
                  )
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                form="figma-library-create-playlist"
                className="lb-button primary"
                disabled={
                  creating ||
                  !playlistName.trim()
                }
              >
                <FaPlus />

                {creating
                  ? "Creating..."
                  : "Create playlist"}
              </button>
            </>
          }
        >
          <form
            id="figma-library-create-playlist"
            className="figma-library-form"
            onSubmit={
              createPlaylist
            }
          >
            <label>
              Playlist name

              <input
                value={
                  playlistName
                }
                maxLength={100}
                placeholder="e.g. Morning Flow"
                onChange={(
                  event
                ) =>
                  setPlaylistName(
                    event.target
                      .value
                  )
                }
              />
            </label>

            <label>
              Description

              <textarea
                value={
                  playlistDescription
                }
                maxLength={500}
                placeholder="What is this playlist for?"
                onChange={(
                  event
                ) =>
                  setPlaylistDescription(
                    event.target
                      .value
                  )
                }
              />
            </label>
          </form>
        </ListenerModal>

        <header className="figma-library-header">
          <div>
            <h1>
              Your Library
            </h1>

            <p>
              Saved audio,
              playlists and the
              people you follow.
            </p>
          </div>

          <div className="figma-library-actions">
            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/library/following"
                )
              }
            >
              <FaUsers />

              Following

              {followedLive.length >
                0 && (
                <span className="figma-library-live-count">
                  {
                    followedLive.length
                  }
                </span>
              )}
            </button>

            <button
              type="button"
              className="primary"
              onClick={() =>
                setCreateOpen(
                  true
                )
              }
            >
              <FaPlus />
              Create playlist
            </button>
          </div>
        </header>

        <section className="figma-library-summary">
          <article>
            <div>
              <FaHeart />
            </div>

            <span>
              <strong>
                {
                  savedTracks.length
                }
              </strong>

              <small>
                Saved Audio
              </small>
            </span>
          </article>

          <article>
            <div>
              <FaBookOpen />
            </div>

            <span>
              <strong>
                {
                  playlists.length
                }
              </strong>

              <small>
                Playlists
              </small>
            </span>
          </article>

          <article>
            <div>
              <FaUsers />
            </div>

            <span>
              <strong>
                {
                  followedTotal
                }
              </strong>

              <small>
                Following
              </small>
            </span>
          </article>
        </section>

        <section className="figma-library-section">
          <div className="figma-library-section-heading">
            <div>
              <h2>
                Saved Audio
              </h2>

              <p>
                Audio you have
                saved for later.
              </p>
            </div>

            <span>
              {
                savedTracks.length
              }{" "}
              saved
            </span>
          </div>

          {savedTracks.length >
          0 ? (
            <HorizontalDragRail
              ariaLabel="Saved audio"
              className="figma-library-audio-rail"
            >
              {savedTracks.map(
                (
                  track,
                  index
                ) => (
                  <article
                    className="figma-library-audio-card"
                    key={
                      getTrackId(
                        track
                      ) ||
                      index
                    }
                  >
                    <div
                      className={`figma-library-audio-art variant-${
                        (index %
                          4) +
                        1
                      }`}
                    >
                      <AudioArtwork
                        track={
                          track
                        }
                      />

                      <button
                        type="button"
                        className="figma-library-play"
                        onClick={() =>
                          playAudio(
                            track,
                            savedTracks
                          )
                        }
                      >
                        {itemPlaying(
                          track
                        ) ? (
                          <FaPause />
                        ) : (
                          <FaPlay />
                        )}
                      </button>

                      <button
                        type="button"
                        className="figma-library-save saved"
                        onClick={() =>
                          toggleSave(
                            track
                          )
                        }
                        aria-label="Remove from saved audio"
                      >
                        <FaHeart />
                      </button>
                    </div>

                    <h3>
                      {track.title ||
                        "Untitled Audio"}
                    </h3>

                    <p>
                      {getArtist(
                        track
                      )}
                    </p>
                  </article>
                )
              )}
            </HorizontalDragRail>
          ) : (
            <div className="figma-library-empty">
              <div>
                <FaHeart />
              </div>

              <h3>
                Nothing saved yet
              </h3>

              <p>
                Browse the audio
                below and use the
                heart button to
                save something.
              </p>
            </div>
          )}
        </section>

        <section className="figma-library-following-preview">
          <div className="figma-library-following-icon">
            <FaUsers />
          </div>

          <div className="figma-library-following-copy">
            <h2>
              Following
            </h2>

            <p>
              {followedTotal >
              0
                ? `You follow ${followedTotal} creators and stations.`
                : "Creators and stations you follow will appear here."}
            </p>

            {followedLive.length >
              0 && (
              <span>
                <i />

                {
                  followedLive.length
                }{" "}
                followed{" "}
                {followedLive.length ===
                1
                  ? "channel is"
                  : "channels are"}{" "}
                live now
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              navigate(
                "/listen/library/following"
              )
            }
          >
            Open Following
          </button>
        </section>

        <section className="figma-library-section">
          <div className="figma-library-section-heading">
            <div>
              <h2>
                Playlists
              </h2>

              <p>
                Organize audio
                into collections.
              </p>
            </div>

            <button
              type="button"
              className="figma-library-text-action"
              onClick={() =>
                setCreateOpen(
                  true
                )
              }
            >
              + New playlist
            </button>
          </div>

          {playlists.length >
          0 ? (
            <HorizontalDragRail
              ariaLabel="Your playlists"
              className="figma-library-playlist-rail"
            >
              {playlists.map(
                (
                  playlist,
                  index
                ) => (
                  <article
                    className="figma-library-playlist-card"
                    key={
                      playlist.id ||
                      playlist._id ||
                      index
                    }
                  >
                    <div
                      className={`figma-library-playlist-art variant-${
                        (index %
                          4) +
                        1
                      }`}
                    >
                      <img
                            className="echoo-playlist-cover-image"
                            src={
                              playlist.tracks?.[0]
                                ?.coverArt ||
                              getMockMediaForKey(
                                playlist.id ||
                                  playlist._id ||
                                  playlist.name ||
                                  playlist.title ||
                                  "playlist",
                                "playlists"
                              )
                            }
                            alt=""
                            draggable="false"
                          />

                      <span>
                        {
                          (
                            playlist.tracks ||
                            []
                          ).length
                        }
                      </span>
                    </div>

                    <h3>
                      {playlist.name ||
                        "Untitled Playlist"}
                    </h3>

                    <p>
                      {playlist.description ||
                        "Your Echoo audio collection."}
                    </p>

                    <small>
                      {playlist.owner
                        ?.displayName ||
                        playlist.owner
                          ?.username ||
                        displayName}
                    </small>
                  </article>
                )
              )}
            </HorizontalDragRail>
          ) : (
            <div className="figma-library-empty">
              <div>
                <FaBookOpen />
              </div>

              <h3>
                No playlists yet
              </h3>

              <p>
                Create your first
                playlist to
                organize audio.
              </p>

              <button
                type="button"
                onClick={() =>
                  setCreateOpen(
                    true
                  )
                }
              >
                <FaPlus />
                Create playlist
              </button>
            </div>
          )}
        </section>

        <section className="figma-library-section">
          <div className="figma-library-section-heading">
            <div>
              <h2>
                Saved Audio
              </h2>

              <p>
                Browse audio and
                save what you want
                to return to.
              </p>
            </div>

            <span>
              {
                tracks.length
              }{" "}
              tracks
            </span>
          </div>

          {tracks.length >
          0 ? (
            <HorizontalDragRail
              ariaLabel="Saved audio"
              className="figma-library-audio-rail"
            >
              {tracks.map(
                (
                  track,
                  index
                ) => (
                  <article
                    className="figma-library-audio-card"
                    key={
                      getTrackId(
                        track
                      ) ||
                      `${track.title}-${index}`
                    }
                  >
                    <div
                      className={`figma-library-audio-art variant-${
                        (index %
                          4) +
                        1
                      }`}
                    >
                      <AudioArtwork
                        track={
                          track
                        }
                      />

                      <button
                        type="button"
                        className="figma-library-play"
                        onClick={() =>
                          playAudio(
                            track,
                            tracks
                          )
                        }
                      >
                        {itemPlaying(
                          track
                        ) ? (
                          <FaPause />
                        ) : (
                          <FaPlay />
                        )}
                      </button>

                      <button
                        type="button"
                        className={`figma-library-save ${
                          isSaved(
                            track
                          )
                            ? "saved"
                            : ""
                        }`}
                        onClick={() =>
                          toggleSave(
                            track
                          )
                        }
                        aria-label={
                          isSaved(
                            track
                          )
                            ? "Remove from saved audio"
                            : "Save audio"
                        }
                      >
                        {isSaved(
                          track
                        ) ? (
                          <FaHeart />
                        ) : (
                          <FaPlus />
                        )}
                      </button>
                    </div>

                    <h3>
                      {track.title ||
                        "Untitled Audio"}
                    </h3>

                    <p>
                      {getArtist(
                        track
                      )}
                    </p>

                    <span className="figma-library-audio-genre">
                      {track.genre ||
                        "Audio"}
                    </span>
                  </article>
                )
              )}
            </HorizontalDragRail>
          ) : (
            <div className="figma-library-empty">
              <div>
                <FaHeadphones />
              </div>

              <h3>
                No audio available
              </h3>

              <p>
                New public audio
                will appear here
                when available.
              </p>
            </div>
          )}
        </section>
      </div>
    );
  };

export default ListenerLibrary;
