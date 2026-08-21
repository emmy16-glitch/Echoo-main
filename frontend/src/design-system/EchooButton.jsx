import './button.css';

/**
 * EchooButton — primary / secondary / ghost action.
 * Variants: primary | secondary | ghost | danger
 * Sizes:    sm | md | lg
 */
const EchooButton = ({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  className = '',
  type = 'button',
  children,
  ...props
}) => (
  <button
    type={type}
    className={`echoo-ds-btn echoo-ds-btn--${variant} echoo-ds-btn--${size} ${className}`.trim()}
    {...props}
  >
    {icon && <span className="echoo-ds-btn__icon" aria-hidden="true">{icon}</span>}
    {children && <span className="echoo-ds-btn__label">{children}</span>}
    {iconRight && <span className="echoo-ds-btn__icon echoo-ds-btn__icon--right" aria-hidden="true">{iconRight}</span>}
  </button>
);

export default EchooButton;
