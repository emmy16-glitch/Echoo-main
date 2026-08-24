import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  FaBars,
  FaBell,
  FaBookOpen,
  FaBroadcastTower,
  FaCog,
  FaCompass,
  FaDownload,
  FaHistory,
  FaHome,
  FaListUl,
  FaSearch,
  FaSignOutAlt,
  FaTimes,
  FaUsers,
} from 'react-icons/fa';

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const clearEchooSession = () => {
  [
    'accessToken',
    'refreshToken',
    'token',
    'user',
    'profileImage',
    'profileBio',
    'echooRole',
    'echooProfileCompleted',
    'echooOnboardingCompleted',
    'creatorSetup',
  ].forEach((key) => localStorage.removeItem(key));

  sessionStorage.clear();
};

// Keep exactly four persistent listener destinations. Together with More this
// matches the five-column mobile bar in the product stylesheet, so no control
// wraps below the fixed navigation viewport.
const primaryItems = [
  { label: 'Home', path: '/listen', icon: FaHome, end: true },
  { label: 'Live now', path: '/listen/live', icon: FaBroadcastTower },
  { label: 'Stations', path: '/listen/stations', icon: FaCompass },
  { label: 'Library', path: '/listen/library', icon: FaBookOpen, end: true },
];

const moreItems = [
  { label: 'Search', path: '/listen/search', icon: FaSearch },
  { label: 'Following', path: '/listen/library/following', icon: FaUsers },
  { label: 'Playlist', path: '/listen/playlist', icon: FaListUl },
  { label: 'History', path: '/listen/history', icon: FaHistory },
  { label: 'Downloads', path: '/listen/downloads', icon: FaDownload },
  { label: 'Notifications', path: '/listen/notifications', icon: FaBell },
  { label: 'Settings', path: '/listen/settings', icon: FaCog },
];

const EchooMobileNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = readUser();

  const isListenerRoute = location.pathname.startsWith('/listen');
  const isMoreRoute = moreItems.some((item) =>
    location.pathname.startsWith(item.path)
  );

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.documentElement.classList.add('echoo-mobile-sheet-open');
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.documentElement.classList.remove('echoo-mobile-sheet-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (!isListenerRoute) return null;

  const displayName =
    user.displayName || user.fullname || user.username || 'Echoo Listener';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'E';
  const profileImage =
    user.profileImage || user.avatar || localStorage.getItem('profileImage') || '';
  const role = user.userType || localStorage.getItem('echooRole') || 'listener';

  const go = (path) => {
    setMenuOpen(false);
    navigate(path);
  };

  const logout = () => {
    clearEchooSession();
    window.location.replace('/');
  };

  return (
    <>
      <nav className="echoo-mobile-nav" aria-label="Echoo mobile navigation">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'echoo-mobile-nav-item active' : 'echoo-mobile-nav-item'
              }
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          className={`echoo-mobile-nav-item ${menuOpen || isMoreRoute ? 'active' : ''}`}
          onClick={() => setMenuOpen((current) => !current)}
          aria-expanded={menuOpen}
          aria-controls="echoo-mobile-more-sheet"
        >
          <FaBars aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="echoo-mobile-sheet" id="echoo-mobile-more-sheet">
          <button
            type="button"
            className="echoo-mobile-sheet-backdrop"
            aria-label="Close mobile menu"
            onClick={() => setMenuOpen(false)}
          />

          <section
            className="echoo-mobile-sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="echoo-mobile-menu-title"
          >
            <div className="echoo-mobile-sheet-handle" aria-hidden="true" />

            <header className="echoo-mobile-sheet-profile">
              <div className="echoo-mobile-sheet-avatar">
                {profileImage ? <img src={profileImage} alt="" /> : initial}
              </div>
              <div>
                <strong id="echoo-mobile-menu-title">{displayName}</strong>
                <span>{role === 'creator' ? 'Creator listening mode' : 'Listener'}</span>
              </div>
              <button
                type="button"
                className="echoo-mobile-sheet-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <FaTimes />
              </button>
            </header>

            <div className="echoo-mobile-sheet-links">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname.startsWith(item.path);
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={active ? 'active' : ''}
                    onClick={() => go(item.path)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              {role === 'creator' && (
                <button type="button" onClick={() => go('/creator-studio')}>
                  <FaBroadcastTower aria-hidden="true" />
                  <span>Creator Studio</span>
                </button>
              )}
            </div>

            <button
              type="button"
              className="echoo-mobile-sheet-logout"
              onClick={logout}
            >
              <FaSignOutAlt aria-hidden="true" />
              <span>Log out</span>
            </button>
          </section>
        </div>
      )}
    </>
  );
};

export default EchooMobileNavigation;
