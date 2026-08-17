import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useOutletContext,
} from "react-router-dom";

import {
  FaCheckCircle,
  FaCloudDownloadAlt,
  FaDownload,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaTrash,
} from "react-icons/fa";

import audioService from "../../services/audioService";
import downloadService from "../../services/downloadService";

import HorizontalDragRail from "../FigmaUI/HorizontalDragRail";
import ListenerToast from "../ListenerUI/ListenerToast";
import ListenerModal from "../ListenerUI/ListenerModal";

import "../ListenerUI/ListenerBeautiful.css";
import "./ListenerDownloads.css";

import { getMockMediaForKey } from "../../services/mockMediaService.js";
const normalizeTrack = (
  track
) => {
  const artist =
    track?.artist;

  return {
    ...track,

    id:
      track?.id ||
      track?._id,

    title:
      track?.title ||
      "Untitled Audio",

    artistName:
      track?.artistName ||
      (
        typeof artist ===
        "string"
          ? artist
          : artist?.displayName ||
            artist?.username
      ) ||
      track?.subtitle ||
      "Echoo Creator",

    genre:
      track?.genre ||
      "Audio",

    duration:
      Number(
        track?.duration
      ) || 0,

    coverArt:
      track?.coverArt ||
      track?.artwork ||
      track?.image ||
      track?.thumbnail ||
      getMockMediaForKey(
        `${
          track?.id ||
          track?._id ||
          ""
        } ${
          track?.title ||
          ""
        }`,
        "audio"
      ),

    fileUrl:
      track?.fileUrl ||
      null,
  };
};

const extractAudio = (
  response
) => {
  if (
    Array.isArray(
      response?.data
    )
  ) {
    return response
      .data
      .map(
        normalizeTrack
      );
  }

  if (
    Array.isArray(
      response?.data
        ?.tracks
    )
  ) {
    return response
      .data
      .tracks
      .map(
        normalizeTrack
      );
  }

  return [];
};

const formatTime = (
  seconds
) => {
  const total =
    Number(
      seconds
    ) || 0;

  const minutes =
    Math.floor(
      total / 60
    );

  const secs =
    Math.floor(
      total % 60
    );

  return `${minutes}:${String(
    secs
  ).padStart(
    2,
    "0"
  )}`;
};

const formatDownloadedDate = (
  value
) => {
  if (!value) {
    return "";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleDateString(
    [],
    {
      month: "short",
      day: "numeric",
    }
  );
};

const DownloadArtwork = ({
  track,
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  const fallback =
    getMockMediaForKey(
      `${
        track?.id ||
        ""
      } ${
        track?.title ||
        ""
      }`,
      "audio"
    );

  const source =
    failed
      ? fallback
      : (
          track?.coverArt ||
          fallback
        );

  if (source) {
    return (
      <img
        src={
          source
        }
        alt=""
        draggable="false"
        onError={() => {
          if (
            source !==
            fallback
          ) {
            setFailed(
              true
            );
          }
        }}
      />
    );
  }

  return (
    <div className="figma-download-art-fallback">
      <FaHeadphones />
    </div>
  );
};


const ListenerDownloads =
  () => {
    const {
      playTrack,
      currentTrack,
      isPlaying,
      togglePlay,
    } =
      useOutletContext();

    const [
      available,
      setAvailable,
    ] = useState([]);

    const [
      downloaded,
      setDownloaded,
    ] = useState([]);

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      busyId,
      setBusyId,
    ] = useState(null);

    const [
      clearOpen,
      setClearOpen,
    ] = useState(false);

    const [
      toast,
      setToast,
    ] = useState({
      open: false,
      type: "info",
      title: "",
      message: "",
    });

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

    const readDownloads =
      () => {
        try {
          const items =
            downloadService.getAll();

          setDownloaded(
            Array.isArray(
              items
            )
              ? items.map(
                  normalizeTrack
                )
              : []
          );
        } catch (
          error
        ) {
          console.error(
            "Could not read downloads:",
            error
          );

          setDownloaded([]);
        }
      };

    const load =
      async () => {
        setLoading(true);

        try {
          const response =
            await audioService.getAll({
              public: true,
              page: 1,
              limit: 100,
            });

          setAvailable(
            extractAudio(
              response
            )
          );
        } catch (
          error
        ) {
          console.error(
            "Available downloads error:",
            error
          );

          showToast(
            "error",
            "Could not load audio",
            error?.message ||
              "Available audio could not be loaded."
          );

          setAvailable([]);
        }

        readDownloads();

        setLoading(false);
      };

    useEffect(() => {
      load();
    }, []);

    const downloadedIds =
      useMemo(
        () =>
          new Set(
            downloaded
              .map(
                (
                  item
                ) =>
                  String(
                    item.id
                  )
              )
              .filter(Boolean)
          ),
        [
          downloaded,
        ]
      );

    const genreCount =
      useMemo(
        () =>
          new Set(
            downloaded.map(
              (
                item
              ) =>
                item.genre
            )
          ).size,
        [
          downloaded,
        ]
      );

    const totalDuration =
      useMemo(
        () =>
          downloaded.reduce(
            (
              total,
              item
            ) =>
              total +
              (
                Number(
                  item.duration
                ) || 0
              ),
            0
          ),
        [
          downloaded,
        ]
      );

    const durationLabel =
      totalDuration >
      0
        ? `${Math.max(
            1,
            Math.round(
              totalDuration /
              60
            )
          )} min`
        : "0 min";

    const downloadTrack =
      async (
        track
      ) => {
        if (
          !track?.id
        ) {
          return;
        }

        if (
          downloadedIds.has(
            String(
              track.id
            )
          )
        ) {
          return;
        }

        try {
          setBusyId(
            track.id
          );

          await downloadService.download(
            track
          );

          readDownloads();

          showToast(
            "success",
            "Download complete",
            `"${track.title}" is ready for offline listening.`
          );
        } catch (
          error
        ) {
          console.error(
            "Download error:",
            error
          );

          showToast(
            "error",
            "Download failed",
            error?.message ||
              "This audio could not be downloaded."
          );
        } finally {
          setBusyId(
            null
          );
        }
      };

    const removeTrack =
      async (
        track
      ) => {
        if (
          !track?.id
        ) {
          return;
        }

        try {
          setBusyId(
            track.id
          );

          await downloadService.remove(
            track.id
          );

          readDownloads();

          showToast(
            "success",
            "Download removed",
            `"${track.title}" was removed from offline storage.`
          );
        } catch (
          error
        ) {
          showToast(
            "error",
            "Could not remove download",
            error?.message ||
              "Please try again."
          );
        } finally {
          setBusyId(
            null
          );
        }
      };

    const clearDownloads =
      async () => {
        try {
          await downloadService.clear();

          readDownloads();

          setClearOpen(
            false
          );

          showToast(
            "success",
            "Downloads cleared",
            "Your offline audio list is now empty."
          );
        } catch (
          error
        ) {
          showToast(
            "error",
            "Could not clear downloads",
            error?.message ||
              "Please try again."
          );
        }
      };

    const playAvailable =
      (
        track,
        queue
      ) => {
        if (
          currentTrack?.id ===
          track.id
        ) {
          togglePlay();

          return;
        }

        playTrack(
          track,
          queue
        );
      };

    const playDownloaded =
      async (
        track
      ) => {
        if (
          currentTrack?.id ===
            track.id &&
          isPlaying
        ) {
          togglePlay();

          return;
        }

        try {
          setBusyId(
            `play-${track.id}`
          );

          const playableUrl =
            await downloadService.getPlayableUrl(
              track.id
            );

          playTrack(
            {
              ...track,

              fileUrl:
                playableUrl ||
                track.fileUrl,
            },
            downloaded
          );
        } catch (
          error
        ) {
          console.error(
            "Offline playback error:",
            error
          );

          if (
            track.fileUrl
          ) {
            playTrack(
              track,
              downloaded
            );

            return;
          }

          showToast(
            "error",
            "Could not play download",
            error?.message ||
              "This offline audio is unavailable."
          );
        } finally {
          setBusyId(
            null
          );
        }
      };

    const isPlayingItem =
      (
        track
      ) =>
        currentTrack?.id ===
          track.id &&
        isPlaying;

    if (loading) {
      return (
        <div className="figma-downloads-page">
          <div className="figma-download-loading-title" />
          <div className="figma-download-loading-subtitle" />

          <div className="figma-download-loading-row">
            <span />
            <span />
            <span />
          </div>
        </div>
      );
    }

    return (
      <div className="figma-downloads-page">
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
            clearOpen
          }
          size="small"
          title="Clear downloads?"
          subtitle="This removes every downloaded audio item stored by Echoo on this browser."
          onClose={() =>
            setClearOpen(
              false
            )
          }
          footer={
            <>
              <button
                type="button"
                className="lb-button"
                onClick={() =>
                  setClearOpen(
                    false
                  )
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="lb-button danger"
                onClick={
                  clearDownloads
                }
              >
                <FaTrash />
                Clear downloads
              </button>
            </>
          }
        >
          <div className="figma-download-clear-copy">
            You currently have{" "}
            <strong>
              {
                downloaded.length
              }
            </strong>{" "}
            downloaded{" "}
            {downloaded.length ===
            1
              ? "item"
              : "items"}
            .
          </div>
        </ListenerModal>

        <header className="figma-downloads-header">
          <div>
            <h1>
              Downloads
            </h1>

            <p>
              Keep audio available
              on this device for
              offline listening.
            </p>
          </div>

          {downloaded.length >
            0 && (
            <button
              type="button"
              className="figma-download-clear-button"
              onClick={() =>
                setClearOpen(
                  true
                )
              }
            >
              <FaTrash />
              Clear downloads
            </button>
          )}
        </header>

        <section className="figma-download-summary">
          <article>
            <div>
              <FaDownload />
            </div>

            <span>
              <strong>
                {
                  downloaded.length
                }
              </strong>

              <small>
                Downloaded
              </small>
            </span>
          </article>

          <article>
            <div>
              <FaCheckCircle />
            </div>

            <span>
              <strong>
                {downloaded.length >
                0
                  ? "Ready"
                  : "Empty"}
              </strong>

              <small>
                Offline status
              </small>
            </span>
          </article>

          <article>
            <div>
              <FaHeadphones />
            </div>

            <span>
              <strong>
                {
                  genreCount
                }
              </strong>

              <small>
                Categories
              </small>
            </span>
          </article>

          <article>
            <div>
              <FaCloudDownloadAlt />
            </div>

            <span>
              <strong>
                {
                  durationLabel
                }
              </strong>

              <small>
                Offline audio
              </small>
            </span>
          </article>
        </section>

        <section className="figma-download-section">
          <div className="figma-download-section-heading">
            <div>
              <h2>
                Offline Audio
              </h2>

              <p>
                Audio already stored
                on this browser.
              </p>
            </div>

            <span>
              {
                downloaded.length
              }{" "}
              downloaded
            </span>
          </div>

          {downloaded.length ===
          0 ? (
            <div className="figma-download-empty">
              <div>
                <FaCloudDownloadAlt />
              </div>

              <h3>
                Nothing downloaded
                yet
              </h3>

              <p>
                Choose an audio item
                from Available to
                Download below.
              </p>
            </div>
          ) : (
            <HorizontalDragRail
              ariaLabel="Offline audio"
              className="figma-download-offline-rail"
            >
              {downloaded.map(
                (
                  track,
                  index
                ) => (
                  <article
                    className="figma-downloaded-card"
                    key={
                      track.id ||
                      index
                    }
                  >
                    <div
                      className={`figma-downloaded-art variant-${
                        (index %
                          4) +
                        1
                      }`}
                    >
                      <DownloadArtwork
                        track={
                          track
                        }
                      />

                      <span className="figma-download-offline-badge">
                        <FaCheckCircle />
                        OFFLINE
                      </span>

                      <button
                        type="button"
                        className="figma-downloaded-play"
                        disabled={
                          busyId ===
                          `play-${track.id}`
                        }
                        onClick={() =>
                          playDownloaded(
                            track
                          )
                        }
                      >
                        {isPlayingItem(
                          track
                        ) ? (
                          <FaPause />
                        ) : (
                          <FaPlay />
                        )}
                      </button>
                    </div>

                    <div className="figma-downloaded-copy">
                      <h3>
                        {
                          track.title
                        }
                      </h3>

                      <p>
                        {
                          track.artistName
                        }
                      </p>

                      <div>
                        <span>
                          {
                            track.genre
                          }
                        </span>

                        <span>
                          {formatTime(
                            track.duration
                          )}
                        </span>
                      </div>

                      {track.downloadedAt && (
                        <small>
                          Downloaded{" "}
                          {formatDownloadedDate(
                            track.downloadedAt
                          )}
                        </small>
                      )}
                    </div>

                    <button
                      type="button"
                      className="figma-downloaded-remove"
                      disabled={
                        busyId ===
                        track.id
                      }
                      onClick={() =>
                        removeTrack(
                          track
                        )
                      }
                    >
                      <FaTrash />
                      Remove
                    </button>
                  </article>
                )
              )}
            </HorizontalDragRail>
          )}
        </section>

        <section className="figma-download-section">
          <div className="figma-download-section-heading">
            <div>
              <h2>
                Available to Download
              </h2>

              <p>
                Published Echoo
                audio that can be
                stored for offline
                listening.
              </p>
            </div>

            <span>
              {
                available.length
              }{" "}
              tracks
            </span>
          </div>

          {available.length ===
          0 ? (
            <div className="figma-download-empty">
              <div>
                <FaHeadphones />
              </div>

              <h3>
                No audio available
              </h3>

              <p>
                Published audio will
                appear here when it
                becomes available.
              </p>
            </div>
          ) : (
            <HorizontalDragRail
              ariaLabel="Available downloads"
              className="figma-download-available-rail"
            >
              {available.map(
                (
                  track,
                  index
                ) => {
                  const saved =
                    downloadedIds.has(
                      String(
                        track.id
                      )
                    );

                  return (
                    <article
                      className="figma-download-available-card"
                      key={
                        track.id ||
                        index
                      }
                    >
                      <div
                        className={`figma-download-available-art variant-${
                          (index %
                            4) +
                          1
                        }`}
                      >
                        <DownloadArtwork
                          track={
                            track
                          }
                        />

                        <button
                          type="button"
                          className="figma-download-available-play"
                          onClick={() =>
                            playAvailable(
                              track,
                              available
                            )
                          }
                        >
                          {isPlayingItem(
                            track
                          ) ? (
                            <FaPause />
                          ) : (
                            <FaPlay />
                          )}
                        </button>

                        {saved && (
                          <span className="figma-download-saved-indicator">
                            <FaCheckCircle />
                          </span>
                        )}
                      </div>

                      <h3>
                        {
                          track.title
                        }
                      </h3>

                      <p>
                        {
                          track.artistName
                        }
                      </p>

                      <div className="figma-download-available-meta">
                        <span>
                          {
                            track.genre
                          }
                        </span>

                        <span>
                          {formatTime(
                            track.duration
                          )}
                        </span>
                      </div>

                      {saved ? (
                        <button
                          type="button"
                          className="figma-download-button downloaded"
                          disabled
                        >
                          <FaCheckCircle />
                          Downloaded
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="figma-download-button"
                          disabled={
                            busyId ===
                            track.id
                          }
                          onClick={() =>
                            downloadTrack(
                              track
                            )
                          }
                        >
                          <FaDownload />

                          {busyId ===
                          track.id
                            ? "Saving..."
                            : "Download"}
                        </button>
                      )}
                    </article>
                  );
                }
              )}
            </HorizontalDragRail>
          )}
        </section>
      </div>
    );
  };

export default ListenerDownloads;
