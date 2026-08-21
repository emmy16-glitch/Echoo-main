import './badge.css';

/**
 * EchooBadge — status pill.
 * Tones: live | transcript | neutral | blue | verified | success
 * Sizes: sm | md
 */
const EchooBadge = ({
  tone = 'neutral',
  size = 'sm',
  icon,
  className = '',
  children,
  ...props
}) => (
  <span
    className={`echoo-ds-badge echoo-ds-badge--${tone} echoo-ds-badge--${size} ${className}`.trim()}
    {...props}
  >
    {icon && <span className="echoo-ds-badge__icon" aria-hidden="true">{icon}</span>}
    {children && <span className="echoo-ds-badge__label">{children}</span>}
  </span>
);

export default EchooBadge;
