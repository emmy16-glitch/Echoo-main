import React, {
  useMemo,
  useState,
} from "react";

import {
  FaCloudUploadAlt,
  FaGlobe,
  FaHeart,
  FaLock,
  FaPlay,
  FaSearch,
  FaTrash,
} from "react-icons/fa";

import EchoSignal from "../EchooSystem/EchoSignal";

import "./CreatorPhase9.css";

const formatNumber = (
  value
) =>
  new Intl.NumberFormat(
    "en-US"
  ).format(
    Number(value) || 0
  );

const formatDate = (
  value
) => {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
};

const getId = (
  track
) =>
  track?.id ||
  track?._id ||
  null;

const getArtwork = (
  track
) =>
  track?.coverArt ||
  track?.artwork ||
  track?.image ||
  track?.thumbnail ||
  null;

const CreatorContentWorkspace = ({
  tracks = [],
  loading = false,
  page = 1,
  pagination = {},
  deletingId = "",
  onUpload,
  onDelete,
  onPageChange,
}) => {
  const [
    search,
    setSearch,
  ] = useState("");

  const [
    visibility,
    setVisibility,
  ] = useState(
    "All"
  );

  const filtered =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return tracks.filter(
          (
            track
          ) => {
            const searchMatch =
              !query ||
              String(
                track.title ||
                ""
              )
                .toLowerCase()
                .includes(
                  query
                ) ||
              String(
                track.genre ||
                ""
              )
                .toLowerCase()
                .includes(
                  query
                );

            const visibilityMatch =
              visibility ===
              "All"
                ? true
                : visibility ===
                    "Public"
                  ? Boolean(
                      track.isPublic
                    )
                  : !track.isPublic;

            return (
              searchMatch &&
              visibilityMatch
            );
          }
        );
      },
      [
        tracks,
        search,
        visibility,
      ]
    );

  const totalPages =
    Number(
      pagination
        ?.totalPages
    ) || 1;

  return (
    <section className="creator9-page creator9-content">
      <header className="creator9-page-header">
        <div>
          <span className="creator9-kicker">
            CREATOR CONTENT
          </span>

          <h1>
            Your audio,
            in one place.
          </h1>

          <p>
            Manage the recordings
            you have actually
            published to Echoo.
          </p>
        </div>

        <button
          type="button"
          className="creator9-primary-button"
          onClick={
            onUpload
          }
        >
          <FaCloudUploadAlt />
          Upload audio
        </button>
      </header>

      <div className="creator9-content-toolbar">
        <label className="creator9-search">
          <FaSearch />

          <input
            type="search"
            value={
              search
            }
            placeholder="Search your audio"
            onChange={(
              event
            ) =>
              setSearch(
                event.target
                  .value
              )
            }
          />
        </label>

        <div className="creator9-filter-tabs">
          {[
            "All",
            "Public",
            "Private",
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
                  visibility ===
                  item
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setVisibility(
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

      {loading ? (
        <div className="creator9-row-loading">
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : filtered.length ===
        0 ? (
        <div className="creator9-empty">
          <EchoSignal
            size="lg"
            state="idle"
            activeNodes={0}
          />

          <h2>
            {tracks.length
              ? "No matching audio"
              : "Your studio is quiet"}
          </h2>

          <p>
            {tracks.length
              ? "Try another search or visibility filter."
              : "Upload your first audio and it will appear here."}
          </p>

          {!tracks.length && (
            <button
              type="button"
              onClick={
                onUpload
              }
            >
              <FaCloudUploadAlt />
              Upload audio
            </button>
          )}
        </div>
      ) : (
        <div className="creator9-content-list">
          {filtered.map(
            (
              track,
              index
            ) => {
              const id =
                getId(
                  track
                );

              const artwork =
                getArtwork(
                  track
                );

              return (
                <article
                  key={
                    id ||
                    index
                  }
                >
                  <div className="creator9-content-art">
                    {artwork ? (
                      <img
                        src={
                          artwork
                        }
                        alt=""
                        draggable="false"
                      />
                    ) : (
                      <span>
                        {String(
                          track.title ||
                          "E"
                        )
                          .charAt(
                            0
                          )
                          .toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="creator9-content-copy">
                    <strong>
                      {track.title ||
                        "Untitled Audio"}
                    </strong>

                    <span>
                      {track.genre ||
                        "Audio"}
                    </span>
                  </div>

                  <div className="creator9-content-stat">
                    <FaPlay />

                    <span>
                      {formatNumber(
                        track.plays
                      )}
                    </span>
                  </div>

                  <div className="creator9-content-stat">
                    <FaHeart />

                    <span>
                      {formatNumber(
                        track.likes
                      )}
                    </span>
                  </div>

                  <div className="creator9-content-date">
                    {formatDate(
                      track.createdAt
                    )}
                  </div>

                  <span
                    className={`creator9-visibility ${
                      track.isPublic
                        ? "public"
                        : "private"
                    }`}
                  >
                    {track.isPublic ? (
                      <FaGlobe />
                    ) : (
                      <FaLock />
                    )}

                    {track.isPublic
                      ? "Public"
                      : "Private"}
                  </span>

                  <button
                    type="button"
                    className="creator9-delete"
                    disabled={
                      deletingId ===
                      id
                    }
                    onClick={() =>
                      onDelete(
                        id,
                        track.title
                      )
                    }
                    aria-label="Delete audio"
                  >
                    <FaTrash />
                  </button>
                </article>
              );
            }
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="creator9-pagination">
          <button
            type="button"
            disabled={
              page <= 1
            }
            onClick={() =>
              onPageChange(
                Math.max(
                  1,
                  page - 1
                )
              )
            }
          >
            Previous
          </button>

          <span>
            Page {page} of{" "}
            {totalPages}
          </span>

          <button
            type="button"
            disabled={
              page >=
              totalPages
            }
            onClick={() =>
              onPageChange(
                page + 1
              )
            }
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
};

export default CreatorContentWorkspace;
