import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LaunchProgress } from "@/types/launch";
import type { Workflow, WorkflowSummary } from "@/types/workflow";

// Workflow engine lives entirely in Rust (owns persistence + validation); the
// frontend invokes and subscribes to progress/done events. Multi-word command
// args use snake_case keys to match the Rust parameter names.

export function listWorkflows(): Promise<Workflow[]> {
  return invoke<Workflow[]>("list_workflows");
}

export function getWorkflow(id: string): Promise<Workflow> {
  return invoke<Workflow>("get_workflow", { id });
}

export function saveWorkflow(workflow: Workflow): Promise<Workflow> {
  return invoke<Workflow>("save_workflow", { workflow });
}

export function deleteWorkflow(id: string): Promise<void> {
  return invoke<void>("delete_workflow", { id });
}

export function duplicateWorkflow(id: string): Promise<Workflow> {
  return invoke<Workflow>("duplicate_workflow", { id });
}

/** Resolves to the run_id immediately; the run continues on the backend. */
export function runWorkflow(workflowId: string): Promise<string> {
  return invoke<string>("run_workflow", { workflow_id: workflowId });
}

/** Cancels whatever workflow run currently holds the active slot (idempotent). */
export function cancelActiveRun(): Promise<void> {
  return invoke<void>("cancel_active_run");
}

export function onWorkflowProgress(
  cb: (p: LaunchProgress) => void,
): Promise<UnlistenFn> {
  return listen<LaunchProgress>("workflow:progress", (e) => cb(e.payload));
}

export function onWorkflowDone(
  cb: (s: WorkflowSummary) => void,
): Promise<UnlistenFn> {
  return listen<WorkflowSummary>("workflow:done", (e) => cb(e.payload));
}
