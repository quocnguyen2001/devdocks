import { create } from "zustand";
import { listInstalledApps, type InstalledApp } from "@/lib/apps-ipc";

// Read-only frontend cache of installed apps (Rust owns the scan). Fetched once
// when a workflow editor mounts; the "Open app" step reads `apps` for its
// pick-or-type datalist. Best-effort: on failure `apps` stays empty and the
// field degrades to a plain text input.
interface InstalledAppsStore {
  apps: InstalledApp[];
  loaded: boolean;
  fetch: () => Promise<void>;
}

export const useInstalledAppsStore = create<InstalledAppsStore>((set, get) => ({
  apps: [],
  loaded: false,

  fetch: async () => {
    // Fetch once per session; the installed-app set rarely changes mid-session.
    if (get().loaded) return;
    try {
      const apps = await listInstalledApps();
      set({ apps, loaded: true });
    } catch {
      // Leave `apps` empty (field falls back to plain text) but mark loaded so
      // we don't hammer a failing command on every editor mount.
      set({ loaded: true });
    }
  },
}));
