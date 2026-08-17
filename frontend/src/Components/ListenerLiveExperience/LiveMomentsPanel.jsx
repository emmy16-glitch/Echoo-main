import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaClock,
  FaPlay,
  FaPlus,
} from "react-icons/fa";

import EchoMoment from "../EchooSystem/EchoMoment";
import EchoSignal from "../EchooSystem/EchoSignal";

import momentService, {
  formatTimestamp,
} from "../../services/momentService";

const LiveMomentsPanel = ({
  broadcast,

  creator,

  currentTrack,

  currentTime = 0,

  liveElapsedSeconds = 0,

  playTrack,

  playTrackAt,

  showToast,
}) => {
  const [
    quote,
    setQuote,
  ] = useState("");

  const [
    moments,
    setMoments,
  ] = useState(
    () =>
      broadcast
        ? momentService.getByBroadcast(
            broadcast.id
          )
        : []
  );

  const replay =
    broadcast?.replay ||
    null;

  const replayActive =
    Boolean(
      replay?.id &&
      currentTrack?.id &&
      String(
        replay.id
      ) ===
        String(
          currentTrack.id
        )
    );

  const captureSeconds =
    replayActive
      ? Math.floor(
          Number(
            currentTime
          ) || 0
        )
      : Math.floor(
          Number(
            liveElapsedSeconds
          ) || 0
        );

  const captureLabel =
    formatTimestamp(
      captureSeconds
    );

  const roomName =
    broadcast?.title ||
    "Echoo Live";

  const creatorName =
    creator?.name ||
    broadcast?.subtitle ||
    "Echoo Creator";

  const selectedMomentId =
    useMemo(
      () => {
        try {
          return new URLSearchParams(
            window.location.search
          ).get(
            "moment"
          );
        } catch {
          return null;
        }
      },
      []
    );

  const reload =
    () => {
      if (
        !broadcast?.id
      ) {
        setMoments([]);
        return;
      }

      setMoments(
        momentService.getByBroadcast(
          broadcast.id
        )
      );
    };

  useEffect(() => {
    reload();

    const handleChange =
      (
        event
      ) => {
        if (
          !event?.detail
            ?.broadcastId ||
          String(
            event.detail
              .broadcastId
          ) ===
            String(
              broadcast?.id
            )
        ) {
          reload();
        }
      };

    window.addEventListener(
      "echoo:moments-changed",
      handleChange
    );

    return () =>
      window.removeEventListener(
        "echoo:moments-changed",
        handleChange
      );
  }, [
    broadcast?.id,
  ]);

  const openReplayReference =
    () => {
      if (!replay) {
        showToast?.(
          "info",
          "Replay unavailable",
          "This broadcast does not have a replay source yet."
        );

        return;
      }

      if (
        typeof playTrackAt ===
        "function"
      ) {
        playTrackAt(
          replay,
          0
        );
      } else {
        playTrack?.(
          replay
        );
      }

      showToast?.(
        "info",
        "Replay reference opened",
        "The player can now provide an exact audio timestamp for your Moment."
      );
    };

  const createMoment =
    () => {
      const clean =
        quote.trim();

      if (!clean) {
        showToast?.(
          "info",
          "Add a Moment",
          "Write the line or idea you want to remember first."
        );

        return;
      }

      try {
        momentService.create({
          broadcastId:
            broadcast.id,

          trackId:
            replay?.id ||
            null,

          quote:
            clean,

          creator:
            creatorName,

          room:
            roomName,

          timestamp:
            captureSeconds,

          clipDuration:
            28,

          sourceTitle:
            replay?.title ||
            roomName,
        });

        setQuote("");

        showToast?.(
          "success",
          "Moment saved",
          `Linked to ${captureLabel}. It is stored on this browser for now.`
        );
      } catch (
        error
      ) {
        showToast?.(
          "error",
          "Could not create Moment",
          error?.message ||
            "Please try again."
        );
      }
    };

  const playMoment =
    (
      moment
    ) => {
      if (!replay) {
        showToast?.(
          "info",
          "Replay unavailable",
          "This Moment has a timestamp, but the replay source is not available yet."
        );

        return;
      }

      if (
        typeof playTrackAt ===
        "function"
      ) {
        playTrackAt(
          replay,
          moment.timestamp
        );

        return;
      }

      playTrack?.(
        replay
      );

      showToast?.(
        "info",
        "Replay opened",
        `This Moment starts at ${formatTimestamp(
          moment.timestamp
        )}.`
      );
    };

  const shareMoment =
    async (
      moment
    ) => {
      const url =
        momentService.buildShareUrl(
          moment
        );

      const text =
        `“${moment.quote}” — ${moment.creator}, ${moment.room}`;

      if (
        navigator.share
      ) {
        try {
          await navigator.share({
            title:
              "Echo Moment",

            text,

            url,
          });

          return;
        } catch {
          return;
        }
      }

      try {
        await navigator.clipboard.writeText(
          url
        );

        showToast?.(
          "success",
          "Moment link copied",
          "The shared link includes the audio timestamp."
        );
      } catch {
        showToast?.(
          "info",
          "Moment link",
          url
        );
      }
    };

  const deleteMoment =
    (
      moment
    ) => {
      momentService.remove(
        moment.id
      );

      showToast?.(
        "info",
        "Moment removed",
        "The local Moment was removed from this browser."
      );
    };

  return (
    <section className="echoo-live-moments">
      <header className="echoo-live-moments-header">
        <div>
          <span>
            ECHO MOMENTS
          </span>

          <h2>
            Keep the part that
            stayed with you.
          </h2>

          <p>
            A Moment connects a
            thought to a specific
            point in the audio.
          </p>
        </div>

        <EchoSignal
          size="lg"
          state={
            replayActive
              ? "listening"
              : "idle"
          }
          activeNodes={
            replayActive
              ? 1
              : 0
          }
        />
      </header>

      <div className="echoo-moments-layout">
        <aside className="echoo-moment-composer">
          <span className="echoo-moment-composer-label">
            CREATE A MOMENT
          </span>

          <h3>
            What did you want
            to remember?
          </h3>

          <p>
            Link a quote,
            thought or important
            line to the audio
            timeline.
          </p>

          <label>
            <span>
              Your Moment
            </span>

            <textarea
              maxLength={220}
              rows={5}
              value={
                quote
              }
              placeholder="Write the line or thought..."
              onChange={(
                event
              ) =>
                setQuote(
                  event.target
                    .value
                )
              }
            />

            <small>
              {
                quote.length
              }
              /220
            </small>
          </label>

          <div className="echoo-moment-position">
            <span>
              <FaClock />
              Linked at
            </span>

            <strong>
              {
                captureLabel
              }
            </strong>

            <small>
              {replayActive
                ? "Current replay position"
                : "Current Live timeline"}
            </small>
          </div>

          {replay && (
            <button
              type="button"
              className="echoo-reference-replay"
              onClick={
                openReplayReference
              }
            >
              <FaPlay />
              Open replay reference
            </button>
          )}

          <button
            type="button"
            className="echoo-create-moment"
            disabled={
              !quote.trim()
            }
            onClick={
              createMoment
            }
          >
            <FaPlus />
            Create Moment
          </button>

          <p className="echoo-moment-boundary">
            Phase 12 stores a
            timestamp reference,
            not a newly cut audio
            file. Actual clip
            extraction/export
            requires media-backend
            support.
          </p>
        </aside>

        <div className="echoo-moments-feed">
          <div className="echoo-moments-feed-heading">
            <div>
              <h3>
                Moments from this
                room
              </h3>

              <p>
                {
                  moments.length
                }{" "}
                {moments.length ===
                1
                  ? "Moment"
                  : "Moments"}{" "}
                saved locally.
              </p>
            </div>
          </div>

          {moments.length ===
          0 ? (
            <div className="echoo-moments-empty">
              <EchoSignal
                size="md"
                state="idle"
                activeNodes={0}
              />

              <div>
                <strong>
                  No Moments yet
                </strong>

                <p>
                  The first Moment
                  you create from
                  this conversation
                  will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="echoo-moments-list">
              {moments.map(
                (
                  moment
                ) => (
                  <EchoMoment
                    key={
                      moment.id
                    }
                    quote={
                      moment.quote
                    }
                    creator={
                      moment.creator
                    }
                    room={
                      moment.room
                    }
                    duration={`00:${String(
                      moment.clipDuration ||
                        28
                    ).padStart(
                      2,
                      "0"
                    )}`}
                    timestampLabel={
                      formatTimestamp(
                        moment.timestamp
                      )
                    }
                    highlighted={
                      String(
                        selectedMomentId
                      ) ===
                      String(
                        moment.id
                      )
                    }
                    onPlay={() =>
                      playMoment(
                        moment
                      )
                    }
                    onShare={() =>
                      shareMoment(
                        moment
                      )
                    }
                    onDelete={() =>
                      deleteMoment(
                        moment
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default LiveMomentsPanel;
