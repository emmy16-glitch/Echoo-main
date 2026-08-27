import {
  useEffect,
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
}) => {
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

  if (!open) {
    return null;
  }

  return (
    <div
      className={`echoo-toast echoo-toast-${type}`}
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
      </div>

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
