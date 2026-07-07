import { create } from "zustand";
import * as ipc from "@/lib/workflow-ipc";
import { notify } from "@/lib/notify";
import type { LaunchProgress, StepStatus } from "@/types/launch";
import type { WorkflowSummary } from "@/types/workflow";

export interface StepState {
  stepId: string;
  kind: string;
  label: string;
  status: StepStatus;
  message?: string;
}

interface WorkflowRunStore {
  runId: string | null;
  /** Workflow whose run is currently in flight, for per-card spinner state. */
  runningWorkflowId: string | null;
  /** stepIds in arrival order, for stable rendering. */
  order: string[];
  steps: Record<string, StepState>;
  summary: WorkflowSummary | null;
  isRunning: boolean;
  error: string | null;
  run: (workflowId: string) => Promise<void>;
  cancel: () => Promise<void>;
}

/** Pure reducer: appends an unseen stepId to `order` once, upserts its status.
 *  Exported for unit testing. */
export function applyProgress(
  state: Pick<WorkflowRunStore, "order" | "steps">,
  p: LaunchProgress,
): Pick<WorkflowRunStore, "runId" | "order" | "steps" | "isRunning"> {
  const known = p.stepId in state.steps;
  return {
    runId: p.runId,
    isRunning: true,
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

export const useWorkflowRunStore = create<WorkflowRunStore>((set) => ({
  runId: null,
  runningWorkflowId: null,
  order: [],
  steps: {},
  summary: null,
  isRunning: false,
  error: null,

  run: async (workflowId) => {
    set({
      runId: null,
      runningWorkflowId: workflowId,
      order: [],
      steps: {},
      summary: null,
      isRunning: true,
      error: null,
    });
    try {
      await ipc.runWorkflow(workflowId);
      // isRunning stays true; the first `workflow:progress` event confirms it
      // and `workflow:done` (module-scope listener below) clears it.
    } catch (e) {
      set({ error: String(e), isRunning: false, runningWorkflowId: null });
    }
  },

  cancel: async () => {
    await ipc.cancelActiveRun();
  },
}));

// Registered ONCE at module load — not per-run — so a run started from any
// window (including the popover, which never touches this store) is observed
// here and its Cancel is wired to the shared single-active slot. If either
// `listen()` rejects at init, log it; the panel degrades to no live updates,
// it never wedges `isRunning` (which is derived from events, not set before
// listening).
void ipc
  .onWorkflowProgress((p) => {
    useWorkflowRunStore.setState((s) => applyProgress(s, p));
  })
  .catch((e) => {
    console.error("Failed to subscribe to workflow:progress", e);
  });

void ipc
  .onWorkflowDone((summary) => {
    useWorkflowRunStore.setState({
      summary,
      isRunning: false,
      runningWorkflowId: null,
    });
    void notify(
      `Workflow ${summary.status}`,
      `${summary.ok} ok · ${summary.failed} failed · ${summary.skipped} skipped · ${summary.cancelled} cancelled`,
    );
  })
  .catch((e) => {
    console.error("Failed to subscribe to workflow:done", e);
  });
