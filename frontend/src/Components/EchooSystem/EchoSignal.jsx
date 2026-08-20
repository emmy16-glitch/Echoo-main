
import EchoNodes from "./EchoNodes";

import "./EchoSignal.css";
import "./EchoSignalMotion.css";

const SIZE_MAP = {
  xs: 30,
  sm: 40,
  md: 56,
  lg: 92,
  xl: 132,
};

const EchoSignal = ({
  children = null,

  state = null,

  active = false,
  speaking = false,

  size = "md",

  nodes = true,

  nodeCount = 8,

  activeNodes = null,

  className = "",

  label =
    "Echoo signal",
}) => {
  const resolvedState =
    state ||
    (
      speaking
        ? "speaking"
        : active
          ? "live"
          : "idle"
    );

  const px =
    SIZE_MAP[
      size
    ] ||
    SIZE_MAP.md;

  const resolvedActiveNodes =
    activeNodes !==
    null
      ? activeNodes
      : resolvedState ===
          "speaking"
        ? 3
        : resolvedState ===
            "live"
          ? 2
          : resolvedState ===
              "listening"
            ? 1
            : resolvedState ===
                "loading"
              ? 1
              : 0;

  return (
    <div
      className={[
        "echoo-signal",
        `echoo-signal-${size}`,
        `echoo-signal-${resolvedState}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        label
      }
    >
      <span className="echoo-signal-ring ring-one" />

      <span className="echoo-signal-ring ring-two" />

      <span className="echoo-signal-ring ring-three" />

      {nodes && (
        <EchoNodes
          count={
            nodeCount
          }
          activeCount={
            resolvedActiveNodes
          }
          radius={
            Math.max(
              14,
              Math.round(
                px *
                  0.47
              )
            )
          }
          animated={
            resolvedState ===
              "live" ||
            resolvedState ===
              "speaking" ||
            resolvedState ===
              "loading"
          }
        />
      )}

      <div className="echoo-signal-core">
        {children || (
          <span className="echoo-signal-dot" />
        )}
      </div>
    </div>
  );
};

export default EchoSignal;
