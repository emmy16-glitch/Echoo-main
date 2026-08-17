import React from "react";

import "./EchoWave.css";

const BARS = [
  28,
  54,
  76,
  42,
  67,
  88,
  58,
  36,
  62,
];

const EchoWave = ({
  state = "idle",
  compact = false,
  className = "",
  label =
    "Echoo waveform",
}) => {
  const active =
    [
      "playing",
      "live",
      "speaking",
    ].includes(
      state
    );

  return (
    <div
      className={[
        "echoo-wave",
        `echoo-wave-${state}`,
        compact
          ? "echoo-wave-compact"
          : "",
        active
          ? "is-active"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        label
      }
    >
      <div className="echoo-wave-bars">
        {BARS.map(
          (
            height,
            index
          ) => (
            <i
              key={
                index
              }
              style={{
                "--wave-height":
                  `${height}%`,

                "--wave-delay":
                  `${index * 0.075}s`,
              }}
            />
          )
        )}
      </div>

      <span className="echoo-wave-transition" />

      <div className="echoo-wave-ripples">
        <i className="ripple-one" />
        <i className="ripple-two" />
        <i className="ripple-three" />
      </div>
    </div>
  );
};

export default EchoWave;
