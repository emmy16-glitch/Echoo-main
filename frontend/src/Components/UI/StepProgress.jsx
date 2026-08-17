import React from "react";
import { FaCheck } from "react-icons/fa";
import "./StepProgress.css";

const StepProgress = ({
  steps = [],
  currentStep = 1,
}) => {
  return (
    <div className="echoo-progress-wrap">
      <div className="echoo-progress-track">
        {steps.map((step, index) => {
          const number = index + 1;

          const completed =
            number < currentStep;

          const active =
            number === currentStep;

          return (
            <React.Fragment
              key={`${step}-${index}`}
            >
              <div
                className={`echoo-progress-step ${
                  completed
                    ? "is-complete"
                    : ""
                } ${
                  active
                    ? "is-active"
                    : ""
                }`}
              >
                <div className="echoo-progress-marker">
                  {completed ? (
                    <FaCheck />
                  ) : (
                    number
                  )}
                </div>

                <span className="echoo-progress-label">
                  {step}
                </span>
              </div>

              {index <
                steps.length - 1 && (
                <div
                  className={`echoo-progress-line ${
                    completed
                      ? "is-complete"
                      : ""
                  }`}
                >
                  <span />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default StepProgress;