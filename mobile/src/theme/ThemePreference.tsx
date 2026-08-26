import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ColorSchemeName, useColorScheme as useSystemColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = 'echoo.themePreference';

type ThemePreferenceContextValue = {
  colorScheme: NonNullable<ColorSchemeName>;
  preference: ThemePreference;
  setPreference: (nextPreference: ThemePreference) => Promise<void>;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

export function EchooThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;

    SecureStore.getItemAsync(THEME_PREFERENCE_KEY)
      .then((savedPreference) => {
        if (active && isThemePreference(savedPreference)) {
          setPreferenceState(savedPreference);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    await SecureStore.setItemAsync(THEME_PREFERENCE_KEY, nextPreference);
  }, []);

  const colorScheme = preference === 'system' ? systemScheme || 'light' : preference;

  const value = useMemo(
    () => ({ colorScheme, preference, setPreference }),
    [colorScheme, preference, setPreference]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useEchooColorScheme() {
  return useThemePreference().colorScheme;
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error('useThemePreference must be used inside EchooThemeProvider');
  }
  return context;
}
