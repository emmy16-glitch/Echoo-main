import { useCallback, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCog, FaSignOutAlt } from 'react-icons/fa';

import './CreatorAccountMenuPortal.css';
import './CreatorMediaSurfaces.css';

const MENU_WIDTH = 216;
const VIEWPORT_GUTTER = 12;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const CreatorAccountMenuPortal = ({
  open,
  anchorRef,
  placement = 'sidebar',
  onSettings,
  onLogout,
}) => {
  const [position, setPosition] = useState(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef?.current;
    if (!anchor || typeof window === 'undefined') {
      setPosition(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER);

    if (placement === 'top') {
      setPosition({
        left: clamp(rect.right - MENU_WIDTH, VIEWPORT_GUTTER, maxLeft),
        top: Math.min(rect.bottom + 10, window.innerHeight - VIEWPORT_GUTTER),
      });
      return;
    }

    setPosition({
      left: clamp(rect.left, VIEWPORT_GUTTER, maxLeft),
      bottom: Math.max(VIEWPORT_GUTTER, window.innerHeight - rect.top + 10),
    });
  }, [anchorRef, placement]);

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

  if (!open || !position || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`creator-account-popover creator-account-popover-${placement}`}
      data-creator-profile-popover
      role="menu"
      aria-label="Creator account menu"
      style={position}
    >
      <button type="button" role="menuitem" onClick={onSettings}>
        <FaCog />
        <span>Creator settings</span>
      </button>
      <button type="button" role="menuitem" className="danger" onClick={onLogout}>
        <FaSignOutAlt />
        <span>Log out</span>
      </button>
    </div>,
    document.body
  );
};

export default CreatorAccountMenuPortal;
