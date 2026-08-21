import { forwardRef } from 'react';

import './SharedPrimitives.css';

const Button = forwardRef(({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...props
}, ref) => (
  <Component
    ref={ref}
    type={Component === 'button' ? type : undefined}
    className={`echoo-ui-button echoo-ui-button--${variant} echoo-ui-button--${size} ${className}`.trim()}
    {...props}
  >
    {children}
  </Component>
));

Button.displayName = 'Button';

export default Button;
