export const lightColors = {
  blue: '#4F7EC3',
  blueHover: '#5F8DD1',
  blueDeep: '#244A86',
  blueSoft: 'rgba(79,126,195,0.16)',
  background: '#FFFFFF',
  surface: '#F2F5F9',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#E9EEF5',
  ink: '#111827',
  ink2: '#243247',
  muted: '#667085',
  faint: '#98A2B3',
  line: 'rgba(17,24,39,0.08)',
  lineStrong: 'rgba(17,24,39,0.14)',
  card: '#FFFFFF',
  paper: '#FFFFFF',
  night: '#0B0F17',
  night2: '#16253A',
  cyan: '#2AA7A2',
  green: '#22C55E',
  red: '#D94A5E',
  amber: '#F59E0B',
  tab: 'rgba(255,255,255,0.96)',
  tabInactive: '#8A94A6',
  glass: 'rgba(255,255,255,0.92)',
};

export const darkColors = {
  blue: '#4F7EC3',
  blueHover: '#78A3DF',
  blueDeep: '#244A86',
  blueSoft: 'rgba(79,126,195,0.2)',
  background: '#020408',
  surface: '#0B0F17',
  surfaceRaised: '#111827',
  surfaceMuted: '#172033',
  ink: '#FFFFFF',
  ink2: '#E6EEF9',
  muted: '#A7B0C0',
  faint: '#6F7A8D',
  line: 'rgba(230,238,249,0.08)',
  lineStrong: 'rgba(230,238,249,0.16)',
  card: '#0B0F17',
  paper: '#020408',
  night: '#020408',
  night2: '#0E1A2B',
  cyan: '#2AA7A2',
  green: '#22C55E',
  red: '#E15A6B',
  amber: '#F8B84A',
  tab: 'rgba(2,4,8,0.96)',
  tabInactive: '#8792A5',
  glass: 'rgba(11,15,23,0.9)',
};
// Backward-compatible default palette for older listener/creator screens.
export const colors = lightColors;

export const getEchooColors = (scheme?: 'light' | 'dark' | null) =>
  scheme === 'dark' ? darkColors : lightColors;

export type EchooColors = typeof lightColors;

export const shadow = {
  shadowColor: '#0B1220',
  shadowOpacity: 0.1,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 10 },
  elevation: 5,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};
