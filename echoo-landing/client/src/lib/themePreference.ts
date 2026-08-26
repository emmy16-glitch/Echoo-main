export type EchooTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "echoo-theme";

export function readThemePreference(value: string | null, fallback: EchooTheme = "light"): EchooTheme {
  return value === "dark" || value === "light" ? value : fallback;
}

export function readThemePreview(value: string | null): EchooTheme | null {
  return value === "dark" || value === "light" ? value : null;
}

export function nextTheme(theme: EchooTheme): EchooTheme {
  return theme === "light" ? "dark" : "light";
}
