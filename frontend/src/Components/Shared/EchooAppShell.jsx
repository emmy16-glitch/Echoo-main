import { NavLink } from 'react-router-dom';
import echooLogo from '../Assets/creator-logo.png';
import '../CreatorStudio/CreatorStudioShellFinal.css';
import '../../theme/EchooDesignSystem.css';
import './EchooAppShell.css';
import Header from './Header';
import Sidebar from './Sidebar';

const DefaultBrand = ({ role, roleLabel }) => {
  const homePath = role === 'listener' ? '/listen' : '/creator-studio';

  return (
    <NavLink to={homePath} className="studio-brand" aria-label={`Echoo ${roleLabel} home`}>
      <img src={echooLogo} alt="Echoo" className="studio-logo" />
      <div><h2>Echoo</h2><span>{roleLabel}</span></div>
    </NavLink>
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
    <Sidebar
      role={role}
      roleLabel={roleLabel}
      brand={brand || <DefaultBrand role={role} roleLabel={roleLabel} />}
      navItems={navItems}
      navGroups={navGroups}
      activeKey={activeKey}
      onNavigate={onNavigate}
      footer={sidebarFooter}
    />

    <main id="echoo-main-content" tabIndex="-1" className="studio-main echoo-app-main">
      <Header search={search} actions={topActions} />

      {alerts}
      <div className="studio-view echoo-app-view">{children}</div>
      {footer || <footer className="studio-footer" />}
    </main>

    {persistentSlot}
    {overlaySlot}
  </div>
);

export default EchooAppShell;
