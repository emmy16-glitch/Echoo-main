import './SharedPrimitives.css';

const imageClass = (kind, className = '') => `echoo-ui-image echoo-ui-image--${kind} ${className}`.trim();

const HeroImage = ({ className = '', ...props }) => (
  <img className={imageClass('hero', className)} {...props} />
);

const CardImage = ({ className = '', ...props }) => (
  <img className={imageClass('card', className)} {...props} />
);

const Thumbnail = ({ className = '', ...props }) => (
  <img className={imageClass('thumbnail', className)} {...props} />
);

const AvatarImage = ({ className = '', ...props }) => (
  <img className={imageClass('avatar', className)} {...props} />
);

export { HeroImage, CardImage, Thumbnail, AvatarImage };
