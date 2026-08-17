import React, {
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useOutletContext,
} from "react-router-dom";

import {
  FaBroadcastTower,
  FaCheck,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaSearch,
  FaUsers,
} from "react-icons/fa";

import {
  compactNumber,
  getStationLive,
  mockSocial,
  mockStations,
} from "../../services/listenerMockService";

import HorizontalDragRail from "../FigmaUI/HorizontalDragRail";

import "./ListenerStations.css";

const getStationArtwork = (
  station
) =>
  station?.artwork ||
  station?.coverArt ||
  station?.image ||
  station?.avatar ||
  null;

const getInitials = (
  name
) =>
  String(
    name || "Echoo"
  )
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) =>
      word
        .charAt(0)
        .toUpperCase()
    )
    .join("");

const StationImage = ({
  station,
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  const source =
    getStationArtwork(
      station
    );

  if (
    source &&
    !failed
  ) {
    return (
      <img
        src={source}
        alt=""
        draggable="false"
        onError={() =>
          setFailed(true)
        }
      />
    );
  }

  return (
    <div className="figma-station-fallback">
      <FaHeadphones />

      <strong>
        {getInitials(
          station.name
        )}
      </strong>
    </div>
  );
};

const ListenerStations =
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
      query,
      setQuery,
    ] = useState("");

    const [
      category,
      setCategory,
    ] = useState(
      "All"
    );

    const [
      version,
      setVersion,
    ] = useState(0);

    const stations =
      useMemo(
        () =>
          mockStations.map(
            (
              station,
              index
            ) => ({
              ...station,

              live:
                getStationLive(
                  station.id
                ),

              following:
                mockSocial.isFollowingStation(
                  station.id
                ),

              variant:
                (index %
                  5) +
                1,
            })
          ),
        [version]
      );

    const categories =
      useMemo(
        () => [
          "All",
          ...Array.from(
            new Set(
              mockStations.map(
                (
                  station
                ) =>
                  station.category
              )
            )
          ),
        ],
        []
      );

    const filteredStations =
      useMemo(
        () => {
          const text =
            query
              .trim()
              .toLowerCase();

          return stations.filter(
            (
              station
            ) => {
              const matchesQuery =
                !text ||
                station.name
                  .toLowerCase()
                  .includes(
                    text
                  ) ||
                station.category
                  .toLowerCase()
                  .includes(
                    text
                  ) ||
                station.description
                  .toLowerCase()
                  .includes(
                    text
                  );

              const matchesCategory =
                category ===
                  "All" ||
                station.category ===
                  category;

              return (
                matchesQuery &&
                matchesCategory
              );
            }
          );
        },
        [
          stations,
          query,
          category,
        ]
      );

    const liveStations =
      useMemo(
        () =>
          filteredStations.filter(
            (
              station
            ) =>
              Boolean(
                station.live
              )
          ),
        [
          filteredStations,
        ]
      );

    const followingStations =
      useMemo(
        () =>
          stations.filter(
            (
              station
            ) =>
              station.following
          ),
        [
          stations,
        ]
      );

    const toggleFollow =
      (
        event,
        station
      ) => {
        event.stopPropagation();

        mockSocial.toggleStation(
          station.id
        );

        setVersion(
          (
            current
          ) =>
            current + 1
        );
      };

    const stationFirstTrack =
      (
        station
      ) =>
        station.latestAudio?.[0] ||
        station.replays?.[0] ||
        null;

    const isStationPlaying =
      (
        station
      ) => {
        const track =
          stationFirstTrack(
            station
          );

        return (
          track &&
          currentTrack?.id ===
            track.id &&
          isPlaying
        );
      };

    const playStation =
      (
        event,
        station
      ) => {
        event.stopPropagation();

        const queue = [
          ...(station.latestAudio ||
            []),
          ...(station.replays ||
            []),
        ];

        const first =
          queue[0];

        if (!first) {
          return;
        }

        if (
          currentTrack?.id ===
          first.id
        ) {
          togglePlay();

          return;
        }

        playTrack(
          first,
          queue
        );
      };

    const openStation =
      (
        station
      ) =>
        navigate(
          `/listen/stations/${station.id}`
        );

    return (
      <div className="figma-stations-page">
        <header className="figma-stations-header">
          <div>
            <h1>
              Stations
            </h1>

            <p>
              Discover stations,
              creators and live
              audio across Echoo.
            </p>
          </div>

          <div className="figma-stations-count">
            <span>
              {
                stations.length
              }
            </span>

            <small>
              stations
            </small>
          </div>
        </header>

        <div className="figma-stations-toolbar">
          <label className="figma-stations-search">
            <FaSearch />

            <input
              type="search"
              placeholder="Search stations..."
              value={query}
              onChange={(
                event
              ) =>
                setQuery(
                  event.target
                    .value
                )
              }
            />
          </label>

          <div className="figma-stations-categories">
            {categories.map(
              (
                item
              ) => (
                <button
                  type="button"
                  key={item}
                  className={
                    item ===
                    category
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setCategory(
                      item
                    )
                  }
                >
                  {item}
                </button>
              )
            )}
          </div>
        </div>

        {liveStations.length >
          0 && (
          <section className="figma-stations-section">
            <div className="figma-stations-section-heading">
              <div>
                <h2>
                  Live Stations
                </h2>

                <p>
                  Stations
                  broadcasting
                  right now.
                </p>
              </div>

              <span className="figma-section-live-label">
                <i />
                LIVE
              </span>
            </div>

            <HorizontalDragRail
              ariaLabel="Live stations"
              className="figma-live-stations-rail"
            >
              {liveStations.map(
                (
                  station
                ) => (
                  <article
                    key={
                      station.id
                    }
                    className={`figma-live-station-card variant-${station.variant}`}
                    onClick={() =>
                      navigate(
                        `/listen/live/${station.live.id}`
                      )
                    }
                  >
                    <div className="figma-live-station-art">
                      <StationImage
                        station={
                          station
                        }
                      />

                      <span className="figma-station-live-badge">
                        <i />
                        LIVE
                      </span>

                      <button
                        type="button"
                        className="figma-station-live-play"
                        onClick={(
                          event
                        ) => {
                          event.stopPropagation();

                          navigate(
                            `/listen/live/${station.live.id}`
                          );
                        }}
                      >
                        <FaPlay />
                      </button>
                    </div>

                    <div className="figma-live-station-copy">
                      <div className="figma-station-mini-logo">
                        <FaBroadcastTower />
                      </div>

                      <div>
                        <h3>
                          {
                            station.live
                              .title
                          }
                        </h3>

                        <p>
                          {
                            station.name
                          }
                        </p>

                        <span>
                          <FaUsers />

                          {compactNumber(
                            station.live
                              .listenerCount ||
                              0
                          )}{" "}
                          listening
                        </span>
                      </div>
                    </div>
                  </article>
                )
              )}
            </HorizontalDragRail>
          </section>
        )}

        <section className="figma-stations-section">
          <div className="figma-stations-section-heading">
            <div>
              <h2>
                Discover Stations
              </h2>

              <p>
                Click and drag
                horizontally to
                explore.
              </p>
            </div>

            <span className="figma-stations-result-count">
              {
                filteredStations.length
              }{" "}
              results
            </span>
          </div>

          {filteredStations.length >
          0 ? (
            <HorizontalDragRail
              ariaLabel="Discover stations"
              className="figma-station-discovery-rail"
            >
              {filteredStations.map(
                (
                  station
                ) => (
                  <button
                    type="button"
                    key={
                      station.id
                    }
                    className="figma-station-card"
                    onClick={() =>
                      openStation(
                        station
                      )
                    }
                  >
                    <div
                      className={`figma-station-circle station-${station.variant}`}
                    >
                      <StationImage
                        station={
                          station
                        }
                      />

                      {station.live && (
                        <span className="figma-station-circle-live">
                          LIVE
                        </span>
                      )}

                      <button
                        type="button"
                        className="figma-station-circle-play"
                        aria-label={`Play ${station.name}`}
                        onClick={(
                          event
                        ) =>
                          playStation(
                            event,
                            station
                          )
                        }
                      >
                        {isStationPlaying(
                          station
                        ) ? (
                          <FaPause />
                        ) : (
                          <FaPlay />
                        )}
                      </button>
                    </div>

                    <h3>
                      {
                        station.name
                      }
                    </h3>

                    <p>
                      {
                        station.category
                      }
                    </p>

                    <div className="figma-station-card-meta">
                      <span>
                        {compactNumber(
                          station.followers
                        )}{" "}
                        followers
                      </span>

                      <span>
                        {
                          station.audioCount
                        }{" "}
                        audio
                      </span>
                    </div>

                    <button
                      type="button"
                      className={`figma-station-follow ${
                        station.following
                          ? "following"
                          : ""
                      }`}
                      onClick={(
                        event
                      ) =>
                        toggleFollow(
                          event,
                          station
                        )
                      }
                    >
                      {station.following ? (
                        <>
                          <FaCheck />
                          Following
                        </>
                      ) : (
                        <>
                          +
                          Follow
                        </>
                      )}
                    </button>
                  </button>
                )
              )}
            </HorizontalDragRail>
          ) : (
            <div className="figma-stations-empty">
              <div>
                <FaSearch />
              </div>

              <h2>
                No matching
                stations
              </h2>

              <p>
                Try another
                station name or
                category.
              </p>

              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory(
                    "All"
                  );
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        {followingStations.length >
          0 && (
          <section className="figma-stations-section">
            <div className="figma-stations-section-heading">
              <div>
                <h2>
                  Stations You Follow
                </h2>

                <p>
                  Quickly return
                  to your favourite
                  stations.
                </p>
              </div>
            </div>

            <HorizontalDragRail
              ariaLabel="Stations you follow"
              className="figma-following-stations-rail"
            >
              {followingStations.map(
                (
                  station
                ) => (
                  <article
                    key={
                      station.id
                    }
                    className="figma-followed-station"
                    onClick={() =>
                      openStation(
                        station
                      )
                    }
                  >
                    <div
                      className={`figma-followed-station-art station-${station.variant}`}
                    >
                      <StationImage
                        station={
                          station
                        }
                      />
                    </div>

                    <div>
                      <h3>
                        {
                          station.name
                        }
                      </h3>

                      <p>
                        {
                          station.category
                        }
                      </p>

                      <span>
                        {compactNumber(
                          station.followers
                        )}{" "}
                        followers
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(
                        event
                      ) =>
                        playStation(
                          event,
                          station
                        )
                      }
                    >
                      {isStationPlaying(
                        station
                      ) ? (
                        <FaPause />
                      ) : (
                        <FaPlay />
                      )}
                    </button>
                  </article>
                )
              )}
            </HorizontalDragRail>
          </section>
        )}
      </div>
    );
  };

export default ListenerStations;
