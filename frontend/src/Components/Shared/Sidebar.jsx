import { NavLink } from 'react-router-dom';

import './SharedPrimitives.css';

const navigationContent = (item) => (
  <>
    <span className="studio-nav-icon">{item.icon}</span>
    <span className="studio-nav-label">{item.label || item.name}</span>
  </>
);

const SharedNavItem = ({ item, activeKey, onNavigate }) => {
  const destination = item.to || item.path;
  const explicitActive =
    Boolean(item.active) ||
    item.key === activeKey ||
    item.name === activeKey ||
    destination === activeKey;
  const label = item.label || item.name;

  if (destination) {
    return (
      <NavLink
        to={destination}
        end={item.end}
        className={({ isActive }) =>
          `studio-nav-item${isActive || explicitActive ? ' active' : ''}`
        }
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
      className={`studio-nav-item${explicitActive ? ' active' : ''}`}
      aria-label={label}
      title={label}
      onClick={() => onNavigate?.(item.key || item.name)}
    >
      {navigationContent(item)}
    </button>
  );
};

const Sidebar = ({
  role = 'creator',
  roleLabel = 'Echoo',
  brand,
  navItems = [],
  navGroups = [],
  activeKey = '',
  onNavigate,
  footer,
  className = '',
}) => (
  <aside className={`studio-sidebar echoo-app-sidebar echoo-app-sidebar--${role} ${className}`.trim()}>
    <div className="studio-sidebar-head">
      {brand || <span className="echoo-sidebar-brand-fallback">{roleLabel}</span>}
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
    {footer}
  </aside>
);

export { SharedNavItem };
export default Sidebar;
