import React from "react";

import {
  FaPlay,
  FaShareAlt,
  FaTrash,
} from "react-icons/fa";

import EchoSignal from "./EchoSignal";
import EchoWave from "./EchoWave";

import "./EchoMoment.css";

const EchoMoment = ({
  quote,

  creator,

  room,

  duration =
    "00:28",

  timestampLabel =
    null,

  onPlay = null,

  onShare = null,

  onDelete = null,

  highlighted =
    false,

  className = "",
}) => {
  return (
    <article
      className={[
        "echoo-moment",
        highlighted
          ? "is-highlighted"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header>
        <span>
          MOMENT
        </span>

        <EchoSignal
          size="xs"
          state="listening"
          nodes={false}
        />
      </header>

      <blockquote>
        “{quote}”
      </blockquote>

      <div className="echoo-moment-wave">
        <EchoWave
          state="idle"
          compact
        />

        <div className="echoo-moment-times">
          {timestampLabel && (
            <span>
              at{" "}
              {
                timestampLabel
              }
            </span>
          )}

          <time>
            {
              duration
            }
          </time>
        </div>
      </div>

      <footer>
        <div>
          <strong>
            {creator}
          </strong>

          <span>
            {room}
          </span>
        </div>

        <div className="echoo-moment-actions">
          {onPlay && (
            <button
              type="button"
              onClick={
                onPlay
              }
            >
              <FaPlay />
              Listen
            </button>
          )}

          {onShare && (
            <button
              type="button"
              onClick={
                onShare
              }
            >
              <FaShareAlt />
              Share
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              className="delete"
              onClick={
                onDelete
              }
              aria-label="Delete Moment"
            >
              <FaTrash />
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};

export default EchoMoment;
