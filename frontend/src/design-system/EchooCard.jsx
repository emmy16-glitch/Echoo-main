import './card.css';

/**
 * EchooCard — the standard surface container.
 * Variants: default | soft | outlined
 * interactive adds hover lift + focus ring.
 */
const EchooCard = ({
  as: Component = 'section',
  variant = 'default',
  interactive = false,
  className = '',
  children,
  ...props
}) => (
  <Component
    className={`echoo-ds-card echoo-ds-card--${variant}${interactive ? ' echoo-ds-card--interactive' : ''} ${className}`.trim()}
    {...props}
  >
    {children}
  </Component>
);

export default EchooCard;
