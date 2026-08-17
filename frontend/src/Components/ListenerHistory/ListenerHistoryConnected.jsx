import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaCheckCircle,
  FaClock,
  FaHistory,
  FaSyncAlt,
  FaTrash,
} from "react-icons/fa";

import LegacyListenerHistory from "./ListenerHistory";

import batch6Service from "../../services/batch6Service";

import "../../styles/echoo-batch6.css";

const formatMinutes = (
  seconds
) => {
  const totalSeconds =
    Number(seconds) || 0;

  return Math.round(
    totalSeconds / 60
  );
};

const ListenerHistoryConnected =
  () => {
    const [
      version,
      setVersion,
    ] = useState(0);

    const [
      items,
      setItems,
    ] = useState([]);

    const [
      stats,
      setStats,
    ] = useState({
      totalPlays: 0,
      completedItems: 0,
      completionRate: 0,
      totalListeningTime: 0,
    });

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      manageOpen,
      setManageOpen,
    ] = useState(false);

    const [
      busyId,
      setBusyId,
    ] = useState(null);

    const [
      message,
      setMessage,
    ] = useState("");

    const [
      error,
      setError,
    ] = useState("");

    const load =
      useCallback(
        async () => {
          try {
            setLoading(
              true
            );

            setError(
              ""
            );

            const [
              historyResult,
              statsResult,
            ] =
              await Promise.all([
                batch6Service
                  .getHistory({
                    page: 1,
                    limit: 100,
                    type: "all",
                    sort: "recent",
                  }),

                batch6Service
                  .getHistoryStats(),
              ]);

            setItems(
              Array.isArray(
                historyResult
                  ?.data
                  ?.history
              )
                ? historyResult.data.history
                : []
            );

            setStats({
              totalPlays:
                Number(
                  statsResult
                    ?.data
                    ?.totalPlays
                ) || 0,

              completedItems:
                Number(
                  statsResult
                    ?.data
                    ?.completedItems
                ) || 0,

              completionRate:
                Number(
                  statsResult
                    ?.data
                    ?.completionRate
                ) || 0,

              totalListeningTime:
                Number(
                  statsResult
                    ?.data
                    ?.totalListeningTime
                ) || 0,
            });
          } catch (
            loadError
          ) {
            console.error(
              "Backend History:",
              loadError
            );

            setError(
              loadError?.message ||
              "Could not load backend history."
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

    const recent =
      useMemo(
        () =>
          items.slice(
            0,
            8
          ),
        [
          items,
        ]
      );

    const remove =
      async (
        item
      ) => {
        if (
          !item?.id ||
          busyId
        ) {
          return;
        }

        try {
          setBusyId(
            item.id
          );

          setMessage(
            ""
          );

          setError(
            ""
          );

          await batch6Service
            .removeHistoryItem(
              item.id
            );

          setMessage(
            "History item removed."
          );

          await load();

          setVersion(
            (
              current
            ) =>
              current + 1
          );
        } catch (
          removeError
        ) {
          setError(
            removeError?.message ||
            "Could not remove history item."
          );
        } finally {
          setBusyId(
            null
          );
        }
      };

    const clear =
      async () => {
        if (
          busyId
        ) {
          return;
        }

        const confirmed =
          window.confirm(
            "Clear your entire Echoo listening history?"
          );

        if (
          !confirmed
        ) {
          return;
        }

        try {
          setBusyId(
            "clear"
          );

          setMessage(
            ""
          );

          setError(
            ""
          );

          await batch6Service
            .clearHistory();

          setMessage(
            "Listening history cleared."
          );

          await load();

          setVersion(
            (
              current
            ) =>
              current + 1
          );
        } catch (
          clearError
        ) {
          setError(
            clearError?.message ||
            "Could not clear listening history."
          );
        } finally {
          setBusyId(
            null
          );
        }
      };

    return (
      <div className="b6-history-wrap">
        <section className="b6-history-control">
          <div className="b6-history-control-head">
            <div>
              <span className="b6-kicker">
                BACKEND HISTORY
              </span>

              <strong>
                Listening activity
                is now
                server-authoritative.
              </strong>

              <small>
                Player progress still
                powers listening
                activity; this page now
                reads and manages the
                dedicated History API.
              </small>
            </div>

            <div className="b6-control-actions">
              <button
                type="button"
                onClick={() =>
                  setManageOpen(
                    (
                      current
                    ) =>
                      !current
                  )
                }
              >
                <FaHistory />
                Manage
              </button>

              <button
                type="button"
                onClick={
                  load
                }
                disabled={
                  loading
                }
              >
                <FaSyncAlt />
                Refresh
              </button>

              <button
                type="button"
                className="danger"
                onClick={
                  clear
                }
                disabled={
                  busyId ===
                    "clear" ||
                  stats.totalPlays ===
                    0
                }
              >
                <FaTrash />
                Clear all
              </button>
            </div>
          </div>

          <div className="b6-history-stats">
            <article>
              <FaHistory />

              <div>
                <strong>
                  {
                    stats.totalPlays
                  }
                </strong>

                <span>
                  plays
                </span>
              </div>
            </article>

            <article>
              <FaCheckCircle />

              <div>
                <strong>
                  {
                    stats.completedItems
                  }
                </strong>

                <span>
                  completed
                </span>
              </div>
            </article>

            <article>
              <FaCheckCircle />

              <div>
                <strong>
                  {
                    stats.completionRate
                  }%
                </strong>

                <span>
                  completion rate
                </span>
              </div>
            </article>

            <article>
              <FaClock />

              <div>
                <strong>
                  {formatMinutes(
                    stats.totalListeningTime
                  )}
                </strong>

                <span>
                  minutes
                </span>
              </div>
            </article>
          </div>

          {message && (
            <div className="b6-alert success">
              {message}
            </div>
          )}

          {error && (
            <div className="b6-alert error">
              {error}
            </div>
          )}

          {manageOpen && (
            <div className="b6-history-manager">
              <header>
                <strong>
                  Recent history
                </strong>

                <span>
                  Remove individual
                  backend records.
                </span>
              </header>

              {recent.length ===
              0 ? (
                <div className="b6-manager-empty">
                  No history to
                  manage.
                </div>
              ) : (
                recent.map(
                  (
                    item
                  ) => (
                    <div
                      key={
                        item.id
                      }
                      className="b6-history-manage-row"
                    >
                      <div>
                        <strong>
                          {item.track
                            ?.title ||
                            "Unavailable audio"}
                        </strong>

                        <span>
                          {item.playedAt
                            ? new Date(
                                item.playedAt
                              ).toLocaleString()
                            : "Unknown time"}
                        </span>
                      </div>

                      <button
                        type="button"
                        title="Remove history item"
                        disabled={
                          busyId ===
                          item.id
                        }
                        onClick={() =>
                          remove(
                            item
                          )
                        }
                      >
                        <FaTrash />
                      </button>
                    </div>
                  )
                )
              )}
            </div>
          )}
        </section>

        <LegacyListenerHistory
          key={
            version
          }
        />
      </div>
    );
  };

export default ListenerHistoryConnected;
