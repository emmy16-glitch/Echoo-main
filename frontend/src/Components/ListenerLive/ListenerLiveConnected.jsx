import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  FaBroadcastTower,
  FaClock,
  FaPlay,
  FaSyncAlt,
  FaUsers,
} from "react-icons/fa";

import batch3Service from "../../services/batch3Service";

import {
  getMockMediaForKey,
} from "../../services/mockMediaService.js";

import "../../styles/echoo-batch3.css";

const formatStart = (
  value
) => {
  if (!value) {
    return "Time not set";
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
    return String(
      value
    );
  }

  return date
    .toLocaleString(
      [],
      {
        weekday:
          "short",
        day:
          "numeric",
        month:
          "short",
        hour:
          "numeric",
        minute:
          "2-digit",
      }
    );
};

const ListenerLiveConnected =
  () => {
    const navigate =
      useNavigate();

    const [
      live,
      setLive,
    ] = useState([]);

    const [
      scheduled,
      setScheduled,
    ] = useState([]);

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      refreshing,
      setRefreshing,
    ] = useState(false);

    const [
      failed,
      setFailed,
    ] = useState(false);

    const load =
      useCallback(
        async (
          refresh = false
        ) => {
          try {
            if (
              refresh
            ) {
              setRefreshing(
                true
              );
            } else {
              setLoading(
                true
              );
            }

            setFailed(
              false
            );

            const data =
              await batch3Service
                .getDiscovery();

            setLive(
              data.live
            );

            setScheduled(
              data.scheduled
            );
          } catch (
            error
          ) {
            console.error(
              "Real Live:",
              error
            );

            setFailed(
              true
            );
          } finally {
            setLoading(
              false
            );

            setRefreshing(
              false
            );
          }
        },
        []
      );

    useEffect(() => {
      load();
    }, [load]);

    const totalListeners =
      useMemo(
        () =>
          live.reduce(
            (
              total,
              item
            ) =>
              total +
              Number(
                item.listenerCount ||
                0
              ),
            0
          ),
        [
          live,
        ]
      );

    if (
      !loading &&
      failed
    ) {
      return (
        <div className="b3-listener-page">
          <div className="echoo-cleanup-state">
            <strong>
              Live discovery is unavailable.
            </strong>

            <span>
              Echoo could not load live broadcasts. No fake live activity has been substituted.
            </span>

            <button
              type="button"
              onClick={() =>
                load()
              }
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    

    const featured =
      live[0] ||
      null;

    return (
      <div className="b3-listener-page">
        <header className="b3-listener-header">
          <div>
            <span className="b3-kicker">
              LIVE NOW
            </span>

            <h1>
              Your world is talking.
            </h1>

            <p>
              {
                live.length
              }{" "}
              live{" "}
              {live.length ===
              1
                ? "conversation"
                : "conversations"}{" "}
              ·{" "}
              {
                totalListeners
              }{" "}
              listening
            </p>
          </div>

          <button
            type="button"
            className="b3-refresh"
            disabled={
              refreshing
            }
            onClick={() =>
              load(
                true
              )
            }
          >
            <FaSyncAlt />

            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </header>

        {loading ? (
          <div className="b3-big-empty">
            Checking who is live...
          </div>
        ) : (
          <>
            {featured && (
              <section className="b3-feature-live">
                <div className="b3-feature-copy">
                  <span className="b3-live-pill">
                    LIVE
                  </span>

                  <h2>
                    {
                      featured.title
                    }
                  </h2>

                  <p>
                    {
                      featured.stationName
                    }{" "}
                    ·{" "}
                    {
                      featured.category
                    }
                  </p>

                  <div className="b3-feature-stats">
                    <span>
                      <FaUsers />
                      {
                        featured.listenerCount
                      }{" "}
                      listening
                    </span>
                  </div>

                  <button
                    type="button"
                    className="b3-join"
                    onClick={() =>
                      navigate(
                        `/listen/live/${featured.id}`
                      )
                    }
                  >
                    <FaPlay />
                    Join live
                  </button>
                </div>

                <div className="b3-feature-art">
                  <img
                    src={
                      featured.coverArt ||
                      getMockMediaForKey(
                        featured.id ||
                          featured.title,
                        "broadcasts"
                      )
                    }
                    alt=""
                  />
                </div>
              </section>
            )}

            {live.length >
              1 && (
              <section className="b3-section">
                <div className="b3-section-title">
                  <h2>
                    Happening now
                  </h2>

                  <span>
                    {
                      live.length
                    }{" "}
                    live
                  </span>
                </div>

                <div className="b3-live-grid">
                  {live
                    .slice(
                      1
                    )
                    .map(
                      (
                        item
                      ) => (
                        <article
                          className="b3-live-card"
                          key={
                            item.id
                          }
                        >
                          <img
                            src={
                              item.coverArt ||
                              getMockMediaForKey(
                                item.id ||
                                  item.title,
                                "broadcasts"
                              )
                            }
                            alt=""
                          />

                          <div>
                            <span className="b3-live-pill">
                              LIVE
                            </span>

                            <h3>
                              {
                                item.title
                              }
                            </h3>

                            <p>
                              {
                                item.stationName
                              }
                            </p>

                            <small>
                              {
                                item.listenerCount
                              }{" "}
                              listening
                            </small>

                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/listen/live/${item.id}`
                                )
                              }
                            >
                              Join
                            </button>
                          </div>
                        </article>
                      )
                    )}
                </div>
              </section>
            )}

            <section className="b3-section">
              <div className="b3-section-title">
                <h2>
                  Starting soon
                </h2>

                <span>
                  {
                    scheduled.length
                  }{" "}
                  scheduled
                </span>
              </div>

              {scheduled.length ===
              0 ? (
                <div className="b3-small-empty">
                  No upcoming
                  broadcasts yet.
                </div>
              ) : (
                <div className="b3-upcoming-list">
                  {scheduled
                    .slice(
                      0,
                      12
                    )
                    .map(
                      (
                        item
                      ) => (
                        <article
                          key={
                            item.id
                          }
                        >
                          <div className="b3-upcoming-time">
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
                                item.stationName
                              }
                            </span>
                          </div>

                          <time>
                            {formatStart(
                              item.startTime
                            )}
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
          </>
        )}
      </div>
    );
  };

export default ListenerLiveConnected;
