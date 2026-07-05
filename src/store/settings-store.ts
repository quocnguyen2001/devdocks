import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { Theme } from "@/types/theme";

// App-level settings persist via tauri-plugin-store (a small key-value file).
// Workspace configs are NOT stored here — they are JSON files owned by Rust.
const STORE_FILE = "settings.json";
const THEME_KEY = "theme";

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
  /** True once persisted settings have been read at least once. */
  hydrated: boolean;
  /** True once the user has explicitly chosen a theme this session. */
  touched: boolean;
  hydrate: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "system",
  hydrated: false,
  touched: false,

  hydrate: async () => {
    if (get().hydrated) return; // idempotent under StrictMode double-mount
    try {
      const store = await settingsStore();
      const saved = await store.get<Theme>(THEME_KEY);
      // Never overwrite a theme the user picked while hydrate was in flight.
      set((s) =>
        s.touched
          ? { hydrated: true }
          : { theme: saved ?? "system", hydrated: true },
      );
      mirrorThemeHint(get().theme);
    } catch {
      // Persistence unavailable (e.g. non-Tauri context) — keep default.
      set({ hydrated: true });
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
}));
