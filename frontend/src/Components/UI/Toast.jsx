import {
  useEffect,
  useState,
} from 'react';

import {
  FaCheckCircle,
  FaExclamationCircle,
  FaInfoCircle,
  FaTimes,
} from 'react-icons/fa';

import './UI.css';

const icons = {
  success:
    <FaCheckCircle />,

  error:
    <FaExclamationCircle />,

  info:
    <FaInfoCircle />,
};

const Toast = ({
  open = false,
  type = 'info',
  title = '',
  message = '',
  duration = 4000,
  onClose,
  actionLabel = '',
  onAction,
  actionDisabled = false,
  showCountdown = false,
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (
      !open ||
      !onClose ||
      duration <= 0
    ) {
      return;
    }

    const timeout =
      setTimeout(
        onClose,
        duration
      );

    return () =>
      clearTimeout(
        timeout
      );
  }, [
    open,
    duration,
    onClose,
  ]);

  useEffect(() => {
    if (!open || !showCountdown || duration <= 0) {
      setRemainingSeconds(0);
      return undefined;
    }

    const expiresAt = Date.now() + duration;
    const updateCountdown = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(interval);
  }, [open, showCountdown, duration]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={`echoo-toast echoo-toast-${type} ${actionLabel && onAction ? 'echoo-toast--actionable' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="echoo-toast-icon">
        {icons[type] ||
          icons.info}
      </div>

      <div className="echoo-toast-content">
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

        {showCountdown && remainingSeconds > 0 && (
          <span className="echoo-toast-countdown" aria-hidden="true">
            Undo expires in <strong>{remainingSeconds}s</strong>
          </span>
        )}
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          className="echoo-toast-action"
          onClick={onAction}
          disabled={actionDisabled}
        >
          {actionDisabled ? 'Undoing…' : actionLabel}
        </button>
      )}

      <button
        type="button"
        className="echoo-toast-close"
        onClick={
          onClose
        }
        aria-label="Close"
      >
        <FaTimes />
      </button>
    </div>
  );
};

export default Toast;
