import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import type { Theme } from "@/types/theme";
import type { FontFamily, UiScale } from "@/types/settings";

// App-level settings persist via tauri-plugin-store (a small key-value file).
// Workspace configs are NOT stored here — they are JSON files owned by Rust.
// Launch-at-login is NOT stored here: the autostart plugin's LaunchAgent is the
// source of truth (read via isEnabled()).
const STORE_FILE = "settings.json";
const THEME_KEY = "theme";
const FONT_KEY = "fontFamily";
const SCALE_KEY = "uiScale";

let storePromise: Promise<Store> | null = null;
function settingsStore(): Promise<Store> {
  if (!storePromise)
    storePromise = load(STORE_FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

// Mirror the resolved theme to localStorage as a synchronous paint-time hint for
// the inline script in index.html (prevents a flash-of-wrong-theme on cold
// start). tauri-plugin-store remains the source of truth.
function mirrorThemeHint(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Non-browser context — ignore.
  }
}

interface SettingsState {
  theme: Theme;
  fontFamily: FontFamily;
  uiScale: UiScale;
  /** Whether the app starts at login (mirrors the autostart LaunchAgent). */
  launchAtLogin: boolean;
  /** True once persisted settings have been read at least once. */
  hydrated: boolean;
  /** True once the user has explicitly chosen a theme this session. */
  touched: boolean;
  hydrate: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  setFontFamily: (font: FontFamily) => Promise<void>;
  setUiScale: (scale: UiScale) => Promise<void>;
  setLaunchAtLogin: (enabled: boolean) => Promise<void>;
  resetAppearance: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "system",
  fontFamily: "system",
  uiScale: "default",
  launchAtLogin: false,
  hydrated: false,
  touched: false,

  hydrate: async () => {
    if (get().hydrated) return; // idempotent under StrictMode double-mount
    try {
      const store = await settingsStore();
      const [savedTheme, savedFont, savedScale] = await Promise.all([
        store.get<Theme>(THEME_KEY),
        store.get<FontFamily>(FONT_KEY),
        store.get<UiScale>(SCALE_KEY),
      ]);
      // Never overwrite a theme the user picked while hydrate was in flight.
      set((s) => ({
        theme: s.touched ? s.theme : (savedTheme ?? "system"),
        fontFamily: savedFont ?? "system",
        uiScale: savedScale ?? "default",
        hydrated: true,
      }));
      mirrorThemeHint(get().theme);
    } catch {
      // Persistence unavailable (e.g. non-Tauri context) — keep defaults.
      set({ hydrated: true });
    }
    // Autostart status is owned by the OS LaunchAgent, read separately.
    try {
      set({ launchAtLogin: await isAutostartEnabled() });
    } catch {
      // Plugin unavailable (non-Tauri context) — leave default false.
    }
  },

  setTheme: async (theme) => {
    set({ theme, touched: true });
    mirrorThemeHint(theme);
    try {
      const store = await settingsStore();
      await store.set(THEME_KEY, theme);
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
  },

  setFontFamily: async (fontFamily) => {
    set({ fontFamily });
    try {
      await (await settingsStore()).set(FONT_KEY, fontFamily);
    } catch {
      /* non-fatal */
    }
  },

  setUiScale: async (uiScale) => {
    set({ uiScale });
    try {
      await (await settingsStore()).set(SCALE_KEY, uiScale);
    } catch {
      /* non-fatal */
    }
  },

  setLaunchAtLogin: async (enabled) => {
    // Optimistic: reflect immediately, revert if the OS call fails.
    const prev = get().launchAtLogin;
    set({ launchAtLogin: enabled });
    try {
      if (enabled) await enableAutostart();
      else await disableAutostart();
    } catch {
      set({ launchAtLogin: prev });
    }
  },

  resetAppearance: async () => {
    await Promise.all([
      get().setTheme("system"),
      get().setFontFamily("system"),
      get().setUiScale("default"),
    ]);
  },
}));
