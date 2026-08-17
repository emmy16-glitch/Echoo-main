import React, { useEffect } from "react";
import { FaCheck } from "react-icons/fa";
import "./UI.css";

const SuccessState = ({
  title = "Success",
  message = "",
  buttonText = "",
  onContinue,
  autoContinue = false,
  duration = 1200,
}) => {
  useEffect(() => {
    if (!autoContinue || !onContinue) {
      return;
    }

    const timeout = setTimeout(() => {
      onContinue();
    }, duration);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    autoContinue,
    duration,
    onContinue,
  ]);

  return (
    <div className="echoo-success-state">
      <div className="echoo-success-animation">
        <div className="echoo-success-pulse"></div>

        <div className="echoo-success-ring">
          <div className="echoo-success-check">
            <FaCheck />
          </div>
        </div>
      </div>

      <h2>{title}</h2>

      {message && <p>{message}</p>}

      {buttonText && onContinue && (
        <button
          type="button"
          className="echoo-success-button"
          onClick={onContinue}
        >
          {buttonText}
        </button>
      )}

      {autoContinue && (
        <div className="echoo-success-loading">
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}
    </div>
  );
};

export default SuccessState;