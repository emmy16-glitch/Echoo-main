import React from "react";

import "./EchoAmbient.css";

const EchoAmbient = ({
  density = "low",
  className = "",
}) => {
  return (
    <div
      className={[
        "echoo-ambient",
        `echoo-ambient-${density}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <span className="echoo-ambient-ring ring-a" />
      <span className="echoo-ambient-ring ring-b" />
      <span className="echoo-ambient-ring ring-c" />

      <i className="echoo-ambient-node node-a" />
      <i className="echoo-ambient-node node-b" />
      <i className="echoo-ambient-node node-c" />

      <div className="echoo-ambient-wave">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
};

export default EchoAmbient;
