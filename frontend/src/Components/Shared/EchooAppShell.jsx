import { NavLink } from 'react-router-dom';
import creatorLogo from '../Assets/creator-logo.png';
import echooOfficialLogo from '../Assets/echoo-logo-official.svg';
import '../CreatorStudio/CreatorStudioShellFinal.css';
import '../../theme/EchooDesignSystem.css';
import './EchooAppShell.css';
import Header from './Header';
import Sidebar from './Sidebar';

const DefaultBrand = ({ role, roleLabel }) => {
  const homePath = role === 'listener' ? '/listen' : '/creator-studio';
  const isListener = role === 'listener';
  const logoSrc = isListener ? echooOfficialLogo : creatorLogo;

  return (
    <NavLink
      to={homePath}
      className={`studio-brand ${isListener ? 'studio-brand--listener' : 'studio-brand--creator'}`.trim()}
      aria-label={`Echoo ${roleLabel} home`}
    >
      <span className="studio-brand-icon" aria-hidden="true">
        <img src={logoSrc} alt="" />
      </span>
      <span className="studio-brand-copy">
        <strong>Echoo</strong>
        <small>{roleLabel}</small>
      </span>
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
