//! System font enumeration for the Settings font picker.

use font_kit::source::SystemSource;

/// List installed font family names (sorted case-insensitively, de-duplicated).
/// Best-effort: returns an empty list if the platform font source can't be read,
/// so the UI simply falls back to the default system font.
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    let mut families = SystemSource::new().all_families().unwrap_or_default();
    // Drop hidden system faces (family names starting with ".", e.g. ".SF NS").
    families.retain(|f| !f.starts_with('.'));
    families.sort_by_key(|f| f.to_lowercase());
    families.dedup();
    families
}
