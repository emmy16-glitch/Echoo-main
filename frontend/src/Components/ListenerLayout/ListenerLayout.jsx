import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";

import "./ListenerLayout.css";
import "./ListenerLayout.figma.css";
import EchoSignal from "../EchooSystem/EchoSignal";
import "../../styles/echoo-identity-reset.css";
import "../../styles/echoo-asset-system.css";

import ListenerProfileMenu from "./ListenerProfileMenu";

import {
  FaBell,
  FaBookOpen,
  FaBroadcastTower,
  FaCog,
  FaDownload,
  FaHeart,
  FaHistory,
  FaHome,
  FaPause,
  FaPlay,
  FaPlus,
  FaRandom,
  FaRedoAlt,
  FaSearch,
  FaSlidersH,
  FaStepBackward,
  FaStepForward,
  FaTimes,
  FaVolumeMute,
  FaVolumeUp,
  FaHeadphones,
  FaMicrophone,
} from "react-icons/fa";

import echooLogo from "../Assets/logo.png";

import audioService from "../../services/audioService";
import listenerService from "../../services/listenerService";

import { getMockMediaForKey } from "../../services/mockMediaService.js";
const suggestedSearches = [
  "First Track",
  "Updated Track",
  "Podcast",
  "Technology",
];

const DEFAULT_TRACK = {
  id: null,
  title:
    "The Daily Motivation",
  subtitle:
    "Episode 24",
  coverClass:
    "motivation-cover",
  coverArt: null,
  fileUrl: null,
  duration: 0,
};

const formatTime =
  (
    seconds
  ) => {
    const safe =
      Number.isFinite(
        Number(
          seconds
        )
      )
        ? Number(
            seconds
          )
        : 0;

    const minutes =
      Math.floor(
        safe / 60
      );

    const remaining =
      Math.floor(
        safe % 60
      );

    return `${minutes}:${String(
      remaining
    ).padStart(
      2,
      "0"
    )}`;
  };

const isBackendTrackId =
  (
    id
  ) => {
    if (!id) {
      return false;
    }

    return /^[a-f\d]{24}$/i.test(
      String(
        id
      )
    );
  };

const getFallbackAudioUrl =
  (
    track
  ) => {
    const title =
      String(
        track?.title ||
        ""
      ).toLowerCase();

    if (
      title.includes(
        "deep focus"
      )
    ) {
      return "/audio/deep-focus.mp3";
    }

    if (
      title.includes(
        "updated track"
      )
    ) {
      return "/audio/deep-focus.mp3";
    }

    if (
      title.includes(
        "sunday"
      )
    ) {
      return "/audio/sunday-message.mp3";
    }

    if (
      title.includes(
        "first track"
      )
    ) {
      return "/audio/motivation.mp3";
    }

    if (
      title.includes(
        "daily motivation"
      )
    ) {
      return "/audio/motivation.mp3";
    }

    if (
      title.includes(
        "morning prayer"
      )
    ) {
      return "/audio/motivation.mp3";
    }

    if (
      title.includes(
        "worship"
      )
    ) {
      return "/audio/sunday-message.mp3";
    }

    return null;
  };

const normalizePlayerTrack =
  (
    track
  ) => {
    if (!track) {
      return null;
    }

    return {
      ...track,

      id:
        track.id ||
        track._id ||
        null,

      title:
        track.title ||
        "Untitled Audio",

      subtitle:
        track.subtitle ||
        track.artistName ||
        track.artist
          ?.displayName ||
        track.artist
          ?.username ||
        track.artist ||
        "Echoo Audio",

      coverClass:
        track.coverClass ||
        "motivation-cover",

      coverArt:
        track.coverArt ||
        null,

      fileUrl:
        getFallbackAudioUrl(
          track
        ) ||
        track.fileUrl ||
        null,

      duration:
        Number(
          track.duration
        ) || 0,
    };
  };

const normalizeSearchData =
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

const ListenerLayout =
  () => {
    const navigate =
      useNavigate();

    const searchRef =
      useRef(
        null
      );

    const searchAreaRef =
      useRef(
        null
      );

    const audioRef =
      useRef(
        null
      );

    const pendingSeekRef =
      useRef(
        null
      );

    const progressSyncRef =
      useRef(
        false
      );

    let storedUser =
      {};

    try {
      storedUser =
        JSON.parse(
          localStorage.getItem(
            "user"
          )
        ) || {};
    } catch {
      storedUser =
        {};
    }

    const displayName =
      storedUser.displayName ||
      storedUser.fullname ||
      storedUser.name ||
      storedUser.username ||
      "Listener";

    const profileImage =
      storedUser.profileImage ||
      storedUser.avatar ||
      localStorage.getItem(
        "profileImage"
      ) ||
      null;

    const [
      searchQuery,
      setSearchQuery,
    ] = useState(
      ""
    );

    const [
      searchOpen,
      setSearchOpen,
    ] = useState(
      false
    );

    const [
      searchResults,
      setSearchResults,
    ] = useState(
      []
    );

    const [
      searchLoading,
      setSearchLoading,
    ] = useState(
      false
    );

    const [
      searchError,
      setSearchError,
    ] = useState(
      ""
    );

    const [
      currentTrack,
      setCurrentTrack,
    ] = useState(
      DEFAULT_TRACK
    );

    const [
      isPlaying,
      setIsPlaying,
    ] = useState(
      false
    );

    const [
      currentTime,
      setCurrentTime,
    ] = useState(
      0
    );

    const [
      duration,
      setDuration,
    ] = useState(
      0
    );

    const [
      volume,
      setVolume,
    ] = useState(
      1
    );

    const [
      isMuted,
      setIsMuted,
    ] = useState(
      false
    );

    const [
      queue,
      setQueue,
    ] = useState(
      []
    );

    const [
      queueIndex,
      setQueueIndex,
    ] = useState(
      -1
    );

    const [
      shuffle,
      setShuffle,
    ] = useState(
      false
    );

    const [
      repeatMode,
      setRepeatMode,
    ] = useState(
      "off"
    );

    const [
      playbackRate,
      setPlaybackRate,
    ] = useState(
      1
    );

    const navigation =
      [
        {
          name:
            "Home",

          path:
            "/listen",

          icon:
            <FaHome />,

          end:
            true,
        },

        {
          name:
            "Live",

          path:
            "/listen/live",

          icon:
            <FaBroadcastTower />,
        },

        {
          name:
            "Stations",

          path:
            "/listen/stations",

          icon:
            <FaHeadphones />,
        },

        {
          name:
            "Library",

          path:
            "/listen/library",

          icon:
            <FaBookOpen />,
        },

        {
          name:
            "History",

          path:
            "/listen/history",

          icon:
            <FaHistory />,
        },

        {
          name:
            "Downloads",

          path:
            "/listen/downloads",

          icon:
            <FaDownload />,
        },
      ];

    const syncProgress =
      async (
        completed =
          false
      ) => {
        if (
          progressSyncRef.current
        ) {
          return;
        }

        const audio =
          audioRef.current;

        if (
          !audio ||
          !isBackendTrackId(
            currentTrack?.id
          )
        ) {
          return;
        }

        if (
          !Number.isFinite(
            audio.currentTime
          )
        ) {
          return;
        }

        progressSyncRef.current =
          true;

        try {
          await listenerService.updateProgress(
            {
              trackId:
                currentTrack.id,

              progress:
                Math.floor(
                  audio.currentTime
                ),

              duration:
                Math.floor(
                  audio.duration ||
                  duration ||
                  currentTrack.duration ||
                  0
                ),

              completed,
            }
          );
        } catch (
          error
        ) {
          console.error(
            "Could not sync playback progress:",
            error
          );
        } finally {
          progressSyncRef.current =
            false;
        }
      };

    const addTrackToQueue =
      (
        track
      ) => {
        setQueue(
          (
            previous
          ) => {
            const existingIndex =
              previous.findIndex(
                (
                  item
                ) =>
                  item.id &&
                  track.id &&
                  item.id ===
                    track.id
              );

            if (
              existingIndex >=
              0
            ) {
              setQueueIndex(
                existingIndex
              );

              return previous;
            }

            const next =
              [
                ...previous,
                track,
              ];

            setQueueIndex(
              next.length -
                1
            );

            return next;
          }
        );
      };

    const playTrack =
      (
        track,
        incomingQueue =
          null
      ) => {
        const normalized =
          normalizePlayerTrack(
            track
          );

        if (
          !normalized
        ) {
          return;
        }

        const audio =
          audioRef.current;

        if (
          currentTrack?.id &&
          normalized.id &&
          currentTrack.id !==
            normalized.id &&
          audio &&
          audio.currentTime >
            0
        ) {
          syncProgress(
            false
          );
        }

        if (
          Array.isArray(
            incomingQueue
          ) &&
          incomingQueue.length >
            0
        ) {
          const normalizedQueue =
            incomingQueue
              .map(
                normalizePlayerTrack
              )
              .filter(
                Boolean
              );

          setQueue(
            normalizedQueue
          );

          const index =
            normalizedQueue.findIndex(
              (
                item
              ) =>
                item.id ===
                  normalized.id ||
                item.title ===
                  normalized.title
            );

          setQueueIndex(
            index >=
              0
              ? index
              : 0
          );
        } else {
          addTrackToQueue(
            normalized
          );
        }

        setCurrentTrack(
          normalized
        );

        setCurrentTime(
          0
        );

        setDuration(
          normalized.duration ||
            0
        );

        setIsPlaying(
          true
        );

        if (
          isBackendTrackId(
            normalized.id
          )
        ) {
          listenerService
            .addToContinueListening(
              normalized.id
            )
            .catch(
              () => {}
            );

          audioService
            .play(
              normalized.id
            )
            .catch(
              () => {}
            );
        }
      };


    const seekTo =
      (
        seconds
      ) => {
        const requested =
          Math.max(
            0,
            Number(
              seconds
            ) || 0
          );

        const audio =
          audioRef.current;

        if (!audio) {
          pendingSeekRef.current =
            requested;

          return requested;
        }

        let target =
          requested;

        if (
          Number.isFinite(
            audio.duration
          ) &&
          audio.duration >
            0
        ) {
          target =
            Math.min(
              requested,
              Math.max(
                0,
                audio.duration -
                  0.05
              )
            );
        }

        try {
          audio.currentTime =
            target;

          setCurrentTime(
            target
          );

          pendingSeekRef.current =
            null;
        } catch {
          pendingSeekRef.current =
            requested;
        }

        return target;
      };


    const playTrackAt =
      (
        track,
        seconds,
        incomingQueue =
          null
      ) => {
        const normalized =
          normalizePlayerTrack(
            track
          );

        if (!normalized) {
          return;
        }

        const requested =
          Math.max(
            0,
            Number(
              seconds
            ) || 0
          );

        const sameTrack =
          currentTrack?.id &&
          normalized.id &&
          String(
            currentTrack.id
          ) ===
            String(
              normalized.id
            );

        if (
          sameTrack &&
          audioRef.current
        ) {
          seekTo(
            requested
          );

          audioRef.current
            .play()
            .then(
              () =>
                setIsPlaying(
                  true
                )
            )
            .catch(
              () => {}
            );

          return;
        }

        pendingSeekRef.current =
          requested;

        playTrack(
          track,
          incomingQueue
        );
      };


    const togglePlay =
      async () => {
        const audio =
          audioRef.current;

        if (!audio) {
          return;
        }

        if (
          !currentTrack?.fileUrl
        ) {
          const fallback =
            getFallbackAudioUrl(
              currentTrack
            );

          if (
            !fallback
          ) {
            return;
          }

          setCurrentTrack(
            (
              current
            ) => ({
              ...current,

              fileUrl:
                fallback,
            })
          );

          return;
        }

        if (
          audio.paused
        ) {
          try {
            await audio.play();

            setIsPlaying(
              true
            );
          } catch (
            error
          ) {
            console.error(
              "Could not play audio:",
              error
            );

            setIsPlaying(
              false
            );
          }

          return;
        }

        audio.pause();

        setIsPlaying(
          false
        );

        syncProgress(
          false
        );
      };

    const playQueueTrack =
      (
        index
      ) => {
        if (
          index <
            0 ||
          index >=
            queue.length
        ) {
          return;
        }

        const track =
          queue[index];

        setQueueIndex(
          index
        );

        setCurrentTrack(
          track
        );

        setCurrentTime(
          0
        );

        setDuration(
          track.duration ||
            0
        );

        setIsPlaying(
          true
        );

        if (
          isBackendTrackId(
            track.id
          )
        ) {
          listenerService
            .addToContinueListening(
              track.id
            )
            .catch(
              () => {}
            );

          audioService
            .play(
              track.id
            )
            .catch(
              () => {}
            );
        }
      };

    const playPrevious =
      () => {
        const audio =
          audioRef.current;

        if (
          audio &&
          audio.currentTime >
            5
        ) {
          audio.currentTime =
            0;

          setCurrentTime(
            0
          );

          return;
        }

        if (
          queue.length ===
          0
        ) {
          return;
        }

        let previous =
          queueIndex -
          1;

        if (
          previous <
            0 &&
          repeatMode ===
            "all"
        ) {
          previous =
            queue.length -
            1;
        }

        if (
          previous <
          0
        ) {
          return;
        }

        syncProgress(
          false
        );

        playQueueTrack(
          previous
        );
      };

    const playNext =
      () => {
        if (
          queue.length ===
          0
        ) {
          setIsPlaying(
            false
          );

          return;
        }

        let next;

        if (
          shuffle &&
          queue.length >
            1
        ) {
          do {
            next =
              Math.floor(
                Math.random() *
                  queue.length
              );
          } while (
            next ===
            queueIndex
          );
        } else {
          next =
            queueIndex +
            1;
        }

        if (
          next >=
          queue.length
        ) {
          if (
            repeatMode ===
            "all"
          ) {
            next =
              0;
          } else {
            setIsPlaying(
              false
            );

            return;
          }
        }

        syncProgress(
          false
        );

        playQueueTrack(
          next
        );
      };

    const handleEnded =
      () => {
        syncProgress(
          true
        );

        if (
          repeatMode ===
          "one"
        ) {
          const audio =
            audioRef.current;

          if (
            audio
          ) {
            audio.currentTime =
              0;

            audio
              .play()
              .catch(
                () =>
                  setIsPlaying(
                    false
                  )
              );
          }

          return;
        }

        playNext();
      };

    const handleTimeUpdate =
      () => {
        const audio =
          audioRef.current;

        if (!audio) {
          return;
        }

        setCurrentTime(
          audio.currentTime ||
            0
        );
      };

    const handleLoadedMetadata =
      () => {
        const audio =
          audioRef.current;

        if (!audio) {
          return;
        }

        setDuration(
          Number.isFinite(
            audio.duration
          )
            ? audio.duration
            : currentTrack
                ?.duration ||
              0
        );

        audio.volume =
          volume;

        audio.muted =
          isMuted;

        audio.playbackRate =
          playbackRate;

        const pending =
          pendingSeekRef.current;

        if (
          pending !==
          null
        ) {
          seekTo(
            pending
          );
        }
      };

    const handleSeek =
      (
        event
      ) => {
        const audio =
          audioRef.current;

        if (
          !audio ||
          !duration
        ) {
          return;
        }

        const rect =
          event.currentTarget.getBoundingClientRect();

        const position =
          event.clientX -
          rect.left;

        const percentage =
          Math.min(
            1,
            Math.max(
              0,
              position /
                rect.width
            )
          );

        const next =
          percentage *
          duration;

        audio.currentTime =
          next;

        setCurrentTime(
          next
        );
      };

    const handleVolumeChange =
      (
        event
      ) => {
        const next =
          Number(
            event.target
              .value
          );

        setVolume(
          next
        );

        setIsMuted(
          next ===
          0
        );

        const audio =
          audioRef.current;

        if (
          audio
        ) {
          audio.volume =
            next;

          audio.muted =
            next ===
            0;
        }
      };

    const toggleMute =
      () => {
        const next =
          !isMuted;

        setIsMuted(
          next
        );

        if (
          audioRef.current
        ) {
          audioRef.current.muted =
            next;
        }
      };

    const toggleRepeat =
      () => {
        setRepeatMode(
          (
            current
          ) => {
            if (
              current ===
              "off"
            ) {
              return "all";
            }

            if (
              current ===
              "all"
            ) {
              return "one";
            }

            return "off";
          }
        );
      };

    const cyclePlaybackRate =
      () => {
        const rates =
          [
            1,
            1.25,
            1.5,
            2,
          ];

        const currentIndex =
          rates.indexOf(
            playbackRate
          );

        const next =
          rates[
            (
              currentIndex +
              1
            ) %
              rates.length
          ];

        setPlaybackRate(
          next
        );

        if (
          audioRef.current
        ) {
          audioRef.current.playbackRate =
            next;
        }
      };

    const clearSearch =
      () => {
        setSearchQuery(
          ""
        );

        setSearchResults(
          []
        );

        setSearchError(
          ""
        );

        searchRef.current?.focus();
      };

    const handleSuggestion =
      (
        suggestion
      ) => {
        setSearchQuery(
          suggestion
        );

        setSearchOpen(
          true
        );

        setTimeout(
          () =>
            searchRef.current?.focus(),
          0
        );
      };

    const selectSearchResult =
      (
        item
      ) => {
        playTrack(
          {
            ...item,

            subtitle:
              item.artistName ||
              item.artist
                ?.displayName ||
              item.subtitle ||
              "Echoo Audio",

            coverClass:
              item.coverClass ||
              "motivation-cover",
          },
          searchResults
        );

        setSearchOpen(
          false
        );

        setSearchQuery(
          ""
        );
      };

    useEffect(() => {
      const audio =
        audioRef.current;

      if (
        !audio ||
        !currentTrack
          ?.fileUrl
      ) {
        return;
      }

      audio.src =
        currentTrack.fileUrl;

      audio.load();

      audio.volume =
        volume;

      audio.muted =
        isMuted;

      audio.playbackRate =
        playbackRate;

      audio
        .play()
        .then(
          () =>
            setIsPlaying(
              true
            )
        )
        .catch(
          (
            error
          ) => {
            console.error(
              "Audio playback failed:",
              error
            );

            setIsPlaying(
              false
            );
          }
        );
    }, [
      currentTrack
        ?.fileUrl,
    ]);

    useEffect(() => {
      const query =
        searchQuery.trim();

      if (
        query.length <
        2
      ) {
        setSearchResults(
          []
        );

        setSearchLoading(
          false
        );

        setSearchError(
          ""
        );

        return;
      }

      let active =
        true;

      const timeout =
        setTimeout(
          async () => {
            try {
              setSearchLoading(
                true
              );

              setSearchError(
                ""
              );

              let response;

              if (
                typeof audioService.search ===
                "function"
              ) {
                response =
                  await audioService.search(
                    query
                  );
              } else {
                response =
                  await audioService.getAll(
                    {
                      search:
                        query,

                      public:
                        true,

                      page:
                        1,

                      limit:
                        12,
                    }
                  );
              }

              if (
                !active
              ) {
                return;
              }

              setSearchResults(
                normalizeSearchData(
                  response
                )
              );
            } catch (
              error
            ) {
              if (
                active
              ) {
                setSearchResults(
                  []
                );

                setSearchError(
                  error?.message ||
                    "Search failed."
                );
              }
            } finally {
              if (
                active
              ) {
                setSearchLoading(
                  false
                );
              }
            }
          },
          300
        );

      return () => {
        active =
          false;

        clearTimeout(
          timeout
        );
      };
    }, [
      searchQuery,
    ]);

    useEffect(() => {
      const handleKeyDown =
        (
          event
        ) => {
          const activeTag =
            document
              .activeElement
              ?.tagName;

          const typing =
            activeTag ===
              "INPUT" ||
            activeTag ===
              "TEXTAREA";

          if (
            event.key ===
              "/" &&
            !typing
          ) {
            event.preventDefault();

            setSearchOpen(
              true
            );

            setTimeout(
              () =>
                searchRef.current?.focus(),
              0
            );
          }

          if (
            event.key ===
            "Escape"
          ) {
            setSearchOpen(
              false
            );

            searchRef.current?.blur();
          }

          if (
            event.code ===
              "Space" &&
            !typing
          ) {
            event.preventDefault();

            togglePlay();
          }
        };

      window.addEventListener(
        "keydown",
        handleKeyDown
      );

      return () =>
        window.removeEventListener(
          "keydown",
          handleKeyDown
        );
    }, [
      currentTrack,
      isPlaying,
    ]);

    useEffect(() => {
      const outside =
        (
          event
        ) => {
          if (
            searchAreaRef.current &&
            !searchAreaRef.current.contains(
              event.target
            )
          ) {
            setSearchOpen(
              false
            );
          }
        };

      document.addEventListener(
        "mousedown",
        outside
      );

      return () =>
        document.removeEventListener(
          "mousedown",
          outside
        );
    }, []);

    useEffect(() => {
      const unload =
        () =>
          syncProgress(
            false
          );

      window.addEventListener(
        "beforeunload",
        unload
      );

      return () =>
        window.removeEventListener(
          "beforeunload",
          unload
        );
    }, [
      currentTrack,
      duration,
    ]);

    const progressPercentage =
      duration >
      0
        ? Math.min(
            100,
            Math.max(
              0,
              (
                currentTime /
                duration
              ) *
                100
            )
          )
        : 0;

    return (
      <div className="listener-layout echoo-listener-shell">
        <aside className="layout-sidebar">
          <button
            type="button"
            className="layout-brand"
            onClick={() =>
              navigate(
                "/listen"
              )
            }
            style={{
              border:
                0,

              background:
                "transparent",

              cursor:
                "pointer",
            }}
          >
            <img
              src={
                echooLogo
              }
              alt="Echoo"
            />

            <span>
              Echoo
            </span>
          </button>

          <nav className="layout-navigation">
            {navigation.map(
              (
                item
              ) => (
                <NavLink
                  key={
                    item.name
                  }
                  to={
                    item.path
                  }
                  end={
                    item.end
                  }
                  className={({
                    isActive,
                  }) =>
                    isActive
                      ? "layout-nav-item active"
                      : "layout-nav-item"
                  }
                >
                  <span className="layout-nav-icon">
                    {
                      item.icon
                    }
                  </span>

                  <span className="layout-nav-label">
                    {
                      item.name
                    }
                  </span>
                </NavLink>
              )
            )}
          </nav>

          <div className="layout-playlists">
            <div className="layout-playlist-heading">
              <span>
                Playlists
              </span>

              <button
                type="button"
                aria-label="Create playlist"
                onClick={() =>
                  navigate(
                    "/listen/library"
                  )
                }
              >
                <FaPlus />
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/library"
                )
              }
            >
              <span className="layout-playlist-icon purple">
                <FaHeadphones />
              </span>

              <span>
                Morning Flow
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/library"
                )
              }
            >
              <span className="layout-playlist-icon teal">
                <FaBookOpen />
              </span>

              <span>
                Deep Focus
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/library"
                )
              }
            >
              <span className="layout-playlist-icon coral">
                <FaBroadcastTower />
              </span>

              <span>
                Sunday Messages
              </span>
            </button>
          </div>

          <ListenerProfileMenu
            displayName={
              displayName
            }
            profileImage={
              profileImage
            }
          />
        </aside>

        <div className="layout-main echoo-listener-main">
          <header className="layout-topbar">
            <div
              className="beautiful-search-wrapper"
              ref={
                searchAreaRef
              }
            >
              <div
                className={`beautiful-search ${
                  searchOpen
                    ? "active"
                    : ""
                }`}
              >
                <FaSearch className="beautiful-search-icon" />

                <input
                  ref={
                    searchRef
                  }
                  type="text"
                  placeholder="Quick search..."
                  value={
                    searchQuery
                  }
                  onFocus={() =>
                    setSearchOpen(
                      true
                    )
                  }
                  onChange={(
                    event
                  ) => {
                    setSearchQuery(
                      event
                        .target
                        .value
                    );

                    setSearchOpen(
                      true
                    );
                  }}
                />

                {searchQuery ? (
                  <button
                    type="button"
                    className="beautiful-search-clear"
                    onClick={
                      clearSearch
                    }
                    aria-label="Clear search"
                  >
                    <FaTimes />
                  </button>
                ) : (
                  <span className="beautiful-search-shortcut">
                    /
                  </span>
                )}
              </div>

              {searchOpen && (
                <div className="beautiful-search-panel">
                  {!searchQuery.trim() ? (
                    <>
                      <div className="search-panel-section">
                        <span className="search-panel-label">
                          Suggested
                        </span>

                        <div className="search-suggestion-list">
                          {suggestedSearches.map(
                            (
                              suggestion
                            ) => (
                              <button
                                key={
                                  suggestion
                                }
                                type="button"
                                onClick={() =>
                                  handleSuggestion(
                                    suggestion
                                  )
                                }
                              >
                                <FaSearch />

                                <span>
                                  {
                                    suggestion
                                  }
                                </span>
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <div className="search-panel-footer">
                        <span>
                          Search Echoo
                          audio
                        </span>
                      </div>
                    </>
                  ) : searchLoading ? (
                    <div className="beautiful-search-empty">
                      <div>
                        <FaSearch />
                      </div>

                      <strong>
                        Searching
                        Echoo...
                      </strong>

                      <span>
                        Looking for “
                        {
                          searchQuery
                        }
                        ”
                      </span>
                    </div>
                  ) : searchError ? (
                    <div className="beautiful-search-empty">
                      <div>
                        <FaSearch />
                      </div>

                      <strong>
                        Search
                        unavailable
                      </strong>

                      <span>
                        {
                          searchError
                        }
                      </span>
                    </div>
                  ) : searchResults.length >
                    0 ? (
                    <>
                      <div className="search-panel-section">
                        <div className="search-results-heading">
                          <span className="search-panel-label">
                            Results
                          </span>

                          <span>
                            {
                              searchResults.length
                            }
                          </span>
                        </div>

                        <div className="beautiful-results">
                          {searchResults
                            .slice(
                              0,
                              6
                            )
                            .map(
                              (
                                item
                              ) => (
                                <button
                                  key={
                                    item.id ||
                                    item._id
                                  }
                                  type="button"
                                  className="beautiful-result-row"
                                  onClick={() =>
                                    selectSearchResult(
                                      item
                                    )
                                  }
                                >
                                  <div
                                    className={`beautiful-result-art ${
                                      item.coverClass ||
                                      "motivation-cover"
                                    }`}
                                  >
                                    {item.coverArt ? (
                                      <img
                                        src={
                                          item.coverArt
                                        }
                                        alt=""
                                        style={{
                                          width:
                                            "100%",

                                          height:
                                            "100%",

                                          objectFit:
                                            "cover",

                                          borderRadius:
                                            "inherit",
                                        }}
                                      />
                                    ) : item.genre ===
                                      "Live" ? (
                                      <FaMicrophone />
                                    ) : (
                                      <FaHeadphones />
                                    )}
                                  </div>

                                  <div className="beautiful-result-info">
                                    <strong>
                                      {
                                        item.title
                                      }
                                    </strong>

                                    <span>
                                      {item.artistName ||
                                        item.artist
                                          ?.displayName ||
                                        item.subtitle ||
                                        "Echoo Audio"}
                                    </span>
                                  </div>

                                  <span className="beautiful-result-type">
                                    {item.genre ||
                                      "Audio"}
                                  </span>

                                  <span className="beautiful-result-play">
                                    <FaPlay />
                                  </span>
                                </button>
                              )
                            )}
                        </div>
                      </div>

                      <div className="search-panel-footer">
                        <span>
                          Press Esc to
                          close
                        </span>

                        <span>
                          {
                            searchResults.length
                          }{" "}
                          results
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="beautiful-search-empty">
                      <div>
                        <FaSearch />
                      </div>

                      <strong>
                        No results
                        found
                      </strong>

                      <span>
                        Nothing matches
                        “
                        {
                          searchQuery
                        }
                        ”
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="layout-top-actions">
              <button
                type="button"
                className="layout-top-button notification"
                onClick={() =>
                  navigate(
                    "/listen/notifications"
                  )
                }
                title="Notifications"
              >
                <FaBell />
                <span />
              </button>

              <button
                type="button"
                className="layout-top-button"
                title="Settings"
              >
                <FaCog />
              </button>
            </div>
          </header>

          <main className="layout-content echoo-listener-scroll">
            <Outlet
              context={{
                playTrack,
                currentTrack,
                isPlaying,
                togglePlay,
                seekTo,
                playTrackAt,
                currentTime,
                duration,
                queue,
                playNext,
                playPrevious,
              }}
            />
          </main>
        </div>

        <div className="layout-player echoo-persistent-player">
          <audio
            ref={
              audioRef
            }
            preload="metadata"
            onTimeUpdate={
              handleTimeUpdate
            }
            onLoadedMetadata={
              handleLoadedMetadata
            }
            onDurationChange={
              handleLoadedMetadata
            }
            onEnded={
              handleEnded
            }
            onPlay={() =>
              setIsPlaying(
                true
              )
            }
            onPause={() =>
              setIsPlaying(
                false
              )
            }
            onError={(
              event
            ) => {
              console.error(
                "Audio element error:",
                event
              );

              setIsPlaying(
                false
              );
            }}
          />

          <div className="layout-player-track">
          <EchoSignal
            size="sm"
            active={isPlaying}
            className="layout-player-signal"
            label={
              isPlaying
                ? "Echoo playback active"
                : "Echoo playback signal"
            }
          />

            <div
              className={`layout-player-cover ${
                currentTrack?.coverClass ||
                ""
              }`}
            >
              {(
                currentTrack?.coverArt ||
                getMockMediaForKey(
                  `${
                    currentTrack?.id ||
                    currentTrack?._id ||
                    ""
                  } ${
                    currentTrack?.title ||
                    ""
                  }`,
                  "audio"
                )
              ) && (
                <img
                  src={
                    currentTrack?.coverArt ||
                    getMockMediaForKey(
                      `${
                        currentTrack?.id ||
                        currentTrack?._id ||
                        ""
                      } ${
                        currentTrack?.title ||
                        ""
                      }`,
                      "audio"
                    )
                  }
                  alt=""
                  style={{
                    width:
                      "100%",

                    height:
                      "100%",

                    objectFit:
                      "cover",

                    borderRadius:
                      "inherit",
                  }}
                />
              )}
            </div>

            <div className="layout-player-info">
              <strong>
                {currentTrack?.title ||
                  "Choose something to play"}
              </strong>

              <span>
                {currentTrack?.subtitle ||
                  "Echoo"}
              </span>
            </div>

            <button
              type="button"
              className="layout-player-heart"
              aria-label="Like track"
            >
              <FaHeart />
            </button>
          </div>

          <div className="layout-player-controls">
            <button
              type="button"
              onClick={() =>
                setShuffle(
                  (
                    current
                  ) =>
                    !current
                )
              }
              aria-label="Shuffle"
              title={
                shuffle
                  ? "Shuffle on"
                  : "Shuffle off"
              }
              style={{
                color:
                  shuffle
                    ? "#1769d3"
                    : undefined,
              }}
            >
              <FaRandom />
            </button>

            <button
              type="button"
              onClick={
                playPrevious
              }
              aria-label="Previous"
            >
              <FaStepBackward />
            </button>

            <button
              type="button"
              className="layout-main-play"
              onClick={
                togglePlay
              }
              aria-label={
                isPlaying
                  ? "Pause"
                  : "Play"
              }
            >
              {isPlaying ? (
                <FaPause />
              ) : (
                <FaPlay />
              )}
            </button>

            <button
              type="button"
              onClick={
                playNext
              }
              aria-label="Next"
            >
              <FaStepForward />
            </button>

            <button
              type="button"
              onClick={
                toggleRepeat
              }
              aria-label="Repeat"
              title={`Repeat: ${repeatMode}`}
              style={{
                color:
                  repeatMode !==
                  "off"
                    ? "#1769d3"
                    : undefined,
              }}
            >
              <FaRedoAlt />
            </button>
          </div>

          <div className="layout-player-progress-area">
            <span>
              {formatTime(
                currentTime
              )}
            </span>

            <div
              className="layout-player-progress"
              onClick={
                handleSeek
              }
              role="slider"
              aria-label="Audio progress"
              aria-valuemin="0"
              aria-valuemax={
                duration
              }
              aria-valuenow={
                currentTime
              }
              tabIndex={
                0
              }
              style={{
                cursor:
                  "pointer",
              }}
            >
              <div
                style={{
                  width:
                    `${progressPercentage}%`,
                }}
              />
            </div>

            <span>
              {formatTime(
                duration
              )}
            </span>

            <button
              type="button"
              onClick={
                toggleMute
              }
              aria-label={
                isMuted
                  ? "Unmute"
                  : "Mute"
              }
            >
              {isMuted ||
              volume ===
                0 ? (
                <FaVolumeMute />
              ) : (
                <FaVolumeUp />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={
                isMuted
                  ? 0
                  : volume
              }
              onChange={
                handleVolumeChange
              }
              aria-label="Volume"
              style={{
                width:
                  "68px",

                cursor:
                  "pointer",

                accentColor:
                  "#1769d3",
              }}
            />

            <button
              type="button"
              onClick={
                cyclePlaybackRate
              }
              aria-label="Playback speed"
              title={`${playbackRate}x playback speed`}
            >
              <FaSlidersH />
            </button>
          </div>
        </div>
      </div>
    );
  };

export default ListenerLayout;