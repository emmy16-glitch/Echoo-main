import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { nextTheme, readThemePreference, readThemePreview, THEME_STORAGE_KEY, type EchooTheme } from "@/lib/themePreference";

type Theme = EchooTheme;

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const transitionTimer = useRef<number | undefined>(undefined);
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable && typeof window !== "undefined") {
      const previewTheme = readThemePreview(new URLSearchParams(window.location.search).get("theme"));
      if (previewTheme) return previewTheme;
      return readThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY), defaultTheme);
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme, switchable]);

  useEffect(() => () => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
  }, []);

  const toggleTheme = switchable
    ? () => {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const root = document.documentElement;
        if (!reducedMotion) {
          if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
          root.classList.remove("theme-transition");
          void root.offsetWidth;
          root.classList.add("theme-transition");
          transitionTimer.current = window.setTimeout(() => {
            root.classList.remove("theme-transition");
          }, 260);
        }
        setTheme(nextTheme);
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
