import { useEffect, type ReactNode } from "react";
import { useSettingsStore } from "@/store/settings-store";
import { resolveFontStack, UI_SCALE_VALUES } from "@/types/settings";
import type { Theme } from "@/types/theme";

function applyTheme(theme: Theme, systemPrefersDark: boolean): void {
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark);
  document.documentElement.classList.toggle("dark", isDark);
}

/**
 * Applies the selected appearance (theme, font family, interface scale) to
 * <html> and keeps the theme in sync with the OS appearance while "system" is
 * active. Hydrates persisted settings on mount.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const uiScale = useSettingsStore((s) => s.uiScale);
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

  // Font family drives the `--app-font` var consumed by `body` in index.css.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font",
      resolveFontStack(fontFamily),
    );
  }, [fontFamily]);

  // Interface scale = a whole-UI zoom (text + spacing), like an editor's zoom.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "zoom",
      String(UI_SCALE_VALUES[uiScale]),
    );
  }, [uiScale]);

  return <>{children}</>;
}
