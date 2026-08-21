const Header = ({ search, actions, className = '', ...props }) => (
  <header className={`studio-topbar studio-topbar-final echoo-app-topbar echoo-app-header ${className}`.trim()} {...props}>
    {search}
    <div className="studio-top-actions echoo-app-header__actions">{actions}</div>
  </header>
);

export default Header;
