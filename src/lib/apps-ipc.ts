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

/**
 * Real macOS icon for an installed app, as a base64 PNG data URI, or `null` when
 * one can't be produced (the UI then shows a monogram). Rust extracts lazily and
 * caches by path, so repeated calls for the same app are cheap.
 */
export function appIcon(path: string): Promise<string | null> {
  return invoke<string | null>("app_icon", { path });
}
