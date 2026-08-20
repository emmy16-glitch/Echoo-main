import { FaExclamationTriangle } from 'react-icons/fa';

const UnavailableState = ({
  title = 'Data unavailable',
  message = 'Echoo could not reach the backend. Your content has not been changed.',
  onRetry,
  compact = false,
}) => (
  <div
    className={`echoo-unavailable-state${compact ? ' compact' : ''}`}
    role="status"
    aria-live="polite"
  >
    <FaExclamationTriangle aria-hidden="true" />
    <strong>{title}</strong>
    <span>{message}</span>
    {onRetry && (
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    )}
  </div>
);

export default UnavailableState;
