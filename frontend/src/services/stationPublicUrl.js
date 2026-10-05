const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

const normalizePublicOrigin = (value) => {
  if (!value) return '';

  try {
    const url = new URL(String(value).trim());
    if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
};

export const getPublicStationPath = (station) => {
  if (!station || station.isPublic === false) return '';

  const identifier = String(station.slug || station.id || station._id || '').trim();
  if (!identifier) return '';

  return `/listen/stations/${encodeURIComponent(identifier)}`;
};

export const getPublicAppUrl = (path, options = {}) => {
  const rawPath = String(path || '').trim();
  if (!rawPath.startsWith('/')) return '';

  const configuredOrigin = options.configuredOrigin
    ?? import.meta.env?.VITE_PUBLIC_APP_ORIGIN;
  const browserOrigin = options.browserOrigin
    ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const origin = normalizePublicOrigin(configuredOrigin)
    || normalizePublicOrigin(browserOrigin);

  return origin ? new URL(rawPath, origin).toString() : '';
};

export const getPublicStationUrl = (station, options = {}) => {
  const path = getPublicStationPath(station);
  return path ? getPublicAppUrl(path, options) : '';
};

export const openPublicWebUrl = async (
  value,
  { windowRef = typeof window !== 'undefined' ? window : null } = {}
) => {
  if (!windowRef) throw new Error('A browser window is unavailable');

  let url = '';
  try {
    const raw = String(value || '').trim();
    url = raw.startsWith('/') ? getPublicAppUrl(raw) : new URL(raw).toString();
    const parsed = new URL(url);
    if (!HTTP_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('Unsafe public URL');
    }
  } catch {
    throw new Error('Could not open that public Echoo page.');
  }

  if (
    windowRef.echooDesktop?.isDesktop === true &&
    typeof windowRef.echooDesktop?.openExternalWebUrl === 'function'
  ) {
    const result = await windowRef.echooDesktop.openExternalWebUrl(url);
    if (!result?.opened) throw new Error(result?.error || 'Could not open the public page.');
    return true;
  }

  const opened = windowRef.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) throw new Error('The browser blocked the new page.');
  return true;
};

export const copyTextToClipboard = async (
  text,
  {
    navigatorRef = typeof navigator !== 'undefined' ? navigator : null,
    documentRef = typeof document !== 'undefined' ? document : null,
  } = {}
) => {
  if (!text) throw new Error('Nothing to copy');

  const nativeCopy =
    typeof window !== 'undefined' &&
    window.echooDesktop?.isDesktop === true &&
    typeof window.echooDesktop?.copyText === 'function'
      ? window.echooDesktop.copyText
      : null;
  if (nativeCopy) {
    const result = await nativeCopy(String(text));
    if (result?.copied) return;
  }

  if (navigatorRef?.clipboard?.writeText) {
    await navigatorRef.clipboard.writeText(text);
    return;
  }

  if (!documentRef?.body || typeof documentRef.execCommand !== 'function') {
    throw new Error('Clipboard access is unavailable');
  }

  const textArea = documentRef.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  documentRef.body.appendChild(textArea);
  textArea.select();

  const copied = documentRef.execCommand('copy');
  documentRef.body.removeChild(textArea);
  if (!copied) throw new Error('Clipboard access is unavailable');
};
