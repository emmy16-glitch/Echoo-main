const ListItem = ({
  as: Component = 'div',
  interactive = false,
  className = '',
  children,
  ...props
}) => (
  <Component
    className={`echoo-ui-list-item${interactive ? ' echoo-ui-list-item--interactive' : ''} ${className}`.trim()}
    {...props}
  >
    {children}
  </Component>
);

export default ListItem;
