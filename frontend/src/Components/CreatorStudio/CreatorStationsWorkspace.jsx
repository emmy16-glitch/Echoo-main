import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaBroadcastTower,
  FaPlus,
  FaSave,
  FaTrash,
  FaUpload,
} from "react-icons/fa";

import EchoSignal from "../EchooSystem/EchoSignal";

import batch2Service from "../../services/batch2Service";

import {
  getMockMediaForKey,
} from "../../services/mockMediaService.js";

import "./CreatorPhase9.css";
import "./CreatorBatch2.css";

const LOCAL_KEY =
  "echoo-creator-station-drafts-v1";

const CATEGORIES = [
  "Faith & Spirituality",
  "Education",
  "News & Politics",
  "Business",
  "Health & Wellness",
  "Entertainment",
  "Technology",
  "Sports",
  "Music",
  "Comedy",
  "Storytelling",
  "Other",
];

const readLocalDrafts =
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
        ? data
        : [];
    } catch {
      return [];
    }
  };

const CreatorStationsWorkspace = ({
  studioName =
    "Creator",
}) => {
  const [
    stations,
    setStations,
  ] = useState([]);

  const [
    localDrafts,
    setLocalDrafts,
  ] = useState(
    readLocalDrafts
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    formOpen,
    setFormOpen,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    deletingId,
    setDeletingId,
  ] = useState(null);

  const [
    importing,
    setImporting,
  ] = useState(false);

  const [
    name,
    setName,
  ] = useState("");

  const [
    category,
    setCategory,
  ] = useState(
    "Other"
  );

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    tags,
    setTags,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const loadStations =
    useCallback(
      async () => {
        try {
          setLoading(
            true
          );

          setError(
            ""
          );

          const response =
            await batch2Service
              .getMyStations();

          setStations(
            Array.isArray(
              response?.data
            )
              ? response.data
              : []
          );
        } catch (
          loadError
        ) {
          console.error(
            "Creator stations:",
            loadError
          );

          setError(
            loadError?.message ||
            "Could not load your stations."
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
    loadStations();
  }, [loadStations]);

  const sorted =
    useMemo(
      () =>
        [...stations].sort(
          (
            first,
            second
          ) =>
            new Date(
              second.updatedAt ||
              second.createdAt ||
              0
            ) -
            new Date(
              first.updatedAt ||
              first.createdAt ||
              0
            )
        ),
      [
        stations,
      ]
    );

  const resetForm =
    () => {
      setName("");
      setCategory(
        "Other"
      );
      setDescription("");
      setTags("");
      setFormOpen(
        false
      );
    };

  const saveStation =
    async (
      event
    ) => {
      event.preventDefault();

      if (
        !name.trim() ||
        saving
      ) {
        return;
      }

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

        const response =
          await batch2Service
            .createStation({
              name:
                name.trim(),

              category,

              description:
                description.trim(),

              tags:
                tags
                  .split(",")
                  .map(
                    (
                      item
                    ) =>
                      item.trim()
                  )
                  .filter(Boolean),
            });

        if (
          response?.data
        ) {
          setStations(
            (
              current
            ) => [
              response.data,
              ...current,
            ]
          );
        }

        setMessage(
          `${name.trim()} is now a real Echoo station.`
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
          "Could not create the station."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  const removeStation =
    async (
      station
    ) => {
      if (
        !station?.id ||
        deletingId
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete "${station.name}"?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setDeletingId(
          station.id
        );

        setError(
          ""
        );

        await batch2Service
          .deleteStation(
            station.id
          );

        setStations(
          (
            current
          ) =>
            current.filter(
              (
                item
              ) =>
                item.id !==
                station.id
            )
        );

        setMessage(
          `${station.name} was deleted.`
        );
      } catch (
        deleteError
      ) {
        setError(
          deleteError?.message ||
          "Could not delete the station."
        );
      } finally {
        setDeletingId(
          null
        );
      }
    };

  const importDrafts =
    async () => {
      if (
        !localDrafts.length ||
        importing
      ) {
        return;
      }

      setImporting(
        true
      );

      setError(
        ""
      );

      setMessage(
        ""
      );

      const remaining =
        [];

      let imported =
        0;

      for (
        const draft of
        localDrafts
      ) {
        const draftName =
          draft?.name ||
          draft?.title ||
          "";

        if (
          !draftName.trim()
        ) {
          remaining.push(
            draft
          );

          continue;
        }

        try {
          await batch2Service
            .createStation({
              name:
                draftName.trim(),

              description:
                draft.description ||
                "",

              category:
                CATEGORIES.includes(
                  draft.category
                )
                  ? draft.category
                  : "Other",

              tags:
                Array.isArray(
                  draft.tags
                )
                  ? draft.tags
                  : [],
            });

          imported +=
            1;
        } catch {
          remaining.push(
            draft
          );
        }
      }

      localStorage.setItem(
        LOCAL_KEY,
        JSON.stringify(
          remaining
        )
      );

      setLocalDrafts(
        remaining
      );

      setImporting(
        false
      );

      await loadStations();

      if (
        imported
      ) {
        setMessage(
          `${imported} local station ${
            imported === 1
              ? "draft was"
              : "drafts were"
          } moved to the backend.`
        );
      }

      if (
        remaining.length
      ) {
        setError(
          `${remaining.length} local ${
            remaining.length === 1
              ? "draft could"
              : "drafts could"
          } not be imported. They were kept safely in this browser.`
        );
      }
    };

  return (
    <section className="creator-b2-page">
      <header className="creator-b2-header">
        <div>
          <span className="creator-b2-kicker">
            REAL STATIONS
          </span>

          <h1>
            Your Echoo stations.
          </h1>

          <p>
            Create and manage the
            stations owned by{" "}
            {studioName}. New stations
            are now stored by the
            backend instead of only in
            this browser.
          </p>
        </div>

        <EchoSignal
          size="lg"
          state={
            stations.some(
              (
                station
              ) =>
                station.isLive
            )
              ? "live"
              : "idle"
          }
          activeNodes={
            stations.some(
              (
                station
              ) =>
                station.isLive
            )
              ? 3
              : 0
          }
        >
          <FaBroadcastTower />
        </EchoSignal>
      </header>

      <div className="creator-b2-toolbar">
        <div>
          <strong>
            {
              stations.length
            }{" "}
            {stations.length ===
            1
              ? "station"
              : "stations"}
          </strong>

          <span>
            Backend connected
          </span>
        </div>

        <button
          type="button"
          className="creator-b2-primary"
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
          New station
        </button>
      </div>

      {localDrafts.length >
        0 && (
        <div className="creator-b2-notice">
          <div>
            <strong>
              {
                localDrafts.length
              }{" "}
              old local{" "}
              {localDrafts.length ===
              1
                ? "draft"
                : "drafts"}{" "}
              found
            </strong>

            <span>
              They have not been
              deleted. You can safely
              move them to the new
              Station API.
            </span>
          </div>

          <button
            type="button"
            onClick={
              importDrafts
            }
            disabled={
              importing
            }
          >
            <FaUpload />

            {importing
              ? "Importing..."
              : "Import drafts"}
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

      {formOpen && (
        <form
          className="creator-b2-form"
          onSubmit={
            saveStation
          }
        >
          <div className="creator-b2-form-heading">
            <div>
              <h2>
                Create a station
              </h2>

              <p>
                This creates a real
                station in Echoo's
                backend.
              </p>
            </div>
          </div>

          <div className="creator-b2-form-grid">
            <label>
              Station name

              <input
                value={
                  name
                }
                maxLength={
                  100
                }
                placeholder="e.g. Faith Talk Radio"
                onChange={(
                  event
                ) =>
                  setName(
                    event.target
                      .value
                  )
                }
                required
              />
            </label>

            <label>
              Category

              <select
                value={
                  category
                }
                onChange={(
                  event
                ) =>
                  setCategory(
                    event.target
                      .value
                  )
                }
              >
                {CATEGORIES.map(
                  (
                    item
                  ) => (
                    <option
                      key={
                        item
                      }
                      value={
                        item
                      }
                    >
                      {item}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="creator-b2-wide">
              Description

              <textarea
                value={
                  description
                }
                maxLength={
                  2000
                }
                placeholder="What should listeners know about this station?"
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

            <label className="creator-b2-wide">
              Tags

              <input
                value={
                  tags
                }
                placeholder="faith, teaching, inspiration"
                onChange={(
                  event
                ) =>
                  setTags(
                    event.target
                      .value
                  )
                }
              />

              <small>
                Separate tags with
                commas.
              </small>
            </label>
          </div>

          <div className="creator-b2-form-actions">
            <button
              type="button"
              onClick={
                resetForm
              }
              disabled={
                saving
              }
            >
              Cancel
            </button>

            <button
              type="submit"
              className="creator-b2-primary"
              disabled={
                saving ||
                !name.trim()
              }
            >
              <FaSave />

              {saving
                ? "Creating..."
                : "Create station"}
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
            Loading your stations...
          </strong>
        </div>
      ) : sorted.length ===
        0 ? (
        <div className="creator-b2-state">
          <FaBroadcastTower />

          <strong>
            No backend stations yet
          </strong>

          <p>
            Create your first station
            to begin scheduling
            broadcasts.
          </p>
        </div>
      ) : (
        <div className="creator-b2-grid">
          {sorted.map(
            (
              station
            ) => {
              const artwork =
                station.coverArt ||
                getMockMediaForKey(
                  station.id ||
                    station.name,
                  "stations"
                );

              return (
                <article
                  className="creator-b2-card"
                  key={
                    station.id
                  }
                >
                  <div className="creator-b2-art">
                    {artwork ? (
                      <img
                        src={
                          artwork
                        }
                        alt=""
                      />
                    ) : (
                      <FaBroadcastTower />
                    )}

                    {station.isLive && (
                      <span className="creator-b2-live">
                        LIVE
                      </span>
                    )}
                  </div>

                  <div className="creator-b2-card-body">
                    <div className="creator-b2-card-top">
                      <span>
                        {
                          station.category
                        }
                      </span>

                      <small>
                        Public
                      </small>
                    </div>

                    <h2>
                      {
                        station.name
                      }
                    </h2>

                    <p>
                      {station.description ||
                        "No description yet."}
                    </p>

                    <div className="creator-b2-stats">
                      <span>
                        <strong>
                          {
                            station.listenerCount
                          }
                        </strong>
                        listening
                      </span>

                      <span>
                        <strong>
                          {
                            station.followerCount
                          }
                        </strong>
                        followers
                      </span>
                    </div>

                    <div className="creator-b2-card-actions">
                      <span>
                        {station.isLive
                          ? "Station marked live"
                          : "Station ready"}
                      </span>

                      <button
                        type="button"
                        className="danger"
                        disabled={
                          deletingId ===
                          station.id
                        }
                        onClick={() =>
                          removeStation(
                            station
                          )
                        }
                        aria-label={`Delete ${station.name}`}
                      >
                        <FaTrash />

                        {deletingId ===
                        station.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            }
          )}
        </div>
      )}
    </section>
  );
};

export default CreatorStationsWorkspace;
