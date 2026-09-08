// Helpers for describing a sign-in event in human-readable terms so security
// notification emails can say "Chrome · Nigeria" instead of a raw user-agent
// string or an IP address. No geo-IP lookup is performed here; the optional
// Cloudflare country header (cf-ipcountry) is used when present, otherwise the
// location is reported as unknown.

export function describeUserAgent(userAgent = '') {
  const ua = String(userAgent || '');
  if (!ua) return 'Unknown device';

  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Chromium/i.test(ua)) return 'Chromium';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  if (/Android/i.test(ua)) return 'Android browser';
  return 'Unknown device';
}

export function countryFromRequest(req) {
  const header = req?.headers?.['cf-ipcountry'];
  const value = header ? String(header).trim() : '';
  return value || null;
}
