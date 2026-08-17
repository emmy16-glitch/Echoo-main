import React, {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  FaArrowLeft,
  FaBroadcastTower,
  FaCheck,
  FaHeadphones,
  FaPlay,
} from "react-icons/fa";

import batch3Service from "../../services/batch3Service";

import {
  getMockMediaForKey,
} from "../../services/mockMediaService.js";

import "../../styles/echoo-batch3.css";

const FOLLOW_KEY =
  "echoo-batch3-station-following-v1";

const readFollowing =
  () => {
    try {
      const value =
        JSON.parse(
          localStorage.getItem(
            FOLLOW_KEY
          ) || "[]"
        );

      return Array.isArray(
        value
      )
        ? value
        : [];
    } catch {
      return [];
    }
  };

const ListenerRealStationProfile =
  () => {
    const {
      stationId,
    } =
      useParams();

    const navigate =
      useNavigate();

    const [
      station,
      setStation,
    ] = useState(null);

    const [
      live,
      setLive,
    ] = useState(null);

    const [
      upcoming,
      setUpcoming,
    ] = useState([]);

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      legacy,
      setLegacy,
    ] = useState(false);

    const [
      following,
      setFollowing,
    ] = useState(
      () =>
        readFollowing()
          .some(
            (
              id
            ) =>
              String(
                id
              ) ===
              String(
                stationId
              )
          )
    );

    useEffect(() => {
      let active =
        true;

      const load =
        async () => {
          try {
            setLoading(
              true
            );

            const stationResult =
              await batch3Service
                .getStation(
                  stationId
                );

            if (
              !active ||
              !stationResult?.data
            ) {
              return;
            }

            setStation(
              stationResult.data
            );

            const [
              liveResult,
              upcomingResult,
            ] =
              await Promise.allSettled([
                batch3Service
                  .getLiveBroadcastForStation(
                    stationId
                  ),

                batch3Service
                  .getUpcomingForStation(
                    stationId
                  ),
              ]);

            if (
              liveResult.status ===
                "fulfilled"
            ) {
              setLive(
                liveResult.value
                  ?.data ||
                null
              );
            }

            if (
              upcomingResult.status ===
                "fulfilled"
            ) {
              setUpcoming(
                Array.isArray(
                  upcomingResult.value
                    ?.data
                )
                  ? upcomingResult.value.data
                  : []
              );
            }
          } catch {
            if (
              active
            ) {
              setLegacy(
                true
              );
            }
          } finally {
            if (
              active
            ) {
              setLoading(
                false
              );
            }
          }
        };

      load();

      return () => {
        active =
          false;
      };
    }, [
      stationId,
    ]);

    const toggle =
      () => {
        const current =
          readFollowing();

        const exists =
          current.some(
            (
              id
            ) =>
              String(
                id
              ) ===
              String(
                stationId
              )
          );

        const next =
          exists
            ? current.filter(
                (
                  id
                ) =>
                  String(
                    id
                  ) !==
                  String(
                    stationId
                  )
              )
            : [
                ...current,
                stationId,
              ];

        localStorage.setItem(
          FOLLOW_KEY,
          JSON.stringify(
            next
          )
        );

        setFollowing(
          !exists
        );
      };

    if (
      legacy
    ) {
      return (
        <div className="b3-listener-page">
          <button
            type="button"
            className="b3-back"
            onClick={() =>
              navigate(
                "/listen/stations"
              )
            }
          >
            <FaArrowLeft />
            Stations
          </button>

          <div className="echoo-cleanup-state">
            <strong>
              Station unavailable.
            </strong>

            <span>
              This station could not be loaded from Echoo.
            </span>
          </div>
        </div>
      );
    }

    if (
      loading
    ) {
      return (
        <div className="b3-listener-page">
          <div className="b3-big-empty">
            Loading station...
          </div>
        </div>
      );
    }

    if (
      !station
    ) {
      return (
        <div className="b3-listener-page">
          <button
            type="button"
            className="b3-back"
            onClick={() =>
              navigate(
                "/listen/stations"
              )
            }
          >
            <FaArrowLeft />
            Stations
          </button>

          <div className="echoo-cleanup-state">
            <strong>
              Station unavailable.
            </strong>

            <span>
              This station could not be loaded from Echoo.
            </span>
          </div>
        </div>
      );
    }

    const artwork =
      station.coverArt ||
      getMockMediaForKey(
        station.id ||
          station.name,
        "stations"
      );

    const creatorUsername =
      station.owner
        ?.username ||
      "";

    return (
      <div className="b3-listener-page">
        <button
          type="button"
          className="b3-back"
          onClick={() =>
            navigate(
              "/listen/stations"
            )
          }
        >
          <FaArrowLeft />
          Stations
        </button>

        <section className="b3-station-profile">
          <div className="b3-profile-art">
            {artwork ? (
              <img
                src={
                  artwork
                }
                alt=""
              />
            ) : (
              <FaHeadphones />
            )}

            {station.isLive && (
              <span className="b3-live-pill">
                LIVE
              </span>
            )}
          </div>

          <div className="b3-profile-copy">
            <span className="b3-kicker">
              {
                station.category
              }
            </span>

            <h1>
              {
                station.name
              }
            </h1>

            <p>
              {station.description ||
                "An Echoo station."}
            </p>

            <div className="b3-profile-metrics">
              <span>
                <strong>
                  {
                    station.followerCount
                  }
                </strong>
                followers
              </span>

              <span>
                <strong>
                  {
                    station.listenerCount
                  }
                </strong>
                listening
              </span>
            </div>

            <div className="b3-profile-actions">
              <button
                type="button"
                onClick={
                  toggle
                }
              >
                {following ? (
                  <>
                    <FaCheck />
                    Following
                  </>
                ) : (
                  "Follow station"
                )}
              </button>

              {creatorUsername && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/listen/creator/${creatorUsername}`
                    )
                  }
                >
                  View creator
                </button>
              )}

              {live?.id && (
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    navigate(
                      `/listen/live/${live.id}`
                    )
                  }
                >
                  <FaPlay />
                  Listen Live
                </button>
              )}
            </div>
          </div>
        </section>

        {live?.id && (
          <section className="b3-section">
            <div className="b3-section-title">
              <h2>
                Live now
              </h2>
            </div>

            <article className="b3-profile-live">
              <FaBroadcastTower />

              <div>
                <strong>
                  {
                    live.title
                  }
                </strong>

                <span>
                  {
                    live.listenerCount
                  }{" "}
                  listening
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/listen/live/${live.id}`
                  )
                }
              >
                Join
              </button>
            </article>
          </section>
        )}

        <section className="b3-section">
          <div className="b3-section-title">
            <h2>
              Upcoming broadcasts
            </h2>
          </div>

          {upcoming.length ===
          0 ? (
            <div className="b3-small-empty">
              Nothing scheduled yet.
            </div>
          ) : (
            <div className="b3-upcoming-list">
              {upcoming.map(
                (
                  item
                ) => (
                  <article
                    key={
                      item.id
                    }
                  >
                    <div>
                      <strong>
                        {
                          item.title
                        }
                      </strong>

                      <span>
                        Scheduled
                      </span>
                    </div>

                    <time>
                      {new Date(
                        item.startTime
                      ).toLocaleString()}
                    </time>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/listen/live/${item.id}`
                        )
                      }
                    >
                      View
                    </button>
                  </article>
                )
              )}
            </div>
          )}
        </section>
      </div>
    );
  };

export default ListenerRealStationProfile;
