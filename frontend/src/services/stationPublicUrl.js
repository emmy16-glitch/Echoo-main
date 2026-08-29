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

export const getPublicStationUrl = (station, options = {}) => {
  const path = getPublicStationPath(station);
  if (!path) return '';

  const configuredOrigin = options.configuredOrigin
    ?? import.meta.env?.VITE_PUBLIC_APP_ORIGIN;
  const browserOrigin = options.browserOrigin
    ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const origin = normalizePublicOrigin(configuredOrigin)
    || normalizePublicOrigin(browserOrigin);

  return origin ? new URL(path, origin).toString() : '';
};

export const copyTextToClipboard = async (
  text,
  {
    navigatorRef = typeof navigator !== 'undefined' ? navigator : null,
    documentRef = typeof document !== 'undefined' ? document : null,
  } = {}
) => {
  if (!text) throw new Error('Nothing to copy');

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
