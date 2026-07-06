import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";

// Favorites are an index kept in tauri-plugin-store (keyed by workspace id), NOT
// in the workspace JSON. "Recent" is derived from workspace metadata.lastLaunched
// (authoritative), so no separate recents store is needed.
const STORE_FILE = "discovery.json";
const FAV_KEY = "favorites";

let storePromise: Promise<Store> | null = null;
function discoveryStore(): Promise<Store> {
  if (!storePromise)
    storePromise = load(STORE_FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

interface DiscoveryStore {
  favorites: string[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
}

export const useDiscoveryStore = create<DiscoveryStore>((set, get) => ({
  favorites: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const store = await discoveryStore();
      const favs = (await store.get<string[]>(FAV_KEY)) ?? [];
      set({ favorites: favs, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  toggleFavorite: async (id) => {
    const cur = get().favorites;
    const next = cur.includes(id)
      ? cur.filter((x) => x !== id)
      : [...cur, id];
    set({ favorites: next });
    try {
      const store = await discoveryStore();
      await store.set(FAV_KEY, next);
    } catch {
      /* non-fatal */
    }
  },
}));
