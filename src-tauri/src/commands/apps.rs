//! Installed-application enumeration for the "Open app" workflow step picker.
//! Best-effort scan of the standard macOS Applications directories; the display
//! name (the `.app` file stem) is exactly what `open -a "<name>"` expects.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

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

/// In-memory cache of extracted app icons (base64 PNG data URIs), keyed by the
/// `.app` bundle path. Populated lazily by `app_icon`; a cached `None` records
/// that an icon couldn't be produced, so a failing app isn't re-extracted on
/// every render.
pub type IconCache = Mutex<HashMap<String, Option<String>>>;

/// Guard for `app_icon`: only enumerated `.app` bundles under the standard
/// Applications directories are eligible. Keeps the command an icon lookup for
/// listed apps, not a general-purpose file thumbnail oracle.
fn is_allowed_app_path(path: &Path) -> bool {
    use std::path::Component;
    if path.extension().and_then(|e| e.to_str()) != Some("app") {
        return false;
    }
    // Reject `..` so the component-wise prefix check can't be tricked into
    // escaping an Applications dir (icons only, but keep the guard honest).
    if path.components().any(|c| c == Component::ParentDir) {
        return false;
    }
    app_dirs().iter().any(|dir| path.starts_with(dir))
}

/// Extract an app bundle's icon as a base64 PNG data URI. Best-effort: any
/// failure yields `None`. The AppKit icon + bitmap selectors used here are not
/// `MainThreadOnly` in objc2, so this is safe to run off the main thread.
#[cfg(target_os = "macos")]
fn extract_icon_data_uri(path: &str) -> Option<String> {
    use base64::Engine as _;
    use objc2::AllocAnyThread;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
    use objc2_foundation::{NSData, NSDictionary, NSString};

    objc2::rc::autoreleasepool(|_| {
        // SAFETY: standard AppKit icon-extraction message sends over valid
        // objc2 objects; none of these selectors require a main thread.
        let png: objc2::rc::Retained<NSData> = unsafe {
            let workspace = NSWorkspace::sharedWorkspace();
            let ns_path = NSString::from_str(path);
            let image = workspace.iconForFile(&ns_path);
            let tiff = image.TIFFRepresentation()?;
            let rep = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)?;
            let props = NSDictionary::new();
            rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &props)?
        };
        let bytes = png.to_vec();
        if bytes.is_empty() {
            return None;
        }
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Some(format!("data:image/png;base64,{b64}"))
    })
}

#[cfg(not(target_os = "macos"))]
fn extract_icon_data_uri(_path: &str) -> Option<String> {
    None
}

/// Return an installed app's icon as a base64 PNG data URI, or `None` if it
/// can't be produced. Lazy + cached: the "Open app" picker requests icons per
/// row and results (hits and misses) are memoized so re-renders don't re-extract.
///
/// `#[tauri::command(async)]` on purpose: Tauri runs plain sync commands on the
/// main thread, but the picker fans out one call per row, so this runs the
/// blocking AppKit extraction on a worker thread instead of stalling the UI. The
/// selectors used are not `MainThreadOnly`, so off-main execution is sound.
#[tauri::command(async)]
pub fn app_icon(cache: tauri::State<'_, IconCache>, path: String) -> Option<String> {
    if !is_allowed_app_path(Path::new(&path)) {
        return None;
    }
    if let Ok(map) = cache.lock() {
        if let Some(hit) = map.get(&path) {
            return hit.clone();
        }
    }
    let icon = extract_icon_data_uri(&path);
    if let Ok(mut map) = cache.lock() {
        map.insert(path, icon.clone());
    }
    icon
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

    #[test]
    fn icon_path_guard_accepts_only_app_bundles_in_app_dirs() {
        // Eligible: `.app` bundles directly under (or nested within) an apps dir.
        assert!(is_allowed_app_path(Path::new("/Applications/Slack.app")));
        assert!(is_allowed_app_path(Path::new(
            "/Applications/Utilities/Terminal.app"
        )));
        assert!(is_allowed_app_path(Path::new(
            "/System/Applications/Music.app"
        )));
        // Rejected: non-`.app` files, `.app` paths outside the apps dirs, and
        // `..` traversal that would otherwise satisfy the prefix check.
        assert!(!is_allowed_app_path(Path::new("/etc/passwd")));
        assert!(!is_allowed_app_path(Path::new("/Applications/Slack.txt")));
        assert!(!is_allowed_app_path(Path::new("/tmp/Evil.app")));
        assert!(!is_allowed_app_path(Path::new(
            "/Applications/../etc/sneaky.app"
        )));
    }
}
