import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiChevronDown, FiHelpCircle, FiLogOut, FiSettings } from 'react-icons/fi';

import { api } from '../../services/api';
import { resolveExperienceSwitch } from '../../services/accountExperience';
import './AccountExperienceMenu.css';

const identityOf = (user = {}) => (
  user.username || user.displayName || user.fullname || user.name || 'Echoo account'
);

const imageOf = (user = {}) => (
  user.avatar || user.profileImage || null
);

const AccountAvatar = ({ image, name, className = '' }) => (
  <span className={className}>
    {image ? <img src={image} alt="" /> : name.charAt(0).toUpperCase() || 'E'}
  </span>
);

export function EchooModeSwitcher({
  activeMode,
  disabled = false,
  onSwitch,
}) {
  return (
    <div className="echoo-mode-switcher" role="tablist" aria-label="Echoo mode">
      {[
        ['creator', 'Creator'],
        ['listener', 'Listener'],
      ].map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={activeMode === mode}
          className={activeMode === mode ? 'is-active' : ''}
          disabled={disabled}
          onClick={() => onSwitch?.(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function AccountExperienceMenu({
  currentExperience,
  user,
  profileImage = null,
  variant = 'creator',
  onUserChange,
  onNotifications,
  unreadNotifications = 0,
  onSettings,
  onHelp,
}) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const firstItemRef = useRef(null);
  const dropdownRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  const name = identityOf(user);
  const image = profileImage || imageOf(user);
  const roleLabel = currentExperience === 'creator' ? 'Creator' : 'Listener';

  useEffect(() => {
    const closeOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape' || !open) return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => firstItemRef.current?.focus());
  }, [open]);

  const toggle = () => {
    setError('');
    setOpen((current) => !current);
  };

  const switchExperience = async (targetExperience) => {
    if (switching) return;
    try {
      setSwitching(true);
      setError('');
      const result = await resolveExperienceSwitch(targetExperience);
      onUserChange?.(result.user);
      setOpen(false);
      navigate(result.route, { replace: true });
    } catch {
      setError('Unable to switch right now. Try again.');
    } finally {
      setSwitching(false);
    }
  };

  const signOut = async () => {
    if (switching) return;
    try {
      setSwitching(true);
      await api.auth.logout();
    } finally {
      setOpen(false);
      navigate('/', { replace: true });
    }
  };

  const navigateMenu = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...(dropdownRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
    if (!items.length) return;
    event.preventDefault();
    if (event.key === 'Home') return items[0].focus();
    if (event.key === 'End') return items.at(-1).focus();
    const currentIndex = Math.max(0, items.indexOf(document.activeElement));
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    items[(currentIndex + direction + items.length) % items.length].focus();
  };

  return (
    <div className={`echoo-account-toolbar account-experience-menu account-experience-menu--${variant}`} ref={rootRef}>
      <EchooModeSwitcher
        activeMode={currentExperience}
        disabled={switching}
        onSwitch={(mode) => {
          if (mode === currentExperience) return;
          switchExperience(mode);
        }}
      />
      <button
        type="button"
        className="echoo-account-toolbar__notification"
        onClick={onNotifications}
        aria-label={`Notifications${unreadNotifications ? ', unread notifications' : ''}`}
      >
        <FiBell aria-hidden="true" />
        {unreadNotifications > 0 && <span aria-hidden="true" />}
      </button>
      <button
        type="button"
        ref={triggerRef}
        className={`account-experience-trigger ${variant === 'creator' ? 'studio-header-profile' : 'studio-account-button'}`}
        aria-label={`Open ${currentExperience} account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <AccountAvatar image={image} name={name} className="top-avatar" />
        <span className="account-experience-trigger-copy">
          <strong>{name}</strong>
          <small>{roleLabel}</small>
        </span>
        <FiChevronDown className={`account-experience-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="account-experience-dropdown"
          role="menu"
          aria-label={`${currentExperience} account menu`}
          onKeyDown={navigateMenu}
        >
          <div className="account-experience-identity">
            <AccountAvatar image={image} name={name} className="top-avatar" />
            <span>
              <strong>{name}</strong>
              <small>{roleLabel}</small>
            </span>
          </div>
          {error && <p className="account-experience-error" role="alert">{error}</p>}
          <div className="account-experience-divider" />
          <button
            type="button"
            role="menuitem"
            ref={firstItemRef}
            disabled={switching}
            onClick={() => {
              setOpen(false);
              onSettings?.();
            }}
          >
            <FiSettings aria-hidden="true" />
            <span>Settings</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={switching}
            onClick={() => {
              setOpen(false);
              (onHelp || onSettings)?.();
            }}
          >
            <FiHelpCircle aria-hidden="true" />
            <span>Help &amp; Support</span>
          </button>
          <div className="account-experience-divider" />
          <button
            type="button"
            role="menuitem"
            className="account-experience-signout"
            disabled={switching}
            onClick={signOut}
          >
            <FiLogOut aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
