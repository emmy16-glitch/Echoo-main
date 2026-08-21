const SIZE_CLASS = {
  xs: 'echoo-ui-avatar--xs',
  sm: 'echoo-ui-avatar--sm',
  md: 'echoo-ui-avatar--md',
  lg: 'echoo-ui-avatar--lg',
};

const Avatar = ({
  src,
  alt = '',
  name = '',
  size = 'md',
  className = '',
  ...props
}) => {
  const label = String(name || alt || 'E').trim();
  const initial = label.charAt(0).toUpperCase() || 'E';

  return (
    <span
      className={`echoo-ui-avatar ${SIZE_CLASS[size] || SIZE_CLASS.md} ${className}`.trim()}
      {...props}
    >
      {src ? <img src={src} alt={alt} /> : <span aria-hidden="true">{initial}</span>}
    </span>
  );
};

export default Avatar;
