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
  FaCheck,
  FaHeadphones,
  FaPlay,
  FaSearch,
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

const ListenerStationsConnected =
  () => {
    const navigate =
      useNavigate();

    const [
      stations,
      setStations,
    ] = useState([]);

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      failed,
      setFailed,
    ] = useState(false);

    const [
      query,
      setQuery,
    ] = useState("");

    const [
      following,
      setFollowing,
    ] = useState(
      readFollowing
    );

    const load =
      useCallback(
        async () => {
          try {
            setLoading(
              true
            );

            setFailed(
              false
            );

            const response =
              await batch3Service
                .getStations();

            setStations(
              Array.isArray(
                response?.data
              )
                ? response.data
                : []
            );
          } catch (
            error
          ) {
            console.error(
              "Real stations:",
              error
            );

            setFailed(
              true
            );
          } finally {
            setLoading(
              false
            );
          }
        },
        []
      );

    useEffect(() => {
      load();
    }, [load]);

    const visible =
      useMemo(
        () => {
          const term =
            query
              .trim()
              .toLowerCase();

          if (!term) {
            return stations;
          }

          return stations.filter(
            (
              station
            ) =>
              station.name
                ?.toLowerCase()
                .includes(
                  term
                ) ||
              station.category
                ?.toLowerCase()
                .includes(
                  term
                ) ||
              station.description
                ?.toLowerCase()
                .includes(
                  term
                )
          );
        },
        [
          stations,
          query,
        ]
      );

    const toggleFollow =
      (
        stationId
      ) => {
        const exists =
          following.some(
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
            ? following.filter(
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
                ...following,
                stationId,
              ];

        setFollowing(
          next
        );

        localStorage.setItem(
          FOLLOW_KEY,
          JSON.stringify(
            next
          )
        );
      };

    const listenLive =
      async (
        station
      ) => {
        try {
          const response =
            await batch3Service
              .getLiveBroadcastForStation(
                station.id
              );

          if (
            response?.data?.id
          ) {
            navigate(
              `/listen/live/${response.data.id}`
            );

            return;
          }

          navigate(
            `/listen/stations/${station.id}`
          );
        } catch {
          navigate(
            `/listen/stations/${station.id}`
          );
        }
      };

    if (
      !loading &&
      failed
    ) {
      return (
        <div className="b3-listener-page">
          <div className="echoo-cleanup-state">
            <strong>
              Stations could not be loaded.
            </strong>

            <span>
              Echoo could not reach the Station service. No demo stations have been substituted.
            </span>

            <button
              type="button"
              onClick={load}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="b3-listener-page">
        <header className="b3-listener-header">
          <div>
            <span className="b3-kicker">
              STATIONS
            </span>

            <h1>
              Voices with a home.
            </h1>

            <p>
              Real Echoo stations,
              directly from the
              backend.
            </p>
          </div>

          <div className="b3-search-box">
            <FaSearch />

            <input
              value={
                query
              }
              placeholder="Search stations"
              onChange={(
                event
              ) =>
                setQuery(
                  event.target
                    .value
                )
              }
            />
          </div>
        </header>

        {loading ? (
          <div className="b3-big-empty">
            Loading stations...
          </div>
        ) : (
          <div className="b3-station-grid">
            {visible.map(
              (
                station
              ) => {
                const isFollowing =
                  following.some(
                    (
                      id
                    ) =>
                      String(
                        id
                      ) ===
                      String(
                        station.id
                      )
                  );

                const artwork =
                  station.coverArt ||
                  getMockMediaForKey(
                    station.id ||
                      station.name,
                    "stations"
                  );

                return (
                  <article
                    className="b3-station-card"
                    key={
                      station.id
                    }
                  >
                    <button
                      type="button"
                      className="b3-station-art"
                      onClick={() =>
                        navigate(
                          `/listen/stations/${station.id}`
                        )
                      }
                    >
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
                    </button>

                    <div className="b3-station-body">
                      <span className="b3-card-label">
                        {
                          station.category
                        }
                      </span>

                      <h2>
                        {
                          station.name
                        }
                      </h2>

                      <p>
                        {station.description ||
                          "An Echoo station."}
                      </p>

                      <div className="b3-station-metrics">
                        <span>
                          {
                            station.listenerCount
                          }{" "}
                          listening
                        </span>

                        <span>
                          {
                            station.followerCount
                          }{" "}
                          followers
                        </span>
                      </div>

                      <div className="b3-card-actions">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/listen/stations/${station.id}`
                            )
                          }
                        >
                          View station
                        </button>

                        {station.isLive && (
                          <button
                            type="button"
                            className="primary"
                            onClick={() =>
                              listenLive(
                                station
                              )
                            }
                          >
                            <FaPlay />
                            Listen Live
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            toggleFollow(
                              station.id
                            )
                          }
                        >
                          {isFollowing ? (
                            <>
                              <FaCheck />
                              Following
                            </>
                          ) : (
                            "Follow"
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}

        {!loading &&
          visible.length ===
            0 && (
          <div className="b3-big-empty">
            {stations.length === 0
              ? "No public stations yet."
              : "No stations match your search."}
          </div>
        )}
      </div>
    );
  };

export default ListenerStationsConnected;
