import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useOutletContext,
} from "react-router-dom";

import {
  FaCheck,
  FaHeadphones,
  FaHistory,
  FaPause,
  FaPlay,
  FaRedoAlt,
} from "react-icons/fa";

import listenerService from "../../services/listenerService";
import audioService from "../../services/audioService";

import HorizontalDragRail from "../FigmaUI/HorizontalDragRail";
import ListenerToast from "../ListenerUI/ListenerToast";

import "../ListenerUI/ListenerBeautiful.css";
import "./ListenerHistory.css";

const startOfDay = (
  value
) => {
  const date =
    new Date(value);

  date.setHours(
    0,
    0,
    0,
    0
  );

  return date;
};

const getDateGroup = (
  value
) => {
  if (!value) {
    return "Older";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Older";
  }

  const today =
    startOfDay(
      new Date()
    );

  const target =
    startOfDay(
      date
    );

  const diff =
    Math.round(
      (
        today -
        target
      ) /
        86400000
    );

  if (diff === 0) {
    return "Today";
  }

  if (diff === 1) {
    return "Yesterday";
  }

  if (
    diff > 1 &&
    diff < 7
  ) {
    return "This Week";
  }

  return "Older";
};

const formatClock = (
  value
) => {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
};

const formatDate = (
  value
) => {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

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

const progressPercent = (
  item
) => {
  if (
    item?.completed
  ) {
    return 100;
  }

  const progress =
    Number(
      item?.progress
    ) || 0;

  const duration =
    Number(
      item?.duration
    ) || 0;

  if (
    progress <= 100
  ) {
    return Math.max(
      0,
      Math.min(
        100,
        progress
      )
    );
  }

  if (
    duration > 0
  ) {
    return Math.max(
      0,
      Math.min(
        100,
        (
          progress /
          duration
        ) *
          100
      )
    );
  }

  return 0;
};

const getTrackId = (
  item
) => {
  if (
    item?.trackId &&
    typeof item.trackId ===
      "object"
  ) {
    return (
      item.trackId.id ||
      item.trackId._id ||
      null
    );
  }

  return (
    item?.trackId ||
    item?.track?.id ||
    item?.track?._id ||
    item?.id ||
    item?._id ||
    null
  );
};

const getTitle = (
  item
) =>
  item?.title ||
  item?.track?.title ||
  item?.trackId?.title ||
  "Untitled Audio";

const getArtist = (
  item
) => {
  const source =
    item?.track ||
    (
      typeof item?.trackId ===
      "object"
        ? item.trackId
        : null
    ) ||
    item;

  const artist =
    source?.artist;

  return (
    source?.artistName ||
    (
      typeof artist ===
      "string"
        ? artist
        : artist?.displayName ||
          artist?.username
    ) ||
    source?.subtitle ||
    source?.genre ||
    "Echoo Audio"
  );
};

const getArtwork = (
  item
) => {
  const source =
    item?.track ||
    (
      typeof item?.trackId ===
      "object"
        ? item.trackId
        : null
    ) ||
    item;

  return (
    source?.coverArt ||
    source?.artwork ||
    source?.image ||
    source?.thumbnail ||
    null
  );
};

const getFileUrl = (
  item
) => {
  const source =
    item?.track ||
    (
      typeof item?.trackId ===
      "object"
        ? item.trackId
        : null
    ) ||
    item;

  return (
    source?.fileUrl ||
    null
  );
};

const extractHistory = (
  response
) => {
  if (
    Array.isArray(
      response?.data
        ?.history
    )
  ) {
    return response
      .data
      .history;
  }

  if (
    Array.isArray(
      response?.data
    )
  ) {
    return response.data;
  }

  if (
    Array.isArray(
      response?.history
    )
  ) {
    return response.history;
  }

  return [];
};

const extractContinue = (
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
        ?.items
    )
  ) {
    return response
      .data
      .items;
  }

  return [];
};

const HistoryArtwork = ({
  item,
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  const image =
    getArtwork(
      item
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
    <div className="figma-history-art-fallback">
      <FaHeadphones />
    </div>
  );
};

const ListenerHistory =
  () => {
    const {
      playTrack,
      currentTrack,
      isPlaying,
      togglePlay,
    } =
      useOutletContext();

    const [
      history,
      setHistory,
    ] = useState([]);

    const [
      continueListening,
      setContinueListening,
    ] = useState([]);

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      activeFilter,
      setActiveFilter,
    ] = useState(
      "All"
    );

    const [
      playingId,
      setPlayingId,
    ] = useState(null);

    const [
      toast,
      setToast,
    ] = useState({
      open: false,
      type: "info",
      title: "",
      message: "",
    });

    useEffect(() => {
      let active =
        true;

      const load =
        async () => {
          setLoading(true);

          const [
            historyResult,
            continueResult,
          ] =
            await Promise.allSettled(
              [
                listenerService.getHistory(
                  1,
                  100
                ),

                listenerService.getContinueListening(),
              ]
            );

          if (!active) {
            return;
          }

          if (
            historyResult.status ===
            "fulfilled"
          ) {
            setHistory(
              extractHistory(
                historyResult.value
              )
            );
          } else {
            console.error(
              "History error:",
              historyResult.reason
            );
          }

          if (
            continueResult.status ===
            "fulfilled"
          ) {
            setContinueListening(
              extractContinue(
                continueResult.value
              )
            );
          } else {
            console.error(
              "Continue listening error:",
              continueResult.reason
            );
          }

          if (
            historyResult.status ===
              "rejected" &&
            continueResult.status ===
              "rejected"
          ) {
            setToast({
              open: true,
              type: "error",
              title:
                "Could not load History",
              message:
                "Your listening activity could not be loaded right now.",
            });
          }

          setLoading(false);
        };

      load();

      return () => {
        active =
          false;
      };
    }, []);

    const filters = [
      "All",
      "Today",
      "Yesterday",
      "This Week",
      "Older",
    ];

    const filteredHistory =
      useMemo(
        () => {
          if (
            activeFilter ===
            "All"
          ) {
            return history;
          }

          return history.filter(
            (
              item
            ) =>
              getDateGroup(
                item.playedAt
              ) ===
              activeFilter
          );
        },
        [
          history,
          activeFilter,
        ]
      );

    const completedCount =
      useMemo(
        () =>
          history.filter(
            (
              item
            ) =>
              Boolean(
                item.completed
              )
          ).length,
        [
          history,
        ]
      );

    const todayCount =
      useMemo(
        () =>
          history.filter(
            (
              item
            ) =>
              getDateGroup(
                item.playedAt
              ) ===
              "Today"
          ).length,
        [
          history,
        ]
      );

    const normalizeForPlayer =
      (
        item
      ) => ({
        ...item,

        id:
          getTrackId(
            item
          ),

        title:
          getTitle(
            item
          ),

        subtitle:
          getArtist(
            item
          ),

        coverArt:
          getArtwork(
            item
          ),

        fileUrl:
          getFileUrl(
            item
          ),

        duration:
          Number(
            item?.duration ||
            item?.track
              ?.duration ||
            0
          ),

        genre:
          item?.genre ||
          item?.track
            ?.genre ||
          "Audio",
      });

    const playHistory =
      async (
        item
      ) => {
        const id =
          getTrackId(
            item
          );

        if (!id) {
          return;
        }

        if (
          currentTrack?.id ===
          id
        ) {
          togglePlay();

          return;
        }

        try {
          setPlayingId(id);

          if (
            getFileUrl(
              item
            )
          ) {
            playTrack(
              normalizeForPlayer(
                item
              )
            );

            return;
          }

          const response =
            await audioService.getById(
              id
            );

          const track =
            response?.data;

          if (track) {
            playTrack({
              ...track,

              id:
                track.id ||
                track._id,

              subtitle:
                track.artistName ||
                (
                  typeof track.artist ===
                  "object"
                    ? track.artist
                        ?.displayName ||
                      track.artist
                        ?.username
                    : track.artist
                ) ||
                "Echoo Audio",
            });
          } else {
            playTrack(
              normalizeForPlayer(
                item
              )
            );
          }
        } catch (
          error
        ) {
          console.error(
            "History playback error:",
            error
          );

          playTrack(
            normalizeForPlayer(
              item
            )
          );
        } finally {
          setPlayingId(
            null
          );
        }
      };

    const playContinue =
      (
        item
      ) => {
        const id =
          getTrackId(
            item
          );

        if (
          id &&
          currentTrack?.id ===
            id
        ) {
          togglePlay();

          return;
        }

        playTrack(
          normalizeForPlayer(
            item
          ),
          continueListening.map(
            normalizeForPlayer
          )
        );
      };

    if (loading) {
      return (
        <div className="figma-history-page">
          <div className="figma-history-loading-title" />
          <div className="figma-history-loading-subtitle" />

          <div className="figma-history-loading-list">
            {Array.from({
              length: 6,
            }).map(
              (
                _,
                index
              ) => (
                <span
                  key={
                    index
                  }
                />
              )
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="figma-history-page">
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

        <header className="figma-history-header">
          <div>
            <h1>
              Listening History
            </h1>

            <p>
              Everything you've
              listened to on Echoo,
              in the order you
              played it.
            </p>
          </div>

          <div className="figma-history-header-icon">
            <FaHistory />
          </div>
        </header>

        <section className="figma-history-summary">
          <article>
            <div>
              <FaHistory />
            </div>

            <span>
              <strong>
                {
                  history.length
                }
              </strong>

              <small>
                Total plays
              </small>
            </span>
          </article>

          <article>
            <div>
              <FaCheck />
            </div>

            <span>
              <strong>
                {
                  completedCount
                }
              </strong>

              <small>
                Completed
              </small>
            </span>
          </article>

          <article>
            <div>
              <FaRedoAlt />
            </div>

            <span>
              <strong>
                {
                  continueListening.length
                }
              </strong>

              <small>
                Continue listening
              </small>
            </span>
          </article>

          <article>
            <div>
              <FaPlay />
            </div>

            <span>
              <strong>
                {
                  todayCount
                }
              </strong>

              <small>
                Played today
              </small>
            </span>
          </article>
        </section>

        {continueListening.length >
          0 && (
          <section className="figma-history-section">
            <div className="figma-history-section-heading">
              <div>
                <h2>
                  Continue Listening
                </h2>

                <p>
                  Pick up where you
                  stopped.
                </p>
              </div>

              <span>
                {
                  continueListening.length
                }{" "}
                items
              </span>
            </div>

            <HorizontalDragRail
              ariaLabel="Continue listening"
              className="figma-history-continue-rail"
            >
              {continueListening.map(
                (
                  item,
                  index
                ) => {
                  const progress =
                    progressPercent(
                      item
                    );

                  const id =
                    getTrackId(
                      item
                    );

                  const playing =
                    id &&
                    currentTrack?.id ===
                      id &&
                    isPlaying;

                  return (
                    <article
                      className="figma-history-continue-card"
                      key={
                        id ||
                        index
                      }
                    >
                      <div
                        className={`figma-history-continue-art variant-${
                          (index %
                            4) +
                          1
                        }`}
                      >
                        <HistoryArtwork
                          item={
                            item
                          }
                        />

                        <button
                          type="button"
                          onClick={() =>
                            playContinue(
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
                      </div>

                      <h3>
                        {getTitle(
                          item
                        )}
                      </h3>

                      <p>
                        {getArtist(
                          item
                        )}
                      </p>

                      <div className="figma-history-continue-progress">
                        <div>
                          <span
                            style={{
                              width:
                                `${progress}%`,
                            }}
                          />
                        </div>

                        <small>
                          {Math.round(
                            progress
                          )}
                          %
                        </small>
                      </div>
                    </article>
                  );
                }
              )}
            </HorizontalDragRail>
          </section>
        )}

        <section className="figma-history-section history-list-section">
          <div className="figma-history-section-heading">
            <div>
              <h2>
                History
              </h2>

              <p>
                Your listening
                activity in
                chronological order.
              </p>
            </div>

            <span>
              {
                filteredHistory.length
              }{" "}
              items
            </span>
          </div>

          <div className="figma-history-filters">
            {filters.map(
              (
                filter
              ) => (
                <button
                  type="button"
                  key={
                    filter
                  }
                  className={
                    activeFilter ===
                    filter
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setActiveFilter(
                      filter
                    )
                  }
                >
                  {filter}
                </button>
              )
            )}
          </div>

          {filteredHistory.length ===
          0 ? (
            <div className="figma-history-empty">
              <div>
                <FaHistory />
              </div>

              <h3>
                {history.length ===
                0
                  ? "No listening history yet"
                  : `Nothing from ${activeFilter.toLowerCase()}`}
              </h3>

              <p>
                {history.length ===
                0
                  ? "Play something on Echoo and your listening activity will appear here."
                  : "Choose another time period to see more activity."}
              </p>
            </div>
          ) : (
            <div className="figma-history-list">
              {filteredHistory.map(
                (
                  item,
                  index
                ) => {
                  const id =
                    getTrackId(
                      item
                    ) ||
                    index;

                  const progress =
                    progressPercent(
                      item
                    );

                  const playing =
                    currentTrack?.id ===
                      getTrackId(
                        item
                      ) &&
                    isPlaying;

                  return (
                    <article
                      className="figma-history-row"
                      key={`${id}-${index}`}
                    >
                      <div
                        className={`figma-history-row-art variant-${
                          (index %
                            4) +
                          1
                        }`}
                      >
                        <HistoryArtwork
                          item={
                            item
                          }
                        />
                      </div>

                      <div className="figma-history-row-copy">
                        <h3>
                          {getTitle(
                            item
                          )}
                        </h3>

                        <p>
                          {getArtist(
                            item
                          )}
                        </p>

                        <span className="figma-history-mobile-date">
                          {formatDate(
                            item.playedAt
                          )}{" "}
                          •{" "}
                          {formatClock(
                            item.playedAt
                          )}
                        </span>
                      </div>

                      <div className="figma-history-date">
                        <strong>
                          {formatDate(
                            item.playedAt
                          )}
                        </strong>

                        <span>
                          {formatClock(
                            item.playedAt
                          )}
                        </span>
                      </div>

                      <div className="figma-history-progress-block">
                        <div className="figma-history-progress-label">
                          <span>
                            {item.completed
                              ? "Completed"
                              : `${Math.round(
                                  progress
                                )}% played`}
                          </span>
                        </div>

                        <div className="figma-history-progress">
                          <span
                            style={{
                              width:
                                `${progress}%`,
                            }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        className="figma-history-row-play"
                        disabled={
                          playingId ===
                          getTrackId(
                            item
                          )
                        }
                        onClick={() =>
                          playHistory(
                            item
                          )
                        }
                      >
                        {playing ? (
                          <FaPause />
                        ) : item.completed ? (
                          <FaRedoAlt />
                        ) : (
                          <FaPlay />
                        )}
                      </button>
                    </article>
                  );
                }
              )}
            </div>
          )}
        </section>
      </div>
    );
  };

export default ListenerHistory;
