//! macOS PATH hydration (red-team M3). A GUI-launched app inherits a minimal
//! PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) — missing `/opt/homebrew/bin`,
//! `/usr/local/bin`, and shell-rc additions — so `which code`/`docker`/`zed`
//! resolve as "not found" though they work in the user's terminal. We resolve the
//! login-shell PATH once and reuse it for lookups and spawned commands.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

static LOGIN_PATH: OnceLock<String> = OnceLock::new();

/// The user's login-shell PATH, resolved once and cached.
pub fn login_path() -> &'static str {
    LOGIN_PATH.get_or_init(resolve_login_path)
}

fn resolve_login_path() -> String {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    // `-l -i -c` so login + interactive rc files apply; print PATH with no newline.
    let output = Command::new(&shell)
        .args(["-lic", "printf %s \"$PATH\""])
        .output();
    if let Ok(out) = output {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }
    // Fallback: current PATH plus common Homebrew locations.
    let current = std::env::var("PATH").unwrap_or_default();
    format!("/opt/homebrew/bin:/usr/local/bin:{current}")
}

/// Resolve an executable by name on the hydrated PATH → its absolute path.
pub fn which(bin: &str) -> Option<PathBuf> {
    for dir in login_path().split(':') {
        if dir.is_empty() {
            continue;
        }
        let candidate = Path::new(dir).join(bin);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}
