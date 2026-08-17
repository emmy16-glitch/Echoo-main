import React, {
  useMemo,
} from "react";

import {
  FaChartLine,
  FaHeart,
  FaMusic,
  FaPlay,
} from "react-icons/fa";

import EchoSignal from "../EchooSystem/EchoSignal";

import "./CreatorPhase10.css";

const formatNumber = (
  value
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number =
    Number(value);

  if (
    Number.isNaN(
      number
    )
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US"
  ).format(
    number
  );
};

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

const formatDuration = (
  value
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  if (
    typeof value ===
    "string" &&
    value.includes(":")
  ) {
    return value;
  }

  const seconds =
    Number(value);

  if (
    Number.isNaN(
      seconds
    )
  ) {
    return String(
      value
    );
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remaining =
    Math.floor(
      seconds % 60
    );

  return `${minutes}:${String(
    remaining
  ).padStart(
    2,
    "0"
  )}`;
};

const CreatorAnalyticsWorkspace = ({
  analytics = null,
  period = "30d",
  onPeriodChange,
  loading = false,
}) => {
  const summary =
    analytics?.summary ||
    {};

  const tracks =
    Array.isArray(
      analytics?.tracks
    )
      ? analytics.tracks
      : [];

  const rankedTracks =
    useMemo(
      () =>
        [...tracks].sort(
          (
            first,
            second
          ) =>
            (
              Number(
                second.plays
              ) || 0
            ) -
            (
              Number(
                first.plays
              ) || 0
            )
        ),
      [
        tracks,
      ]
    );

  const maximumPlays =
    Math.max(
      ...rankedTracks.map(
        (
          track
        ) =>
          Number(
            track.plays
          ) || 0
      ),
      0
    );

  const metrics = [
    {
      label:
        "Published tracks",

      value:
        summary
          ?.totalTracks,

      icon:
        <FaMusic />,
    },

    {
      label:
        "Total plays",

      value:
        summary
          ?.totalPlays,

      icon:
        <FaPlay />,
    },

    {
      label:
        "Total likes",

      value:
        summary
          ?.totalLikes,

      icon:
        <FaHeart />,
    },

    {
      label:
        "Average plays",

      value:
        summary
          ?.averagePlays,

      icon:
        <FaChartLine />,
    },
  ];

  if (loading) {
    return (
      <section className="creator10-page">
        <div className="creator10-header-loading" />

        <div className="creator10-metric-loading">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  return (
    <section className="creator10-page creator10-analytics">
      <header className="creator10-page-header analytics">
        <div>
          <span className="creator10-kicker">
            PERFORMANCE
          </span>

          <h1>
            See what people
            are actually
            listening to.
          </h1>

          <p>
            Real plays, likes
            and content
            performance from the
            Creator Analytics API.
          </p>
        </div>

        <div className="creator10-periods">
          {[
            "7d",
            "30d",
            "90d",
            "12m",
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
                  period ===
                  item
                    ? "active"
                    : ""
                }
                onClick={() =>
                  onPeriodChange(
                    item
                  )
                }
              >
                {item ===
                "12m"
                  ? "12 months"
                  : item}
              </button>
            )
          )}
        </div>
      </header>

      <section className="creator10-metric-strip">
        {metrics.map(
          (
            metric
          ) => (
            <article
              key={
                metric.label
              }
            >
              <div className="creator10-metric-label">
                <span>
                  {
                    metric.icon
                  }
                </span>

                <small>
                  {
                    metric.label
                  }
                </small>
              </div>

              <strong>
                {formatNumber(
                  metric.value
                )}
              </strong>
            </article>
          )
        )}
      </section>

      <section className="creator10-performance-section">
        <div className="creator10-section-heading">
          <div>
            <h2>
              Content performance
            </h2>

            <p>
              Ranked using the
              actual play totals
              returned for this
              period.
            </p>
          </div>

          <span>
            {
              period
            }
          </span>
        </div>

        {rankedTracks.length >
        0 ? (
          <div className="creator10-performance-list">
            {rankedTracks.map(
              (
                track,
                index
              ) => {
                const plays =
                  Number(
                    track.plays
                  ) || 0;

                const width =
                  maximumPlays >
                  0
                    ? Math.max(
                        4,
                        (
                          plays /
                          maximumPlays
                        ) *
                          100
                      )
                    : 0;

                return (
                  <article
                    key={
                      track.id ||
                      track._id ||
                      index
                    }
                  >
                    <span className="creator10-rank">
                      {String(
                        index +
                        1
                      ).padStart(
                        2,
                        "0"
                      )}
                    </span>

                    <div className="creator10-performance-copy">
                      <strong>
                        {track.title ||
                          "Untitled Audio"}
                      </strong>

                      <span>
                        {formatDate(
                          track.createdAt
                        )}
                      </span>

                      <div className="creator10-performance-track">
                        <i
                          className={
                            index ===
                            0
                              ? "top"
                              : ""
                          }
                          style={{
                            width:
                              `${width}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="creator10-track-value">
                      <FaPlay />

                      <strong>
                        {formatNumber(
                          track.plays
                        )}
                      </strong>

                      <span>
                        plays
                      </span>
                    </div>

                    <div className="creator10-track-value">
                      <FaHeart />

                      <strong>
                        {formatNumber(
                          track.likes
                        )}
                      </strong>

                      <span>
                        likes
                      </span>
                    </div>

                    <div className="creator10-track-value">
                      <FaMusic />

                      <strong>
                        {formatDuration(
                          track.duration
                        )}
                      </strong>

                      <span>
                        duration
                      </span>
                    </div>
                  </article>
                );
              }
            )}
          </div>
        ) : (
          <div className="creator10-analytics-empty">
            <EchoSignal
              size="lg"
              state="idle"
              activeNodes={0}
            />

            <div>
              <h2>
                No performance
                data yet
              </h2>

              <p>
                Publish audio and
                let people listen.
                Echoo will show
                performance when
                real backend data
                exists.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="creator10-analytics-boundary">
        <EchoSignal
          size="sm"
          state="idle"
          activeNodes={0}
        />

        <div>
          <strong>
            No synthetic trend
            chart
          </strong>

          <p>
            The current Analytics
            response gives Echoo
            summary values and
            track performance.
            We are not drawing a
            fake historical line
            graph without real
            time-series points.
          </p>
        </div>
      </section>
    </section>
  );
};

export default CreatorAnalyticsWorkspace;
