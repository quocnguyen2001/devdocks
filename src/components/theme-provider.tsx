import { useEffect, type ReactNode } from "react";
import { useSettingsStore } from "@/store/settings-store";
import type { Theme } from "@/types/theme";

function applyTheme(theme: Theme, systemPrefersDark: boolean): void {
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark);
  document.documentElement.classList.toggle("dark", isDark);
}

/**
 * Applies the selected theme to <html> and keeps it in sync with the OS
 * appearance while "system" is active. Hydrates persisted settings on mount.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  const hydrate = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme(theme, media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return <>{children}</>;
}
