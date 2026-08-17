import React, {
  useState,
} from "react";

import {
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";

import {
  FaArrowLeft,
  FaBroadcastTower,
  FaCheck,
  FaClock,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaShareAlt,
  FaUsers,
} from "react-icons/fa";

import {
  compactNumber,
  getCreator,
  getStation,
  getStationLive,
  mockSocial,
} from "../../services/listenerMockService";

import HorizontalDragRail from "../FigmaUI/HorizontalDragRail";

import "./ListenerStationProfile.css";

const getArtwork = (
  item
) =>
  item?.artwork ||
  item?.coverArt ||
  item?.image ||
  item?.thumbnail ||
  null;

const StationProfileArtwork = ({
  station,
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  const source =
    getArtwork(
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
    <div className="figma-station-profile-fallback">
      <FaHeadphones />
    </div>
  );
};

const TrackCard = ({
  item,
  queue,
  currentTrack,
  isPlaying,
  playTrack,
  togglePlay,
  variant,
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  const artwork =
    getArtwork(
      item
    );

  const active =
    currentTrack?.id ===
      item.id &&
    isPlaying;

  const play =
    () => {
      if (
        currentTrack?.id ===
        item.id
      ) {
        togglePlay();

        return;
      }

      playTrack(
        item,
        queue
      );
    };

  return (
    <article className="figma-station-track-card">
      <div
        className={`figma-station-track-art variant-${variant}`}
      >
        {artwork &&
        !failed ? (
          <img
            src={artwork}
            alt=""
            draggable="false"
            onError={() =>
              setFailed(true)
            }
          />
        ) : (
          <div className="figma-station-track-fallback">
            <FaHeadphones />
          </div>
        )}

        <button
          type="button"
          onClick={play}
        >
          {active ? (
            <FaPause />
          ) : (
            <FaPlay />
          )}
        </button>
      </div>

      <h3>
        {item.title}
      </h3>

      <p>
        {item.subtitle ||
          item.genre}
      </p>
    </article>
  );
};

const ListenerStationProfile =
  () => {
    const {
      stationId,
    } =
      useParams();

    const navigate =
      useNavigate();

    const {
      playTrack,
      currentTrack,
      isPlaying,
      togglePlay,
    } =
      useOutletContext();

    const station =
      getStation(
        stationId
      );

    const creator =
      station
        ? getCreator(
            station.creatorId
          )
        : null;

    const live =
      station
        ? getStationLive(
            station.id
          )
        : null;

    const [
      following,
      setFollowing,
    ] = useState(
      station
        ? mockSocial.isFollowingStation(
            station.id
          )
        : false
    );

    const [
      shareMessage,
      setShareMessage,
    ] = useState("");

    if (!station) {
      return (
        <div className="figma-station-profile-page">
          <div className="figma-station-profile-empty">
            <div>
              <FaHeadphones />
            </div>

            <h1>
              Station not found
            </h1>

            <p>
              This station is not
              available.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/stations"
                )
              }
            >
              Back to Stations
            </button>
          </div>
        </div>
      );
    }

    const latest =
      station.latestAudio ||
      [];

    const replays =
      station.replays ||
      [];

    const shareStation =
      async () => {
        const data = {
          title:
            station.name,

          text:
            `Listen to ${station.name} on Echoo`,

          url:
            window.location
              .href,
        };

        try {
          if (
            navigator.share
          ) {
            await navigator.share(
              data
            );

            setShareMessage(
              "Shared"
            );

            return;
          }

          if (
            navigator.clipboard
          ) {
            await navigator.clipboard.writeText(
              window.location
                .href
            );

            setShareMessage(
              "Link copied"
            );

            window.setTimeout(
              () =>
                setShareMessage(
                  ""
                ),
              1800
            );
          }
        } catch {
          setShareMessage(
            ""
          );
        }
      };

    const playCollection =
      (
        collection
      ) => {
        const first =
          collection?.[0];

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
          collection
        );
      };

    return (
      <div className="figma-station-profile-page">
        <div className="figma-station-profile-top">
          <button
            type="button"
            className="figma-station-profile-back"
            onClick={() =>
              navigate(
                "/listen/stations"
              )
            }
          >
            <FaArrowLeft />
            Stations
          </button>

          <button
            type="button"
            className="figma-station-profile-share"
            onClick={
              shareStation
            }
          >
            <FaShareAlt />

            {shareMessage ||
              "Share"}
          </button>
        </div>

        <section className="figma-station-profile-hero">
          <div className="figma-station-profile-art">
            <StationProfileArtwork
              station={
                station
              }
            />

            {live && (
              <span className="figma-station-profile-live-dot">
                <i />
                LIVE
              </span>
            )}
          </div>

          <div className="figma-station-profile-copy">
            <span className="figma-station-profile-type">
              STATION
            </span>

            <h1>
              {
                station.name
              }
            </h1>

            <p className="figma-station-profile-category">
              {
                station.category
              }
            </p>

            {creator && (
              <button
                type="button"
                className="figma-station-creator-link"
                onClick={() =>
                  navigate(
                    `/listen/creator/${creator.id}`
                  )
                }
              >
                by{" "}
                {
                  creator.name
                }
              </button>
            )}

            <div className="figma-station-profile-actions">
              <button
                type="button"
                className={`figma-station-profile-follow ${
                  following
                    ? "following"
                    : ""
                }`}
                onClick={() =>
                  setFollowing(
                    mockSocial.toggleStation(
                      station.id
                    )
                  )
                }
              >
                {following ? (
                  <>
                    <FaCheck />
                    Following
                  </>
                ) : (
                  <>
                    +
                    Follow Station
                  </>
                )}
              </button>

              {latest.length >
                0 && (
                <button
                  type="button"
                  className="figma-station-profile-play"
                  onClick={() =>
                    playCollection(
                      latest
                    )
                  }
                >
                  {currentTrack?.id ===
                    latest[0]
                      ?.id &&
                  isPlaying ? (
                    <FaPause />
                  ) : (
                    <FaPlay />
                  )}

                  {currentTrack?.id ===
                    latest[0]
                      ?.id &&
                  isPlaying
                    ? "Pause"
                    : "Play Station"}
                </button>
              )}
            </div>
          </div>

          <div className="figma-station-profile-stats">
            <article>
              <strong>
                {compactNumber(
                  station.followers +
                    (following
                      ? 1
                      : 0)
                )}
              </strong>

              <span>
                Followers
              </span>
            </article>

            <article>
              <strong>
                {
                  station.audioCount
                }
              </strong>

              <span>
                Audio
              </span>
            </article>

            <article>
              <strong>
                {
                  station.broadcastCount
                }
              </strong>

              <span>
                Broadcasts
              </span>
            </article>
          </div>
        </section>

        <section className="figma-station-profile-about">
          <h2>
            About this station
          </h2>

          <p>
            {
              station.description
            }
          </p>
        </section>

        {live && (
          <section className="figma-station-profile-section">
            <div className="figma-station-profile-section-heading">
              <div>
                <h2>
                  Live Now
                </h2>

                <p>
                  This station is
                  broadcasting
                  now.
                </p>
              </div>
            </div>

            <article
              className="figma-station-profile-live-card"
              onClick={() =>
                navigate(
                  `/listen/live/${live.id}`
                )
              }
            >
              <div className="figma-station-profile-live-art">
                <FaBroadcastTower />

                <span>
                  <i />
                  LIVE
                </span>
              </div>

              <div className="figma-station-profile-live-copy">
                <small>
                  LIVE NOW
                </small>

                <h3>
                  {
                    live.title
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
                    live.listenerCount ||
                      0
                  )}{" "}
                  listening
                </span>
              </div>

              <button
                type="button"
                onClick={(
                  event
                ) => {
                  event.stopPropagation();

                  navigate(
                    `/listen/live/${live.id}`
                  );
                }}
              >
                <FaPlay />
                Listen Live
              </button>
            </article>
          </section>
        )}

        <section className="figma-station-profile-section">
          <div className="figma-station-profile-section-heading">
            <div>
              <h2>
                Latest Audio
              </h2>

              <p>
                Recent audio from{" "}
                {
                  station.name
                }.
              </p>
            </div>
          </div>

          {latest.length >
          0 ? (
            <HorizontalDragRail
              ariaLabel="Latest station audio"
              className="figma-station-profile-track-rail"
            >
              {latest.map(
                (
                  item,
                  index
                ) => (
                  <TrackCard
                    key={
                      item.id
                    }
                    item={
                      item
                    }
                    queue={
                      latest
                    }
                    variant={
                      (index %
                        4) +
                      1
                    }
                    currentTrack={
                      currentTrack
                    }
                    isPlaying={
                      isPlaying
                    }
                    playTrack={
                      playTrack
                    }
                    togglePlay={
                      togglePlay
                    }
                  />
                )
              )}
            </HorizontalDragRail>
          ) : (
            <div className="figma-station-profile-no-content">
              No audio yet.
            </div>
          )}
        </section>

        <section className="figma-station-profile-section">
          <div className="figma-station-profile-section-heading">
            <div>
              <h2>
                Replays
              </h2>

              <p>
                Listen again to
                completed
                broadcasts.
              </p>
            </div>
          </div>

          {replays.length >
          0 ? (
            <HorizontalDragRail
              ariaLabel="Station replays"
              className="figma-station-profile-track-rail"
            >
              {replays.map(
                (
                  item,
                  index
                ) => (
                  <TrackCard
                    key={
                      item.id
                    }
                    item={
                      item
                    }
                    queue={
                      replays
                    }
                    variant={
                      ((index +
                        2) %
                        4) +
                      1
                    }
                    currentTrack={
                      currentTrack
                    }
                    isPlaying={
                      isPlaying
                    }
                    playTrack={
                      playTrack
                    }
                    togglePlay={
                      togglePlay
                    }
                  />
                )
              )}
            </HorizontalDragRail>
          ) : (
            <div className="figma-station-profile-no-content">
              No replays yet.
            </div>
          )}
        </section>

        <section className="figma-station-profile-section schedule">
          <div className="figma-station-profile-section-heading">
            <div>
              <h2>
                Schedule
              </h2>

              <p>
                Upcoming programmes
                from this station.
              </p>
            </div>
          </div>

          <div className="figma-station-schedule">
            {(station.schedule ||
              []).map(
              (
                item
              ) => (
                <article
                  key={
                    item.id
                  }
                >
                  <div className="figma-station-schedule-icon">
                    <FaClock />
                  </div>

                  <div>
                    <strong>
                      {
                        item.title
                      }
                    </strong>

                    <span>
                      {
                        item.day
                      }
                    </span>
                  </div>

                  <time>
                    {
                      item.time
                    }
                  </time>
                </article>
              )
            )}
          </div>
        </section>
      </div>
    );
  };

export default ListenerStationProfile;
