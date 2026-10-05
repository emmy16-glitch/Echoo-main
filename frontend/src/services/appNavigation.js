const normalizeAppRoute = (value) => {
  const raw = String(value || '').trim();
  if (
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\\\') ||
    /(?:^|\/)\.\.(?:\/|$)/.test(raw)
  ) return '';

  try {
    const parsed = new URL(raw, 'https://echoo.local.invalid');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '';
  }
};

export const isDesktopRouteRuntime = () =>
  typeof window !== 'undefined' &&
  (
    window.echooDesktop?.isDesktop === true ||
    window.location.protocol === 'echoo-app:' ||
    window.location.protocol === 'file:'
  );

export const assignAppRoute = (value) => {
  if (typeof window === 'undefined') return false;
  const route = normalizeAppRoute(value);
  if (!route) return false;

  if (isDesktopRouteRuntime()) {
    window.location.hash = `#${route}`;
  } else {
    window.location.assign(route);
  }
  return true;
};
