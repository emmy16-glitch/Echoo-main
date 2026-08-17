import React, {
  useState,
} from "react";

import EchoSignal from "./EchoSignal";

import "./EchoAvatar.css";

const SIZE_MAP = {
  xs: 28,
  sm: 38,
  md: 50,
  lg: 68,
  xl: 92,
};

const initials = (
  value
) =>
  String(
    value ||
    "Echoo"
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (
        word
      ) =>
        word
          .charAt(0)
          .toUpperCase()
    )
    .join("");

const EchoAvatar = ({
  image = null,
  name = "Echoo",
  state = "idle",
  size = "md",
  className = "",
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  const avatarSize =
    SIZE_MAP[
      size
    ] ||
    SIZE_MAP.md;

  const signalSize =
    avatarSize <=
    38
      ? "sm"
      : avatarSize <=
          50
        ? "md"
        : avatarSize <=
            68
          ? "lg"
          : "xl";

  const avatar = (
    <div
      className="echoo-avatar-image"
      style={{
        "--echoo-avatar-size":
          `${avatarSize}px`,
      }}
    >
      {image &&
      !failed ? (
        <img
          src={image}
          alt={name}
          draggable="false"
          onError={() =>
            setFailed(
              true
            )
          }
        />
      ) : (
        <span>
          {initials(
            name
          )}
        </span>
      )}
    </div>
  );

  if (
    state ===
      "idle" ||
    state ===
      "normal"
  ) {
    return (
      <div
        className={[
          "echoo-avatar",
          className,
        ]
          .filter(
            Boolean
          )
          .join(
            " "
          )}
      >
        {avatar}
      </div>
    );
  }

  return (
    <div
      className={[
        "echoo-avatar",
        `echoo-avatar-${state}`,
        className,
      ]
        .filter(
          Boolean
        )
        .join(
          " "
        )}
    >
      <EchoSignal
        size={
          signalSize
        }
        state={
          state
        }
        nodeCount={
          8
        }
      >
        {avatar}
      </EchoSignal>
    </div>
  );
};

export default EchoAvatar;
