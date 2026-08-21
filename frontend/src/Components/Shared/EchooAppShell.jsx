import { NavLink } from 'react-router-dom';
import echooLogo from '../Assets/creator-logo.png';
import '../CreatorStudio/CreatorStudioShellFinal.css';
import './EchooAppShell.css';

const DefaultBrand = ({ role, roleLabel }) => {
  const homePath = role === 'listener' ? '/listen' : '/creator-studio';

  return (
    <NavLink to={homePath} className="studio-brand" aria-label={`Echoo ${roleLabel} home`}>
      <img src={echooLogo} alt="Echoo" className="studio-logo" />
      <div><h2>Echoo</h2><span>{roleLabel}</span></div>
    </NavLink>
  );
};

const navigationContent = (item) => (
  <>
    <span className="studio-nav-icon">{item.icon}</span>
    <span className="studio-nav-label">{item.label || item.name}</span>
  </>
);

const SharedNavItem = ({ item, activeKey, onNavigate }) => {
  const destination = item.to || item.path;
  const active = Boolean(item.active) || item.key === activeKey || item.name === activeKey || destination === activeKey;
  const className = `studio-nav-item${active ? ' active' : ''}`;
  const label = item.label || item.name;

  if (destination) {
    return (
      <NavLink
        to={destination}
        end={item.end}
        className={className}
        aria-label={label}
        title={label}
        onClick={item.onClick}
      >
        {navigationContent(item)}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      onClick={() => onNavigate?.(item.key || item.name)}
    >
      {navigationContent(item)}
    </button>
  );
};

const EchooAppShell = ({
  role = 'creator',
  roleLabel = role === 'listener' ? 'Listener' : 'Creator Studio',
  navItems = [],
  navGroups = [],
  activeKey = '',
  onNavigate,
  brand,
  search,
  topActions,
  sidebarFooter,
  alerts,
  children,
  persistentSlot,
  overlaySlot,
  footer,
  className = '',
}) => (
  <div className={`studio-final-shell echoo-app-shell echoo-app-shell--${role} ${className}`.trim()}>
    <aside className="studio-sidebar echoo-app-sidebar">
      <div className="studio-sidebar-head">
        {brand || <DefaultBrand role={role} roleLabel={roleLabel} />}
      </div>

      <nav className="studio-navigation echoo-app-navigation" aria-label={`${roleLabel} navigation`}>
        {navItems.map((item) => (
          <SharedNavItem key={item.key || item.name || item.to} item={item} activeKey={activeKey} onNavigate={onNavigate} />
        ))}
        {navGroups.map((group) => (
          <div className="echoo-app-nav-group" key={group.key || group.label}>
            {group.label && <span className="echoo-app-nav-group-label">{group.label}</span>}
            {group.items?.map((item) => (
              <SharedNavItem key={item.key || item.name || item.to} item={item} activeKey={activeKey} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      {sidebarFooter}
    </aside>

    <main id="echoo-main-content" tabIndex="-1" className="studio-main echoo-app-main">
      <header className="studio-topbar studio-topbar-final echoo-app-topbar">
        {search}
        <div className="studio-top-actions">{topActions}</div>
      </header>

      {alerts}
      <div className="studio-view echoo-app-view">{children}</div>
      {footer || <footer className="studio-footer" />}
    </main>

    {persistentSlot}
    {overlaySlot}
  </div>
);

export default EchooAppShell;
