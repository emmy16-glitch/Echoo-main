const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

const isBrowser = () =>
  typeof window !== 'undefined' && Boolean(window.location);

const isLoopbackHost = (host = '') =>
  LOOPBACK_HOSTS.has(String(host).toLowerCase());

/**
 * Resolve the LiveKit websocket URL from the point of view of the browser.
 *
 * In local development the backend often talks to LiveKit through
 * 127.0.0.1:7880. That address is correct for the backend, but it is wrong for
 * a listener opening Vite from another phone/laptop on the LAN: 127.0.0.1 on
 * that device points back to the listener device itself. When Echoo is opened
 * through a non-loopback host, transparently replace only a loopback LiveKit
 * hostname with the browser-visible host while preserving the configured port.
 *
 * Explicit non-loopback production/domain URLs are never rewritten.
 */
export const resolveLiveKitUrl = (configuredUrl = '') => {
  const fallback = import.meta.env.VITE_LIVEKIT_URL || '';
  const raw = String(configuredUrl || fallback || '').trim();

  if (!raw || !isBrowser()) return raw;

  try {
    const parsed = new URL(raw);
    const pageHost = window.location.hostname;

    if (
      isLoopbackHost(parsed.hostname) &&
      pageHost &&
      !isLoopbackHost(pageHost)
    ) {
      parsed.hostname = pageHost;
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
};

export default resolveLiveKitUrl;
