//! Installed-application enumeration for the "Open app" workflow step picker.
//! Best-effort scan of the standard macOS Applications directories; the display
//! name (the `.app` file stem) is exactly what `open -a "<name>"` expects.

use std::path::PathBuf;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    /// Display name without the ".app" extension — the value `open -a` matches on.
    pub name: String,
    /// Absolute path to the `.app` bundle.
    pub path: String,
}

/// Directories scanned for `.app` bundles. Mirrors `detect::app_bundle_path` and
/// adds the common `/Applications/Utilities` nesting (one level only).
fn app_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/Applications/Utilities"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(home).join("Applications"));
    }
    dirs
}

/// Sort case-insensitively by name, then drop duplicate names (first wins).
/// The dedup predicate matches the sort key (ASCII-case-insensitive) so a name
/// present under multiple Applications dirs collapses to a single entry.
fn sort_and_dedupe(mut apps: Vec<InstalledApp>) -> Vec<InstalledApp> {
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    apps
}

/// Enumerate installed `.app` bundles from the standard macOS Applications dirs.
/// Best-effort: unreadable/missing dirs are skipped; the result is de-duplicated
/// by name (first occurrence wins) and sorted case-insensitively. Returns an
/// empty list when nothing is found, so the UI degrades to a plain text input.
#[tauri::command]
pub fn list_installed_apps() -> Vec<InstalledApp> {
    let mut apps: Vec<InstalledApp> = Vec::new();

    for dir in app_dirs() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue; // missing or unreadable dir — skip
        };
        for entry in entries.flatten() {
            let path = entry.path();
            // Keep only "*.app" bundles; the stem is the display name.
            if path.extension().and_then(|e| e.to_str()) != Some("app") {
                continue;
            }
            let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            apps.push(InstalledApp {
                name: name.to_string(),
                path: path.to_string_lossy().into_owned(),
            });
        }
    }

    sort_and_dedupe(apps)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(name: &str, path: &str) -> InstalledApp {
        InstalledApp {
            name: name.to_string(),
            path: path.to_string(),
        }
    }

    #[test]
    fn sorts_case_insensitively_and_dedupes_across_dirs_and_case() {
        // Same app under two dirs + a case variant, plus out-of-order input.
        let out = sort_and_dedupe(vec![
            app("Zed", "/Applications/Zed.app"),
            app("Slack", "/Applications/Slack.app"),
            app("slack", "/System/Applications/slack.app"), // case variant → deduped
            app("Slack", "/Users/x/Applications/Slack.app"), // cross-dir dup → deduped
            app("Arc", "/Applications/Arc.app"),
        ]);
        let names: Vec<&str> = out.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, vec!["Arc", "Slack", "Zed"]);
        // First occurrence wins (path from /Applications, not the later dirs).
        assert_eq!(out[1].path, "/Applications/Slack.app");
    }

    #[test]
    fn real_scan_never_panics() {
        // Exercises the filesystem path on the host; must not panic even when
        // some Applications dirs are missing/unreadable.
        let _ = list_installed_apps();
    }
}
