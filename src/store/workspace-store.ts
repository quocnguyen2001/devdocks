import { create } from "zustand";
import * as ipc from "@/lib/workspace-ipc";
import type { Workspace } from "@/types/workspace";

// Frontend view/cache mirroring the Rust source of truth. All mutations go
// through the Rust commands; local state updates optimistically on success.
interface WorkspaceStore {
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  save: (workspace: Workspace) => Promise<Workspace>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Workspace>;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await ipc.listWorkspaces();
      set({ workspaces, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  save: async (workspace) => {
    const saved = await ipc.saveWorkspace(workspace);
    set((s) => {
      const exists = s.workspaces.some((w) => w.id === saved.id);
      return {
        workspaces: exists
          ? s.workspaces.map((w) => (w.id === saved.id ? saved : w))
          : [...s.workspaces, saved],
      };
    });
    return saved;
  },

  remove: async (id) => {
    await ipc.deleteWorkspace(id);
    set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) }));
  },

  duplicate: async (id) => {
    const dup = await ipc.duplicateWorkspace(id);
    set((s) => ({ workspaces: [...s.workspaces, dup] }));
    return dup;
  },
}));
