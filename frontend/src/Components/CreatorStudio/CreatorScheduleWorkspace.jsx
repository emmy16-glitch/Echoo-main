import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaClock,
  FaPlus,
  FaSave,
  FaTimesCircle,
  FaTrash,
} from "react-icons/fa";

import EchoSignal from "../EchooSystem/EchoSignal";

import batch2Service from "../../services/batch2Service";

import "./CreatorPhase9.css";
import "./CreatorBatch2.css";

const LOCAL_KEY =
  "echoo-creator-schedule-drafts-v1";

const readLocalDraftCount =
  () => {
    try {
      const data =
        JSON.parse(
          localStorage.getItem(
            LOCAL_KEY
          ) || "[]"
        );

      return Array.isArray(
        data
      )
        ? data.length
        : 0;
    } catch {
      return 0;
    }
  };

const formatDateTime = (
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

        year:
          "numeric",

        hour:
          "numeric",

        minute:
          "2-digit",
      }
    );
};

const CreatorScheduleWorkspace = ({
  onNavigate,
}) => {
  const [
    stations,
    setStations,
  ] = useState([]);

  const [
    broadcasts,
    setBroadcasts,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    actionId,
    setActionId,
  ] = useState(null);

  const [
    formOpen,
    setFormOpen,
  ] = useState(false);

  const [
    stationId,
    setStationId,
  ] = useState("");

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    date,
    setDate,
  ] = useState("");

  const [
    time,
    setTime,
  ] = useState("");

  const [
    duration,
    setDuration,
  ] = useState(
    "60"
  );

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const localDraftCount =
    useMemo(
      readLocalDraftCount,
      []
    );

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
            stationResult,
            broadcastResult,
          ] =
            await Promise.all([
              batch2Service
                .getMyStations(),

              batch2Service
                .getCreatorBroadcasts(),
            ]);

          const realStations =
            Array.isArray(
              stationResult?.data
            )
              ? stationResult.data
              : [];

          const realBroadcasts =
            Array.isArray(
              broadcastResult?.data
            )
              ? broadcastResult.data
              : [];

          setStations(
            realStations
          );

          setBroadcasts(
            realBroadcasts
          );

          setStationId(
            (
              current
            ) =>
              current ||
              realStations[0]
                ?.id ||
              ""
          );
        } catch (
          loadError
        ) {
          console.error(
            "Creator schedule:",
            loadError
          );

          setError(
            loadError?.message ||
            "Could not load your broadcast schedule."
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

  const ordered =
    useMemo(
      () =>
        [...broadcasts].sort(
          (
            first,
            second
          ) =>
            new Date(
              first.startTime ||
              0
            ) -
            new Date(
              second.startTime ||
              0
            )
        ),
      [
        broadcasts,
      ]
    );

  const resetForm =
    () => {
      setTitle("");
      setDate("");
      setTime("");
      setDuration(
        "60"
      );
      setDescription("");
      setFormOpen(
        false
      );
    };

  const createBroadcast =
    async (
      event
    ) => {
      event.preventDefault();

      if (
        !stationId ||
        !title.trim() ||
        !date ||
        !time ||
        saving
      ) {
        return;
      }

      const start =
        new Date(
          `${date}T${time}:00`
        );

      const minutes =
        Math.max(
          15,
          Number(
            duration
          ) || 60
        );

      if (
        Number.isNaN(
          start.getTime()
        )
      ) {
        setError(
          "Choose a valid broadcast date and time."
        );

        return;
      }

      const end =
        new Date(
          start.getTime() +
          minutes *
            60 *
            1000
        );

      try {
        setSaving(
          true
        );

        setError(
          ""
        );

        setMessage(
          ""
        );

        const station =
          stations.find(
            (
              item
            ) =>
              item.id ===
              stationId
          );

        const response =
          await batch2Service
            .createBroadcast({
              title:
                title.trim(),

              description:
                description.trim(),

              stationId,

              startTime:
                start.toISOString(),

              endTime:
                end.toISOString(),

              type:
                "live",

              isRecurring:
                false,

              isPublic:
                true,

              tags: [],

              coverArt:
                station
                  ?.coverArt ||
                null,
            });

        if (
          response?.data
        ) {
          setBroadcasts(
            (
              current
            ) => [
              ...current,
              response.data,
            ]
          );
        }

        setMessage(
          `${title.trim()} is scheduled in the backend.`
        );

        resetForm();
      } catch (
        saveError
      ) {
        console.error(
          saveError
        );

        setError(
          saveError?.message ||
          "Could not schedule the broadcast."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  const cancelBroadcast =
    async (
      broadcast
    ) => {
      if (
        !broadcast?.id ||
        actionId
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Cancel "${broadcast.title}"?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setActionId(
          broadcast.id
        );

        setError(
          ""
        );

        await batch2Service
          .cancelBroadcast(
            broadcast.id
          );

        setBroadcasts(
          (
            current
          ) =>
            current.filter(
              (
                item
              ) =>
                item.id !==
                broadcast.id
            )
        );

        setMessage(
          `${broadcast.title} was cancelled.`
        );
      } catch (
        cancelError
      ) {
        setError(
          cancelError?.message ||
          "Could not cancel the broadcast."
        );
      } finally {
        setActionId(
          null
        );
      }
    };

  const deleteBroadcast =
    async (
      broadcast
    ) => {
      if (
        !broadcast?.id ||
        actionId
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete "${broadcast.title}"?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setActionId(
          broadcast.id
        );

        setError(
          ""
        );

        await batch2Service
          .deleteBroadcast(
            broadcast.id
          );

        setBroadcasts(
          (
            current
          ) =>
            current.filter(
              (
                item
              ) =>
                item.id !==
                broadcast.id
            )
        );

        setMessage(
          `${broadcast.title} was deleted.`
        );
      } catch (
        deleteError
      ) {
        setError(
          deleteError?.message ||
          "Could not delete the broadcast."
        );
      } finally {
        setActionId(
          null
        );
      }
    };

  return (
    <section className="creator-b2-page">
      <header className="creator-b2-header">
        <div>
          <span className="creator-b2-kicker">
            REAL SCHEDULE
          </span>

          <h1>
            Schedule a broadcast.
          </h1>

          <p>
            Upcoming broadcasts are
            now created against a real
            Echoo station and persisted
            by the backend.
          </p>
        </div>

        <EchoSignal
          size="lg"
          state={
            broadcasts.some(
              (
                item
              ) =>
                item.status ===
                "live"
            )
              ? "live"
              : "idle"
          }
          activeNodes={
            broadcasts.some(
              (
                item
              ) =>
                item.status ===
                "live"
            )
              ? 3
              : 0
          }
        >
          <FaCalendarAlt />
        </EchoSignal>
      </header>

      <div className="creator-b2-toolbar">
        <div>
          <strong>
            {
              ordered.length
            }{" "}
            scheduled/live{" "}
            {ordered.length ===
            1
              ? "broadcast"
              : "broadcasts"}
          </strong>

          <span>
            Server-authoritative
            schedule
          </span>
        </div>

        <button
          type="button"
          className="creator-b2-primary"
          disabled={
            !stations.length
          }
          onClick={() =>
            setFormOpen(
              (
                current
              ) =>
                !current
            )
          }
        >
          <FaPlus />
          Schedule broadcast
        </button>
      </div>

      {localDraftCount >
        0 && (
        <div className="creator-b2-notice">
          <div>
            <strong>
              {
                localDraftCount
              }{" "}
              old browser{" "}
              {localDraftCount ===
              1
                ? "draft is"
                : "drafts are"}{" "}
              still preserved
            </strong>

            <span>
              They were not deleted
              automatically because a
              real backend station must
              be selected before a
              broadcast can be created.
            </span>
          </div>
        </div>
      )}

      {!loading &&
        stations.length ===
          0 && (
        <div className="creator-b2-notice important">
          <div>
            <strong>
              Create a station first
            </strong>

            <span>
              The backend requires every
              broadcast to belong to a
              station you own.
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              onNavigate?.(
                "Stations"
              )
            }
          >
            Open Stations
          </button>
        </div>
      )}

      {message && (
        <div className="creator-b2-message success">
          {message}
        </div>
      )}

      {error && (
        <div className="creator-b2-message error">
          {error}
        </div>
      )}

      {formOpen &&
        stations.length >
          0 && (
        <form
          className="creator-b2-form"
          onSubmit={
            createBroadcast
          }
        >
          <div className="creator-b2-form-heading">
            <div>
              <h2>
                New scheduled
                broadcast
              </h2>

              <p>
                Echoo will store the
                exact start and end
                times in the backend.
              </p>
            </div>
          </div>

          <div className="creator-b2-form-grid">
            <label>
              Station

              <select
                value={
                  stationId
                }
                onChange={(
                  event
                ) =>
                  setStationId(
                    event.target
                      .value
                  )
                }
                required
              >
                {stations.map(
                  (
                    station
                  ) => (
                    <option
                      key={
                        station.id
                      }
                      value={
                        station.id
                      }
                    >
                      {
                        station.name
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              Broadcast title

              <input
                value={
                  title
                }
                maxLength={
                  200
                }
                placeholder="e.g. Sunday Worship"
                onChange={(
                  event
                ) =>
                  setTitle(
                    event.target
                      .value
                  )
                }
                required
              />
            </label>

            <label>
              Date

              <input
                type="date"
                value={
                  date
                }
                onChange={(
                  event
                ) =>
                  setDate(
                    event.target
                      .value
                  )
                }
                required
              />
            </label>

            <label>
              Start time

              <input
                type="time"
                value={
                  time
                }
                onChange={(
                  event
                ) =>
                  setTime(
                    event.target
                      .value
                  )
                }
                required
              />
            </label>

            <label>
              Duration

              <select
                value={
                  duration
                }
                onChange={(
                  event
                ) =>
                  setDuration(
                    event.target
                      .value
                  )
                }
              >
                <option value="30">
                  30 minutes
                </option>

                <option value="45">
                  45 minutes
                </option>

                <option value="60">
                  1 hour
                </option>

                <option value="90">
                  1 hour 30 minutes
                </option>

                <option value="120">
                  2 hours
                </option>
              </select>
            </label>

            <div className="creator-b2-readonly">
              <span>
                Broadcast type
              </span>

              <strong>
                Live event
              </strong>

              <small>
                Prerecorded source
                linking is not exposed
                until its backend media
                source is complete.
              </small>
            </div>

            <label className="creator-b2-wide">
              Description

              <textarea
                value={
                  description
                }
                maxLength={
                  2000
                }
                placeholder="What is this broadcast about?"
                onChange={(
                  event
                ) =>
                  setDescription(
                    event.target
                      .value
                  )
                }
              />
            </label>
          </div>

          <div className="creator-b2-form-actions">
            <button
              type="button"
              disabled={
                saving
              }
              onClick={
                resetForm
              }
            >
              Cancel
            </button>

            <button
              type="submit"
              className="creator-b2-primary"
              disabled={
                saving ||
                !stationId ||
                !title.trim() ||
                !date ||
                !time
              }
            >
              <FaSave />

              {saving
                ? "Scheduling..."
                : "Schedule broadcast"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="creator-b2-state">
          <EchoSignal
            size="md"
            state="active"
            activeNodes={2}
          />

          <strong>
            Loading schedule...
          </strong>
        </div>
      ) : ordered.length ===
        0 ? (
        <div className="creator-b2-state">
          <FaClock />

          <strong>
            Nothing scheduled yet
          </strong>

          <p>
            Your first real scheduled
            broadcast will appear here.
          </p>
        </div>
      ) : (
        <div className="creator-b2-schedule-list">
          {ordered.map(
            (
              broadcast
            ) => (
              <article
                className="creator-b2-schedule-item"
                key={
                  broadcast.id
                }
              >
                <div className="creator-b2-time-block">
                  <FaCalendarAlt />

                  <span>
                    {formatDateTime(
                      broadcast.startTime
                    )}
                  </span>
                </div>

                <div className="creator-b2-schedule-main">
                  <div>
                    <span
                      className={`creator-b2-status ${broadcast.status}`}
                    >
                      {
                        broadcast.status
                      }
                    </span>

                    <span>
                      {
                        broadcast.stationName
                      }
                    </span>
                  </div>

                  <h2>
                    {
                      broadcast.title
                    }
                  </h2>

                  <p>
                    {broadcast.description ||
                      "No description."}
                  </p>
                </div>

                <div className="creator-b2-schedule-meta">
                  <span>
                    <FaClock />

                    {broadcast.duration
                      ? `${broadcast.duration} min`
                      : "Duration set by server"}
                  </span>

                  <span>
                    <FaBroadcastTower />

                    {broadcast.listenerCount}{" "}
                    listening
                  </span>
                </div>

                <div className="creator-b2-schedule-actions">
                  {broadcast.status ===
                    "scheduled" && (
                    <button
                      type="button"
                      disabled={
                        actionId ===
                        broadcast.id
                      }
                      onClick={() =>
                        cancelBroadcast(
                          broadcast
                        )
                      }
                    >
                      <FaTimesCircle />
                      Cancel
                    </button>
                  )}

                  <button
                    type="button"
                    className="danger"
                    disabled={
                      actionId ===
                      broadcast.id
                    }
                    onClick={() =>
                      deleteBroadcast(
                        broadcast
                      )
                    }
                  >
                    <FaTrash />
                    Delete
                  </button>
                </div>
              </article>
            )
          )}
        </div>
      )}

      <div className="creator-b2-boundary">
        <strong>
          What Batch 2 does not fake
        </strong>

        <p>
          A scheduled broadcast is now
          real backend data. Actual
          microphone streaming and the
          Start/End Broadcast lifecycle
          are intentionally left for
          the next integration batch.
        </p>
      </div>
    </section>
  );
};

export default CreatorScheduleWorkspace;
