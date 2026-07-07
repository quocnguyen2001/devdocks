import { invoke } from "@tauri-apps/api/core";

/** Installed system font family names (from the Rust `list_system_fonts`
 *  command). Returns [] outside the Tauri runtime (e.g. a browser preview) so
 *  the Settings picker degrades to "System" only. */
export async function listSystemFonts(): Promise<string[]> {
  try {
    return await invoke<string[]>("list_system_fonts");
  } catch {
    return [];
  }
}
