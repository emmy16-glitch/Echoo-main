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

const isSecureBrowserPage = () =>
  isBrowser() && window.location.protocol === 'https:';

const publicLiveKitConfigurationError = () =>
  new Error(
    'Echoo is open through HTTPS, but LiveKit is still configured as a local ws:// server. Public testing requires a public wss:// LiveKit endpoint (for example LiveKit Cloud).'
  );

/**
 * Resolve the LiveKit websocket URL from the point of view of the browser.
 *
 * Local/LAN development:
 * - backend may use ws://127.0.0.1:7880
 * - another device may open Vite through http://<LAN-IP>:5174
 * - in that case only, replace the loopback hostname with the LAN hostname.
 *
 * Public HTTPS:
 * - never rewrite a local ws:// URL to the website/tunnel hostname
 * - HTTPS pages require an explicit public wss:// LiveKit endpoint
 * - Cloudflare/Vite tunnels do not automatically expose LiveKit WebRTC media
 *
 * Explicit non-loopback production URLs are never rewritten.
 */
export const resolveLiveKitUrl = (configuredUrl = '') => {
  const fallback = import.meta.env.VITE_LIVEKIT_URL || '';
  const raw = String(configuredUrl || fallback || '').trim();

  if (!raw || !isBrowser()) return raw;

  try {
    const parsed = new URL(raw);
    const pageHost = window.location.hostname;

    if (isSecureBrowserPage()) {
      if (parsed.protocol !== 'wss:' || isLoopbackHost(parsed.hostname)) {
        throw publicLiveKitConfigurationError();
      }

      return parsed.toString().replace(/\/$/, '');
    }

    if (
      isLoopbackHost(parsed.hostname) &&
      pageHost &&
      !isLoopbackHost(pageHost)
    ) {
      parsed.hostname = pageHost;
    }

    return parsed.toString().replace(/\/$/, '');
  } catch (error) {
    if (error?.message?.startsWith('Echoo is open through HTTPS')) {
      throw error;
    }

    return raw;
  }
};

export default resolveLiveKitUrl;
