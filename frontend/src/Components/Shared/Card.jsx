const Card = ({
  as: Component = 'section',
  variant = 'default',
  interactive = false,
  className = '',
  children,
  ...props
}) => (
  <Component
    className={`echoo-ui-card echoo-ui-card--${variant}${interactive ? ' echoo-ui-card--interactive' : ''} ${className}`.trim()}
    {...props}
  >
    {children}
  </Component>
);

export default Card;
