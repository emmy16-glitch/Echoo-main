const THEME_KEY = 'echooThemePreference';
const PRODUCT_THEME = 'light';

// Echoo currently has one intentional product theme: the light blue/white
// visual system. A previous implementation followed the operating-system
// colour scheme, which could silently turn the listener experience dark even
// though there is no longer a theme control in the product UI.
export const normalizeThemePreference = () => PRODUCT_THEME;

export const getCachedThemePreference = () => PRODUCT_THEME;

export const resolveThemePreference = () => PRODUCT_THEME;

export const applyEchooTheme = (_preference = PRODUCT_THEME, { persist = true } = {}) => {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.echooThemePreference = PRODUCT_THEME;
    document.documentElement.dataset.echooTheme = PRODUCT_THEME;
    document.documentElement.style.colorScheme = PRODUCT_THEME;
  }

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, PRODUCT_THEME);
    } catch {
      // The document still receives the product theme when storage is unavailable.
    }
  }

  return PRODUCT_THEME;
};

export const initializeEchooTheme = () => {
  // Intentionally ignore prefers-color-scheme and any stale cached dark value.
  // Echoo should render consistently across creator and listener devices.
  applyEchooTheme(PRODUCT_THEME, { persist: true });
};

export const syncThemeFromAccount = () =>
  applyEchooTheme(PRODUCT_THEME, { persist: true });
