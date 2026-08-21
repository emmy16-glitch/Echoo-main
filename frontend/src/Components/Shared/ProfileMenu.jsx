import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaChevronDown, FaCog, FaSignOutAlt, FaUser } from 'react-icons/fa';

import Avatar from './Avatar';
import './SharedPrimitives.css';

const MENU_WIDTH = 232;
const VIEWPORT_GUTTER = 12;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ProfileMenu = ({
  displayName = 'Echoo user',
  roleLabel = 'Member',
  email = '',
  profileImage = null,
  placement = 'top',
  onAccount,
  onSettings,
  onLogout,
  settingsLabel = 'Settings',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const firstName = String(displayName || 'Echoo user').trim().split(/\s+/)[0] || 'Echoo';

  const updatePosition = useCallback(() => {
    const anchor = triggerRef.current;
    if (!anchor || typeof window === 'undefined') {
      setPosition(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER);
    if (placement === 'sidebar') {
      setPosition({
        left: clamp(rect.left, VIEWPORT_GUTTER, maxLeft),
        bottom: Math.max(VIEWPORT_GUTTER, window.innerHeight - rect.top + 10),
      });
      return;
    }
    setPosition({
      left: clamp(rect.right - MENU_WIDTH, VIEWPORT_GUTTER, maxLeft),
      top: Math.min(rect.bottom + 10, window.innerHeight - VIEWPORT_GUTTER),
    });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const closeAnd = (action) => {
    setOpen(false);
    action?.();
  };

  const menu = open && position && typeof document !== 'undefined'
    ? createPortal(
      <div
        className={`echoo-profile-menu echoo-profile-menu--${placement}`}
        role="menu"
        aria-label={`${roleLabel} account menu`}
        style={position}
      >
        <div className="echoo-profile-menu__identity">
          <Avatar src={profileImage} name={displayName} alt="" size="sm" />
          <span>
            <strong>{displayName}</strong>
            {email && <small>{email}</small>}
            <small>{roleLabel}</small>
          </span>
        </div>
        <div className="echoo-profile-menu__divider" />
        {onAccount && (
          <button type="button" role="menuitem" onClick={() => closeAnd(onAccount)}>
            <FaUser /> <span>Account</span>
          </button>
        )}
        {onSettings && (
          <button type="button" role="menuitem" onClick={() => closeAnd(onSettings)}>
            <FaCog /> <span>{settingsLabel}</span>
          </button>
        )}
        {onLogout && (
          <button type="button" role="menuitem" className="is-danger" onClick={() => closeAnd(onLogout)}>
            <FaSignOutAlt /> <span>Log out</span>
          </button>
        )}
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={rootRef} className={`echoo-profile-menu-wrap echoo-profile-menu-wrap--${placement} ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className={`echoo-profile-trigger echoo-profile-trigger--${placement}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar src={profileImage} name={displayName} alt="" size={placement === 'top' ? 'sm' : 'md'} />
        <span className="echoo-profile-trigger__copy">
          <strong>{placement === 'sidebar' ? firstName : displayName}</strong>
          <small>{roleLabel}</small>
        </span>
        <FaChevronDown className="echoo-profile-trigger__chevron" aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
};

export default ProfileMenu;
