import React, {
  useMemo,
} from "react";

import "./EchoNodes.css";

const EchoNodes = ({
  count = 8,
  activeCount = 1,
  radius = 30,
  animated = false,
  className = "",
}) => {
  const nodes =
    useMemo(() => {
      const total =
        Math.max(
          1,
          Number(count) || 1
        );

      const active =
        Math.max(
          0,
          Math.min(
            total,
            Number(
              activeCount
            ) || 0
          )
        );

      const activeIndexes =
        new Set(
          Array.from(
            {
              length:
                active,
            },
            (
              _,
              index
            ) =>
              Math.floor(
                (
                  (
                    index +
                    1
                  ) *
                  total
                ) /
                  (
                    active +
                    1
                  )
              )
          )
        );

      return Array.from(
        {
          length:
            total,
        },
        (
          _,
          index
        ) => ({
          index,

          angle:
            (
              360 /
              total
            ) *
              index +
            (
              index %
              2
                ? 4
                : 0
            ),

          active:
            activeIndexes.has(
              index
            ),

          delay:
            index *
            0.11,
        })
      );
    }, [
      count,
      activeCount,
    ]);

  return (
    <span
      className={[
        "echoo-nodes",
        animated
          ? "is-animated"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      {nodes.map(
        (
          node
        ) => (
          <i
            key={
              node.index
            }
            className={
              node.active
                ? "echoo-node is-active"
                : "echoo-node"
            }
            style={{
              "--node-angle":
                `${node.angle}deg`,

              "--node-radius":
                `${radius}px`,

              "--node-delay":
                `${node.delay}s`,
            }}
          />
        )
      )}
    </span>
  );
};

export default EchoNodes;
