import { invoke } from "@tauri-apps/api/core";

// Installed-application enumeration (Rust owns the filesystem scan). Backs the
// "Open app" workflow step picker. See `commands/apps.rs::list_installed_apps`.

export interface InstalledApp {
  /** Display name without ".app" — the value `open -a` matches on. */
  name: string;
  /** Absolute path to the `.app` bundle. */
  path: string;
}

export function listInstalledApps(): Promise<InstalledApp[]> {
  return invoke<InstalledApp[]>("list_installed_apps");
}
