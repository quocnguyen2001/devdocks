import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Detected, LaunchProgress, LaunchSummary } from "@/types/launch";
import type { Workspace } from "@/types/workspace";

// Launch engine lives entirely in Rust; the frontend invokes and subscribes to
// progress events. Multi-word command args use snake_case keys to match the Rust
// parameter names regardless of Tauri's arg-casing behavior.

export function detectTools(ids: string[]): Promise<Detected[]> {
  return invoke<Detected[]>("detect_tools", { ids });
}

export function launchWorkspace(workspace: Workspace): Promise<LaunchSummary> {
  return invoke<LaunchSummary>("launch_workspace", { workspace });
}

export function retryStep(runId: string, stepId: string): Promise<string> {
  return invoke<string>("retry_step", { run_id: runId, step_id: stepId });
}

export function runBeforeCloseHooks(workspaceId: string): Promise<void> {
  return invoke<void>("run_before_close_hooks", { workspace_id: workspaceId });
}

/** Dev-only seed command (compiled into debug builds only). */
export function devSeedWorkspace(): Promise<Workspace> {
  return invoke<Workspace>("dev_seed_workspace");
}

export function onLaunchProgress(
  cb: (p: LaunchProgress) => void,
): Promise<UnlistenFn> {
  return listen<LaunchProgress>("launch:progress", (e) => cb(e.payload));
}

export function onLaunchDone(
  cb: (s: LaunchSummary) => void,
): Promise<UnlistenFn> {
  return listen<LaunchSummary>("launch:done", (e) => cb(e.payload));
}
