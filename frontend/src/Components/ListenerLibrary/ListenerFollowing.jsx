import React, {
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  FaArrowLeft,
  FaBroadcastTower,
  FaCheck,
  FaHeadphones,
  FaHeart,
  FaUsers,
} from "react-icons/fa";

import {
  compactNumber,
  getCreatorLive,
  getStationLive,
  mockSocial,
} from "../../services/listenerMockService";

import HorizontalDragRail from "../FigmaUI/HorizontalDragRail";

import "./ListenerFollowing.css";

const getImage =
  (
    item
  ) =>
    item?.avatar ||
    item?.profileImage ||
    item?.artwork ||
    item?.image ||
    item?.coverArt ||
    null;

const IdentityImage = ({
  item,
  station = false,
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  const image =
    getImage(
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

  if (station) {
    return (
      <div className="figma-following-image-fallback station">
        <FaHeadphones />
      </div>
    );
  }

  return (
    <div className="figma-following-image-fallback">
      {item.initials ||
        String(
          item.name ||
          "EC"
        )
          .split(/\s+/)
          .slice(0, 2)
          .map(
            (
              word
            ) =>
              word
                .charAt(0)
                .toUpperCase()
          )
          .join("")}
    </div>
  );
};

const ListenerFollowing =
  () => {
    const navigate =
      useNavigate();

    const [
      tab,
      setTab,
    ] = useState(
      "All"
    );

    const [
      version,
      setVersion,
    ] = useState(0);

    const creators =
      useMemo(
        () =>
          mockSocial.getFollowingCreators(),
        [version]
      );

    const stations =
      useMemo(
        () =>
          mockSocial.getFollowingStations(),
        [version]
      );

    const liveCount =
      useMemo(
        () =>
          [
            ...creators.map(
              (
                creator
              ) =>
                getCreatorLive(
                  creator.id
                )
            ),

            ...stations.map(
              (
                station
              ) =>
                getStationLive(
                  station.id
                )
            ),
          ].filter(Boolean)
            .length,
        [
          creators,
          stations,
        ]
      );

    const empty =
      creators.length ===
        0 &&
      stations.length ===
        0;

    const unfollowCreator =
      (
        event,
        creator
      ) => {
        event.stopPropagation();

        mockSocial.toggleCreator(
          creator.id
        );

        setVersion(
          (
            value
          ) =>
            value + 1
        );
      };

    const unfollowStation =
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
            value
          ) =>
            value + 1
        );
      };

    return (
      <div className="figma-following-page">
        <button
          type="button"
          className="figma-following-back"
          onClick={() =>
            navigate(
              "/listen/library"
            )
          }
        >
          <FaArrowLeft />
          Library
        </button>

        <header className="figma-following-header">
          <div>
            <h1>
              Following
            </h1>

            <p>
              Creators and
              stations you want
              to keep up with.
            </p>
          </div>

          <div className="figma-following-summary">
            <article>
              <strong>
                {creators.length +
                  stations.length}
              </strong>

              <span>
                Following
              </span>
            </article>

            <article className="live">
              <strong>
                {
                  liveCount
                }
              </strong>

              <span>
                Live now
              </span>
            </article>
          </div>
        </header>

        <div className="figma-following-tabs">
          {[
            "All",
            "Creators",
            "Stations",
          ].map(
            (
              item
            ) => (
              <button
                type="button"
                key={
                  item
                }
                className={
                  tab ===
                  item
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setTab(
                    item
                  )
                }
              >
                {item}
              </button>
            )
          )}
        </div>

        {empty ? (
          <div className="figma-following-empty">
            <div>
              <FaHeart />
            </div>

            <h2>
              You're not
              following anyone
              yet
            </h2>

            <p>
              Follow creators
              from Live rooms or
              follow stations to
              see them here.
            </p>

            <div>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/listen/live"
                  )
                }
              >
                Discover Live
              </button>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  navigate(
                    "/listen/stations"
                  )
                }
              >
                Browse Stations
              </button>
            </div>
          </div>
        ) : (
          <>
            {(tab ===
              "All" ||
              tab ===
                "Creators") &&
              creators.length >
                0 && (
              <section className="figma-following-section">
                <div className="figma-following-section-heading">
                  <div>
                    <h2>
                      Creators
                    </h2>

                    <p>
                      Creators you
                      have chosen to
                      follow.
                    </p>
                  </div>

                  <span>
                    {
                      creators.length
                    }
                  </span>
                </div>

                <HorizontalDragRail
                  ariaLabel="Creators you follow"
                  className="figma-following-rail"
                >
                  {creators.map(
                    (
                      creator,
                      index
                    ) => {
                      const live =
                        getCreatorLive(
                          creator.id
                        );

                      return (
                        <article
                          key={
                            creator.id
                          }
                          className="figma-following-card"
                        >
                          <button
                            type="button"
                            className="figma-following-card-main"
                            onClick={() =>
                              navigate(
                                `/listen/creator/${creator.id}`
                              )
                            }
                          >
                            <div
                              className={`figma-following-avatar variant-${
                                (index %
                                  4) +
                                1
                              }`}
                            >
                              <IdentityImage
                                item={
                                  creator
                                }
                              />

                              {live && (
                                <span>
                                  LIVE
                                </span>
                              )}
                            </div>

                            <h3>
                              {
                                creator.name
                              }
                            </h3>

                            <p>
                              {
                                creator.category
                              }
                            </p>

                            <small>
                              {compactNumber(
                                creator.followers
                              )}{" "}
                              followers
                            </small>
                          </button>

                          {live && (
                            <button
                              type="button"
                              className="figma-following-live-button"
                              onClick={() =>
                                navigate(
                                  `/listen/live/${live.id}`
                                )
                              }
                            >
                              <FaBroadcastTower />
                              Live now
                            </button>
                          )}

                          <button
                            type="button"
                            className="figma-following-unfollow"
                            onClick={(
                              event
                            ) =>
                              unfollowCreator(
                                event,
                                creator
                              )
                            }
                          >
                            <FaCheck />
                            Following
                          </button>
                        </article>
                      );
                    }
                  )}
                </HorizontalDragRail>
              </section>
            )}

            {(tab ===
              "All" ||
              tab ===
                "Stations") &&
              stations.length >
                0 && (
              <section className="figma-following-section">
                <div className="figma-following-section-heading">
                  <div>
                    <h2>
                      Stations
                    </h2>

                    <p>
                      Stations you
                      want to hear
                      from again.
                    </p>
                  </div>

                  <span>
                    {
                      stations.length
                    }
                  </span>
                </div>

                <HorizontalDragRail
                  ariaLabel="Stations you follow"
                  className="figma-following-rail"
                >
                  {stations.map(
                    (
                      station,
                      index
                    ) => {
                      const live =
                        getStationLive(
                          station.id
                        );

                      return (
                        <article
                          key={
                            station.id
                          }
                          className="figma-following-card"
                        >
                          <button
                            type="button"
                            className="figma-following-card-main"
                            onClick={() =>
                              navigate(
                                `/listen/stations/${station.id}`
                              )
                            }
                          >
                            <div
                              className={`figma-following-avatar station variant-${
                                (index %
                                  4) +
                                1
                              }`}
                            >
                              <IdentityImage
                                item={
                                  station
                                }
                                station
                              />

                              {live && (
                                <span>
                                  LIVE
                                </span>
                              )}
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

                            <small>
                              {compactNumber(
                                station.followers
                              )}{" "}
                              followers
                            </small>
                          </button>

                          {live && (
                            <button
                              type="button"
                              className="figma-following-live-button"
                              onClick={() =>
                                navigate(
                                  `/listen/live/${live.id}`
                                )
                              }
                            >
                              <FaBroadcastTower />
                              Live now
                            </button>
                          )}

                          <button
                            type="button"
                            className="figma-following-unfollow"
                            onClick={(
                              event
                            ) =>
                              unfollowStation(
                                event,
                                station
                              )
                            }
                          >
                            <FaCheck />
                            Following
                          </button>
                        </article>
                      );
                    }
                  )}
                </HorizontalDragRail>
              </section>
            )}
          </>
        )}
      </div>
    );
  };

export default ListenerFollowing;
