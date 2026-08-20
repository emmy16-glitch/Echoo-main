import {
  useEffect,
} from "react";

import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaTimes,
} from "react-icons/fa";

const ListenerToast = ({
  open = false,
  type = "info",
  title = "",
  message = "",
  onClose,
  actionLabel = "",
  onAction,
  duration = 4500,
}) => {
  useEffect(() => {
    if (
      !open ||
      !duration
    ) {
      return undefined;
    }

    const timer =
      window.setTimeout(
        () => {
          onClose?.();
        },
        duration
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    open,
    duration,
    onClose,
  ]);

  if (!open) {
    return null;
  }

  const Icon =
    type === "success"
      ? FaCheckCircle
      : type === "error"
      ? FaExclamationTriangle
      : FaInfoCircle;

  return (
    <div
      className={`lb-toast lb-toast-${type}`}
      role="status"
    >
      <div className="lb-toast-icon">
        <Icon />
      </div>

      <div className="lb-toast-copy">
        {title && (
          <strong>
            {title}
          </strong>
        )}

        {message && (
          <span>
            {message}
          </span>
        )}
      </div>

      {actionLabel && (
        <button
          type="button"
          className="lb-toast-action"
          onClick={() => {
            onAction?.();
            onClose?.();
          }}
        >
          {actionLabel}
        </button>
      )}

      <button
        type="button"
        className="lb-toast-close"
        onClick={onClose}
        aria-label="Close notification"
      >
        <FaTimes />
      </button>
    </div>
  );
};

export default ListenerToast;