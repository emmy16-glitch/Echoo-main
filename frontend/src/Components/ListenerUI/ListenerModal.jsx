import React, {
  useEffect,
} from "react";

import {
  FaTimes,
} from "react-icons/fa";

const ListenerModal = ({
  open = false,
  title = "",
  subtitle = "",
  children,
  footer,
  onClose,
  size = "medium",
}) => {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleEscape = (
      event
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        onClose?.();
      }
    };

    document.addEventListener(
      "keydown",
      handleEscape
    );

    const oldOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );

      document.body.style.overflow =
        oldOverflow;
    };
  }, [
    open,
    onClose,
  ]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="lb-modal-backdrop"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose?.();
        }
      }}
    >
      <div
        className={`lb-modal lb-modal-${size}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="lb-modal-header">
          <div>
            <h2>
              {title}
            </h2>

            {subtitle && (
              <p>
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            className="lb-modal-close"
            onClick={
              onClose
            }
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        <div className="lb-modal-body">
          {children}
        </div>

        {footer && (
          <div className="lb-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default ListenerModal;