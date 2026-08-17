import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaArrowRight,
  FaCalendarAlt,
  FaCloudUploadAlt,
  FaHeart,
  FaMicrophone,
  FaPlay,
  FaUsers,
} from "react-icons/fa";

import studioService from "../../services/studioService";

import EchoAvatar from "../EchooSystem/EchoAvatar";
import EchoSignal from "../EchooSystem/EchoSignal";
import EchoAmbient from "../EchooSystem/EchoAmbient";

import "./CreatorStudioHome.css";

const formatNumber = (
  value
) => {
  if (
    value === null ||
    value === undefined
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
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
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

const getTrackId = (
  track
) =>
  track?.id ||
  track?._id ||
  null;

const getTrackArtwork = (
  track
) =>
  track?.coverArt ||
  track?.artwork ||
  track?.image ||
  null;

const CreatorStudioHome = ({
  studioName = "Creator",
  studioType = "Creator",
  profileImage = null,
  followers = 0,
  onUpload,
  onNavigate,
}) => {
  const [
    analytics,
    setAnalytics,
  ] = useState(null);

  const [
    tracks,
    setTracks,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    dataError,
    setDataError,
  ] = useState("");

  useEffect(() => {
    let mounted =
      true;

    const load =
      async () => {
        setLoading(true);
        setDataError("");

        const [
          analyticsResult,
          contentResult,
        ] =
          await Promise.allSettled(
            [
              studioService.getAnalytics(
                "30d"
              ),

              studioService.getContent({
                page: 1,
                limit: 6,
              }),
            ]
          );

        if (!mounted) {
          return;
        }

        if (
          analyticsResult.status ===
          "fulfilled"
        ) {
          setAnalytics(
            analyticsResult.value
              ?.data ||
              null
          );
        } else {
          console.error(
            "Creator Studio analytics:",
            analyticsResult.reason
          );
        }

        if (
          contentResult.status ===
          "fulfilled"
        ) {
          const value =
            contentResult.value
              ?.data;

          setTracks(
            Array.isArray(
              value?.tracks
            )
              ? value.tracks
              : []
          );
        } else {
          console.error(
            "Creator Studio content:",
            contentResult.reason
          );
        }

        if (
          analyticsResult.status ===
            "rejected" &&
          contentResult.status ===
            "rejected"
        ) {
          setDataError(
            "Studio performance data is temporarily unavailable."
          );
        }

        setLoading(false);
      };

    load();

    return () => {
      mounted =
        false;
    };
  }, []);

  const summary =
    analytics?.summary ||
    null;

  const totalTracks =
    summary?.totalTracks;

  const totalPlays =
    summary?.totalPlays;

  const totalLikes =
    summary?.totalLikes;

  const metrics =
    useMemo(
      () => [
        {
          label:
            "Followers",

          value:
            formatNumber(
              followers
            ),

          icon:
            <FaUsers />,

          helper:
            "People following your creator presence.",
        },

        {
          label:
            "Total plays",

          value:
            formatNumber(
              totalPlays
            ),

          icon:
            <FaPlay />,

          helper:
            "Recorded plays across your published audio.",
        },

        {
          label:
            "Total likes",

          value:
            formatNumber(
              totalLikes
            ),

          icon:
            <FaHeart />,

          helper:
            "Likes currently recorded on your content.",
        },

        {
          label:
            "Published audio",

          value:
            formatNumber(
              totalTracks
            ),

          icon:
            <FaCloudUploadAlt />,

          helper:
            "Audio items represented in Creator analytics.",
        },
      ],
      [
        followers,
        totalPlays,
        totalLikes,
        totalTracks,
      ]
    );

  return (
    <div className="echoo-creator-home">
      <section className="echoo-creator-presence">
        <EchoAmbient
          density="low"
          className="echoo-creator-home-ambient"
        />

        <div className="echoo-creator-presence-copy">
          <span className="echoo-creator-kicker">
            YOUR CREATOR PRESENCE
          </span>

          <h1>
            Your voice,
            ready when you are.
          </h1>

          <p>
            Publish audio,
            prepare live
            conversations and
            understand the people
            listening to you.
          </p>

          <div className="echoo-creator-primary-actions">
            <button
              type="button"
              className="primary"
              onClick={
                onUpload
              }
            >
              <FaCloudUploadAlt />
              Upload audio
            </button>

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  "Live"
                )
              }
            >
              <FaMicrophone />
              Prepare to go live
            </button>
          </div>
        </div>

        <div className="echoo-creator-identity">
          <div className="echoo-creator-signal-wrap">
            <EchoSignal
              size="xl"
              state="idle"
              activeNodes={0}
            >
              <EchoAvatar
                image={
                  profileImage
                }
                name={
                  studioName
                }
                size="lg"
                state="idle"
              />
            </EchoSignal>
          </div>

          <strong>
            {
              studioName
            }
          </strong>

          <span>
            {
              studioType
            }
          </span>

          <small>
            Not live
          </small>
        </div>
      </section>

      <section className="echoo-creator-metrics-section">
        <div className="echoo-creator-section-title">
          <div>
            <h2>
              Performance
            </h2>

            <p>
              Real values currently
              available from your
              Echoo creator data.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              onNavigate(
                "Analytics"
              )
            }
          >
            View analytics
            <FaArrowRight />
          </button>
        </div>

        {loading ? (
          <div className="echoo-creator-metric-loading">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className="echoo-creator-metrics">
            {metrics.map(
              (
                metric
              ) => (
                <article
                  key={
                    metric.label
                  }
                >
                  <div className="echoo-creator-metric-top">
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
                    {
                      metric.value
                    }
                  </strong>

                  <p>
                    {
                      metric.helper
                    }
                  </p>
                </article>
              )
            )}
          </div>
        )}

        {dataError && (
          <p className="echoo-creator-data-error">
            {
              dataError
            }
          </p>
        )}
      </section>

      <section className="echoo-creator-work-section">
        <div className="echoo-creator-section-title">
          <div>
            <h2>
              What do you want to
              do?
            </h2>

            <p>
              Creator tools,
              without pretending
              unfinished backend
              features already
              work.
            </p>
          </div>
        </div>

        <div className="echoo-creator-actions-list">
          <button
            type="button"
            onClick={
              onUpload
            }
          >
            <span className="echoo-creator-action-icon">
              <FaCloudUploadAlt />
            </span>

            <span className="echoo-creator-action-copy">
              <strong>
                Upload audio
              </strong>

              <small>
                Publish a new audio
                item to Echoo.
              </small>
            </span>

            <span className="echoo-creator-action-status available">
              Available
            </span>

            <FaArrowRight />
          </button>

          <button
            type="button"
            onClick={() =>
              onNavigate(
                "Live"
              )
            }
          >
            <span className="echoo-creator-action-icon">
              <EchoSignal
                size="xs"
                state="idle"
                nodes={false}
              />
            </span>

            <span className="echoo-creator-action-copy">
              <strong>
                Go live
              </strong>

              <small>
                Start a live audio
                conversation with
                your audience.
              </small>
            </span>

            <span className="echoo-creator-action-status pending">
              Backend pending
            </span>

            <FaArrowRight />
          </button>

          <button
            type="button"
            onClick={() =>
              onNavigate(
                "Schedule"
              )
            }
          >
            <span className="echoo-creator-action-icon">
              <FaCalendarAlt />
            </span>

            <span className="echoo-creator-action-copy">
              <strong>
                Schedule a broadcast
              </strong>

              <small>
                Prepare an upcoming
                event for your
                listeners.
              </small>
            </span>

            <span className="echoo-creator-action-status pending">
              Backend pending
            </span>

            <FaArrowRight />
          </button>
        </div>
      </section>

      <section className="echoo-creator-recent-section">
        <div className="echoo-creator-section-title">
          <div>
            <h2>
              Recent audio
            </h2>

            <p>
              Your latest published
              content.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              onNavigate(
                "Content"
              )
            }
          >
            View all content
            <FaArrowRight />
          </button>
        </div>

        {loading ? (
          <div className="echoo-creator-recent-loading">
            <span />
            <span />
            <span />
          </div>
        ) : tracks.length >
          0 ? (
          <div className="echoo-creator-recent-list">
            {tracks.map(
              (
                track,
                index
              ) => (
                <article
                  key={
                    getTrackId(
                      track
                    ) ||
                    index
                  }
                >
                  <div className="echoo-creator-track-art">
                    {getTrackArtwork(
                      track
                    ) ? (
                      <img
                        src={
                          getTrackArtwork(
                            track
                          )
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

                  <div className="echoo-creator-track-copy">
                    <strong>
                      {track.title ||
                        "Untitled Audio"}
                    </strong>

                    <span>
                      {track.genre ||
                        "Audio"}
                    </span>
                  </div>

                  <div className="echoo-creator-track-date">
                    {formatDate(
                      track.createdAt
                    )}
                  </div>

                  <div className="echoo-creator-track-stat">
                    <FaPlay />

                    {formatNumber(
                      track.plays ||
                        0
                    )}
                  </div>

                  <div className="echoo-creator-track-stat">
                    <FaHeart />

                    {formatNumber(
                      track.likes ||
                        0
                    )}
                  </div>

                  <span
                    className={`echoo-creator-public-state ${
                      track.isPublic
                        ? "public"
                        : "private"
                    }`}
                  >
                    {track.isPublic
                      ? "Public"
                      : "Private"}
                  </span>
                </article>
              )
            )}
          </div>
        ) : (
          <div className="echoo-creator-empty-content">
            <EchoSignal
              size="lg"
              state="idle"
              activeNodes={0}
            />

            <div>
              <h3>
                Your studio is
                quiet.
              </h3>

              <p>
                Publish your first
                audio and it will
                appear here.
              </p>
            </div>

            <button
              type="button"
              onClick={
                onUpload
              }
            >
              Upload audio
            </button>
          </div>
        )}
      </section>

      <section className="echoo-creator-presence-note">
        <div>
          <EchoSignal
            size="md"
            state="idle"
            activeNodes={0}
          />
        </div>

        <div>
          <span>
            CREATOR PRESENCE
          </span>

          <h2>
            Your signal only comes
            alive when something is
            happening.
          </h2>

          <p>
            Echoo keeps the studio
            visually quiet while
            you are offline. When
            live broadcasting is
            connected, this signal
            becomes active and
            represents your real
            presence.
          </p>
        </div>
      </section>
    </div>
  );
};

export default CreatorStudioHome;
