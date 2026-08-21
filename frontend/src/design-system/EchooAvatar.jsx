import './avatar.css';

/**
 * EchooAvatar — image avatar with initials fallback.
 * Sizes: sm | md | lg | xl
 */
const EchooAvatar = ({
  src,
  name = '',
  size = 'md',
  tone = 'brand',
  className = '',
  alt = '',
  ...props
}) => {
  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <span
      className={`echoo-ds-avatar echoo-ds-avatar--${size} echoo-ds-avatar--${tone} ${className}`.trim()}
      role="img"
      aria-label={alt || name || 'Avatar'}
      {...props}
    >
      {src ? (
        <img src={src} alt="" className="echoo-ds-avatar__img" loading="lazy" />
      ) : (
        <span className="echoo-ds-avatar__initials">{initials}</span>
      )}
    </span>
  );
};

export default EchooAvatar;
