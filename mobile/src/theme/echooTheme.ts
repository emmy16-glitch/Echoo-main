export const lightColors = {
  blue: '#2F63F6',
  blueHover: '#2354DB',
  blueDeep: '#163FA8',
  blueSoft: '#EEF3FF',
  background: '#F6F8FC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F2F5FA',
  ink: '#0B1530',
  ink2: '#263451',
  muted: '#6D7891',
  faint: '#98A2B5',
  line: '#E3E8F0',
  lineStrong: '#D4DBE7',
  card: '#FFFFFF',
  paper: '#F6F8FC',
  night: '#081126',
  night2: '#101B35',
  cyan: '#2F63F6',
  green: '#0AA56D',
  red: '#F04438',
  amber: '#F59E0B',
  tab: '#FFFFFF',
  tabInactive: '#7A859B',
  glass: 'rgba(255,255,255,0.82)',
};

export const darkColors = {
  blue: '#4B7BFF',
  blueHover: '#6B92FF',
  blueDeep: '#2F63F6',
  blueSoft: '#142044',
  background: '#071126',
  surface: '#0C1730',
  surfaceRaised: '#101C37',
  surfaceMuted: '#111D36',
  ink: '#F7F9FF',
  ink2: '#D4DBE8',
  muted: '#9EA9BE',
  faint: '#758099',
  line: '#1D2B47',
  lineStrong: '#2A3957',
  card: '#0C1730',
  paper: '#071126',
  night: '#061022',
  night2: '#0C1730',
  cyan: '#4B7BFF',
  green: '#1BC88A',
  red: '#FF5A52',
  amber: '#F8B84A',
  tab: '#09142A',
  tabInactive: '#8490A7',
  glass: 'rgba(12,23,48,0.88)',
};

// Backward-compatible default palette for older listener/creator screens.
export const colors = lightColors;

export const getEchooColors = (scheme?: 'light' | 'dark' | null) =>
  scheme === 'dark' ? darkColors : lightColors;

export type EchooColors = typeof lightColors;

export const shadow = {
  shadowColor: '#101828',
  shadowOpacity: 0.08,
  shadowRadius: 28,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};
