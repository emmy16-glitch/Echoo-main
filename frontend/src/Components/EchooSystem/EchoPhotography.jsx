import {
  useState,
} from "react";

import "./EchoPhotography.css";

const EchoPhotography = ({
  src,
  alt = "",
  ratio = "4/3",
  children = null,
  className = "",
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  return (
    <figure
      className={[
        "echoo-photography",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        "--echoo-photo-ratio":
          ratio,
      }}
    >
      {src &&
      !failed ? (
        <img
          src={src}
          alt={alt}
          draggable="false"
          onError={() =>
            setFailed(
              true
            )
          }
        />
      ) : (
        <div className="echoo-photography-placeholder" />
      )}

      {children && (
        <div className="echoo-photography-overlay">
          {children}
        </div>
      )}
    </figure>
  );
};

export default EchoPhotography;
