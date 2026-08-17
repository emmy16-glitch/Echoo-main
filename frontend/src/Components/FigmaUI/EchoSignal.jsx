import React from "react";

import "./EchoSignal.css";

const EchoSignal = ({
  children = null,
  active = false,
  speaking = false,
  size = "md",
  className = "",
  label = "Live signal",
}) => {
  return (
    <div
      className={[
        "echoo-signal",
        `echoo-signal-${size}`,
        active
          ? "is-active"
          : "",
        speaking
          ? "is-speaking"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
    >
      <span className="echoo-signal-ring ring-one" />
      <span className="echoo-signal-ring ring-two" />

      <div className="echoo-signal-core">
        {children || (
          <span className="echoo-signal-dot" />
        )}
      </div>
    </div>
  );
};

export default EchoSignal;
