const Badge = ({
  tone = 'neutral',
  size = 'sm',
  className = '',
  children,
  ...props
}) => (
  <span
    className={`echoo-ui-badge echoo-ui-badge--${tone} echoo-ui-badge--${size} ${className}`.trim()}
    {...props}
  >
    {children}
  </span>
);

export default Badge;
