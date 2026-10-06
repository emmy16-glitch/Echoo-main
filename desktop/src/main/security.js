'use strict';

const path = require('node:path');

const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const DEEP_LINK_ROOTS = new Set([
  'listen',
  'creator-studio',
  'login',
  'register',
  'reset-password',
]);

function normalizeExternalWebUrl(value) {
  try {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 2048) return null;
    const parsed = new URL(raw);
    if (!WEB_PROTOCOLS.has(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeExternalUrl(value) {
  try {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 2048 || /[\0\r\n]/.test(raw)) return null;
    const parsed = new URL(raw);
    if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
    if (WEB_PROTOCOLS.has(parsed.protocol)) return normalizeExternalWebUrl(raw);
    if (parsed.protocol === 'mailto:') {
      // Encoded CR/LF/NUL characters can otherwise become mail-header
      // injection after the operating system decodes the URI.
      let decoded;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        return null;
      }
      if (/[\0\r\n]/.test(decoded) || parsed.hash) return null;
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function isPathInside(rootPath, candidatePath) {
  const root = path.resolve(String(rootPath || ''));
  const candidate = path.resolve(String(candidatePath || ''));
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeRoute(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048 || raw.includes('\\') || /(?:^|\/)\.\.(?:\/|$)/.test(raw)) {
    return null;
  }

  try {
    const candidate = raw.startsWith('/') ? raw : `/${raw}`;
    const parsed = new URL(candidate, 'https://desktop.echoo.invalid');
    const firstSegment = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (!DEEP_LINK_ROOTS.has(firstSegment)) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function parseEchooDeepLink(value) {
  try {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 4096) return null;
    const decoded = decodeURIComponent(raw);
    if (/(?:^|\/)\.\.(?:\/|$)/.test(decoded)) return null;
    const parsed = new URL(raw);
    if (parsed.protocol !== 'echoo:') return null;

    if (parsed.hostname === 'open') {
      return normalizeRoute(parsed.searchParams.get('path'));
    }

    const host = parsed.hostname ? `/${parsed.hostname}` : '';
    return normalizeRoute(`${host}${parsed.pathname}${parsed.search}`);
  } catch {
    return null;
  }
}

function findEchooDeepLink(argv = []) {
  for (const value of argv) {
    const route = parseEchooDeepLink(value);
    if (route) return route;
  }
  return null;
}

module.exports = {
  findEchooDeepLink,
  isPathInside,
  normalizeExternalUrl,
  normalizeExternalWebUrl,
  normalizeRoute,
  parseEchooDeepLink,
};
