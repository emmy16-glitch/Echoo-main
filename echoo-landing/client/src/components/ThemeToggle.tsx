import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-2 text-[0.61rem] font-black tracking-[0.12em] ${className}`}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      <span className="theme-toggle-icon flex h-6 w-6 items-center justify-center rounded-full">
        {isDark ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
      </span>
      <span className="hidden sm:inline">{isDark ? "LIGHT" : "DARK"}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
