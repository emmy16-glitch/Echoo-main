const THEME_KEY = 'echooThemePreference';
const VALID = new Set(['light', 'dark', 'system']);

let mediaQuery = null;
let mediaListener = null;

export const normalizeThemePreference = (value) =>
  VALID.has(value) ? value : 'system';

export const getCachedThemePreference = () => {
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
};

export const resolveThemePreference = (preference = 'system') => {
  const normalized = normalizeThemePreference(preference);
  if (normalized !== 'system') return normalized;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const applyEchooTheme = (preference = 'system', { persist = true } = {}) => {
  const normalized = normalizeThemePreference(preference);
  const resolved = resolveThemePreference(normalized);

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.echooThemePreference = normalized;
    document.documentElement.dataset.echooTheme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, normalized);
    } catch {
      // The document still receives the theme when storage is unavailable.
    }
  }

  return resolved;
};

export const initializeEchooTheme = () => {
  const preference = getCachedThemePreference();
  applyEchooTheme(preference, { persist: false });

  if (typeof window === 'undefined' || !window.matchMedia) return;
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaListener = () => {
    if (getCachedThemePreference() === 'system') {
      applyEchooTheme('system', { persist: false });
    }
  };

  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', mediaListener);
  else mediaQuery.addListener?.(mediaListener);
};

export const syncThemeFromAccount = (preference) =>
  applyEchooTheme(normalizeThemePreference(preference), { persist: true });
