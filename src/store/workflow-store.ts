import { create } from "zustand";
import * as ipc from "@/lib/workflow-ipc";
import type { Workflow } from "@/types/workflow";

// Frontend view/cache mirroring the Rust source of truth. All mutations go
// through the Rust commands; local state updates optimistically on success.
interface WorkflowStore {
  workflows: Workflow[];
  isLoading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  save: (workflow: Workflow) => Promise<Workflow>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Workflow>;
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflows: [],
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const workflows = await ipc.listWorkflows();
      set({ workflows, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  save: async (workflow) => {
    const saved = await ipc.saveWorkflow(workflow);
    set((s) => {
      const exists = s.workflows.some((w) => w.id === saved.id);
      return {
        workflows: exists
          ? s.workflows.map((w) => (w.id === saved.id ? saved : w))
          : [...s.workflows, saved],
      };
    });
    return saved;
  },

  remove: async (id) => {
    await ipc.deleteWorkflow(id);
    set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) }));
  },

  duplicate: async (id) => {
    const dup = await ipc.duplicateWorkflow(id);
    set((s) => ({ workflows: [...s.workflows, dup] }));
    return dup;
  },
}));
