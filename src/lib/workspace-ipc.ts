import { invoke } from "@tauri-apps/api/core";
import type { Workspace } from "@/types/workspace";

// Thin typed wrappers over the Rust workspace commands (Rust owns persistence).
// The `invoke<Workspace>` generics are compile-time assertions, NOT runtime
// checks: validation is intentionally Rust-side (same-process, trusted IPC), so
// the Zod schema is used for form input + type inference, not to guard results
// here. If runtime guarding is ever needed, map results through `workspaceSchema.parse`.

export function listWorkspaces(): Promise<Workspace[]> {
  return invoke<Workspace[]>("list_workspaces");
}

export function getWorkspace(id: string): Promise<Workspace> {
  return invoke<Workspace>("get_workspace", { id });
}

export function saveWorkspace(workspace: Workspace): Promise<Workspace> {
  return invoke<Workspace>("save_workspace", { workspace });
}

export function deleteWorkspace(id: string): Promise<void> {
  return invoke<void>("delete_workspace", { id });
}

export function duplicateWorkspace(id: string): Promise<Workspace> {
  return invoke<Workspace>("duplicate_workspace", { id });
}
