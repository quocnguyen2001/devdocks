import { create } from "zustand";
import * as ipc from "@/lib/launch-ipc";
import { notify } from "@/lib/notify";
import type { LaunchProgress, LaunchSummary, StepStatus } from "@/types/launch";
import type { Workspace } from "@/types/workspace";

interface StepState {
  stepId: string;
  kind: string;
  label: string;
  status: StepStatus;
  message?: string;
}

interface LaunchStore {
  runId: string | null;
  /** Most recently launched workspace, for best-effort before-close hooks. */
  lastLaunchedWorkspaceId: string | null;
  /** Workspace whose launch is currently in flight, for per-card spinner state.
   *  Cleared on both success and error (not in `finally`, which only unlistens). */
  launchingWorkspaceId: string | null;
  /** stepIds in arrival order, for stable rendering. */
  order: string[];
  steps: Record<string, StepState>;
  summary: LaunchSummary | null;
  isLaunching: boolean;
  error: string | null;
  launch: (workspace: Workspace) => Promise<void>;
  retry: (stepId: string) => Promise<void>;
}

function applyProgress(state: LaunchStore, p: LaunchProgress) {
  const known = p.stepId in state.steps;
  return {
    runId: p.runId,
    order: known ? state.order : [...state.order, p.stepId],
    steps: {
      ...state.steps,
      [p.stepId]: {
        stepId: p.stepId,
        kind: p.kind,
        label: p.label,
        status: p.status,
        message: p.message,
      },
    },
  };
}

export const useLaunchStore = create<LaunchStore>((set, get) => ({
  runId: null,
  lastLaunchedWorkspaceId: null,
  launchingWorkspaceId: null,
  order: [],
  steps: {},
  summary: null,
  isLaunching: false,
  error: null,

  launch: async (workspace) => {
    set({
      runId: null,
      lastLaunchedWorkspaceId: workspace.id,
      launchingWorkspaceId: workspace.id,
      order: [],
      steps: {},
      summary: null,
      isLaunching: true,
      error: null,
    });
    const unlistenProgress = await ipc.onLaunchProgress((p) =>
      set((s) => applyProgress(s, p)),
    );
    const unlistenDone = await ipc.onLaunchDone((summary) => set({ summary }));
    try {
      const summary = await ipc.launchWorkspace(workspace);
      set({ summary, isLaunching: false, launchingWorkspaceId: null });
      void notify(
        summary.partial ? "Workspace partially restored" : "Workspace launched",
        `${summary.ok} ok · ${summary.failed} failed · ${summary.skipped} skipped`,
      );
    } catch (e) {
      set({ error: String(e), isLaunching: false, launchingWorkspaceId: null });
    } finally {
      unlistenProgress();
      unlistenDone();
    }
  },

  retry: async (stepId) => {
    const runId = get().runId;
    if (!runId) return;
    set({ error: null });
    const unlisten = await ipc.onLaunchProgress((p) =>
      set((s) => applyProgress(s, p)),
    );
    try {
      await ipc.retryStep(runId, stepId);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      unlisten();
    }
  },
}));
