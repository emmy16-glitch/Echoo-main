// Desktop relaunch should restore a stable workspace, not a transient room.
// Explicit echoo:// deep links are handled separately and may still open a
// specific live broadcast when the user intentionally launches one.
export const normalizeDesktopWorkspaceRoute = (value) => {
  const candidate = String(value || '').trim().slice(0, 2048);
  if (!/^\/(?:listen|creator-studio)(?:\/|\?|$)/.test(candidate)) return '';

  // A concrete live-room ID is ephemeral. Persist the stable Live Now surface
  // instead so a later normal launch cannot reopen an ended/stale broadcast.
  if (/^\/listen\/live\/[^/?#]+(?:[/?#]|$)/.test(candidate)) {
    return '/listen/live';
  }

  return candidate;
};
