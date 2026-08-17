import React from "react";

const ListenerSkeleton = ({
  type = "cards",
  count = 4,
}) => {
  if (
    type === "rows"
  ) {
    return (
      <div className="lb-skeleton-rows">
        {Array.from({
          length: count,
        }).map(
          (_, index) => (
            <div
              className="lb-skeleton-row"
              key={index}
            >
              <span className="lb-skeleton-square" />

              <div>
                <span className="lb-skeleton-line long" />
                <span className="lb-skeleton-line short" />
              </div>

              <span className="lb-skeleton-pill" />
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <div className="lb-skeleton-grid">
      {Array.from({
        length: count,
      }).map(
        (_, index) => (
          <div
            className="lb-skeleton-card"
            key={index}
          >
            <span className="lb-skeleton-art" />
            <span className="lb-skeleton-line long" />
            <span className="lb-skeleton-line medium" />
          </div>
        )
      )}
    </div>
  );
};

export default ListenerSkeleton;