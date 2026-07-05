//! Tool detection (red-team H4). CLIs are resolved on the hydrated PATH; GUI apps
//! are found in Applications dirs (incl. system locations) and via Spotlight
//! (`mdfind`), so Homebrew CLIs and JetBrains-Toolbox / Setapp installs are not
//! falsely reported missing. A per-tool custom path override takes precedence.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::launch::path_env;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DetectMethod {
    Cli,
    ApplicationsDir,
    Spotlight,
    Override,
    NotFound,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detected {
    pub id: String,
    pub available: bool,
    pub method: DetectMethod,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_path: Option<String>,
}

struct ToolSpec {
    id: &'static str,
    /// CLI binary name, if the tool ships one.
    cli: Option<&'static str>,
    /// `.app` display name (without extension) for Applications / Spotlight lookups.
    app_name: Option<&'static str>,
}

const CATALOG: &[ToolSpec] = &[
    // IDEs
    ToolSpec {
        id: "vscode",
        cli: Some("code"),
        app_name: Some("Visual Studio Code"),
    },
    ToolSpec {
        id: "cursor",
        cli: Some("cursor"),
        app_name: Some("Cursor"),
    },
    ToolSpec {
        id: "windsurf",
        cli: Some("windsurf"),
        app_name: Some("Windsurf"),
    },
    ToolSpec {
        id: "zed",
        cli: Some("zed"),
        app_name: Some("Zed"),
    },
    ToolSpec {
        id: "phpstorm",
        cli: None,
        app_name: Some("PhpStorm"),
    },
    ToolSpec {
        id: "intellij",
        cli: None,
        app_name: Some("IntelliJ IDEA"),
    },
    // Terminals
    ToolSpec {
        id: "iterm2",
        cli: None,
        app_name: Some("iTerm"),
    },
    ToolSpec {
        id: "terminal",
        cli: None,
        app_name: Some("Terminal"),
    },
    ToolSpec {
        id: "warp",
        cli: None,
        app_name: Some("Warp"),
    },
    // Additional applications
    ToolSpec {
        id: "docker-desktop",
        cli: Some("docker"),
        app_name: Some("Docker"),
    },
    ToolSpec {
        id: "tableplus",
        cli: None,
        app_name: Some("TablePlus"),
    },
    ToolSpec {
        id: "dbeaver",
        cli: None,
        app_name: Some("DBeaver"),
    },
    ToolSpec {
        id: "postman",
        cli: None,
        app_name: Some("Postman"),
    },
    ToolSpec {
        id: "bruno",
        cli: None,
        app_name: Some("Bruno"),
    },
    ToolSpec {
        id: "redis-insight",
        cli: None,
        app_name: Some("RedisInsight"),
    },
    ToolSpec {
        id: "chrome",
        cli: None,
        app_name: Some("Google Chrome"),
    },
    ToolSpec {
        id: "arc",
        cli: None,
        app_name: Some("Arc"),
    },
    ToolSpec {
        id: "safari",
        cli: None,
        app_name: Some("Safari"),
    },
    // AI tools
    ToolSpec {
        id: "claude-desktop",
        cli: None,
        app_name: Some("Claude"),
    },
    ToolSpec {
        id: "claude-code",
        cli: Some("claude"),
        app_name: None,
    },
    ToolSpec {
        id: "chatgpt",
        cli: None,
        app_name: Some("ChatGPT"),
    },
    ToolSpec {
        id: "gemini-cli",
        cli: Some("gemini"),
        app_name: None,
    },
    ToolSpec {
        id: "codex-cli",
        cli: Some("codex"),
        app_name: None,
    },
];

fn spec(id: &str) -> Option<&'static ToolSpec> {
    CATALOG.iter().find(|s| s.id == id)
}

/// `.app` display name for `open -a`, if the tool is a known GUI app.
pub fn app_name(id: &str) -> Option<&'static str> {
    spec(id).and_then(|s| s.app_name)
}

/// CLI binary name, if the tool ships one.
pub fn cli_name(id: &str) -> Option<&'static str> {
    spec(id).and_then(|s| s.cli)
}

/// Detect one tool by id, honoring an optional custom path override.
pub fn detect(id: &str, override_path: Option<&str>) -> Detected {
    if let Some(p) = override_path {
        if Path::new(p).exists() {
            return found(id, DetectMethod::Override, Some(p.to_string()));
        }
    }
    let Some(spec) = spec(id) else {
        return not_found(id);
    };
    if let Some(cli) = spec.cli {
        if let Some(path) = path_env::which(cli) {
            return found(
                id,
                DetectMethod::Cli,
                Some(path.to_string_lossy().into_owned()),
            );
        }
    }
    if let Some(app) = spec.app_name {
        if let Some(path) = app_bundle_path(app) {
            return found(
                id,
                DetectMethod::ApplicationsDir,
                Some(path.to_string_lossy().into_owned()),
            );
        }
        if let Some(path) = mdfind_app(app) {
            return found(id, DetectMethod::Spotlight, Some(path));
        }
    }
    not_found(id)
}

/// Detect a set of tool ids.
pub fn detect_many(ids: &[String]) -> Vec<Detected> {
    ids.iter().map(|id| detect(id, None)).collect()
}

fn app_bundle_path(app_name: &str) -> Option<PathBuf> {
    let file = format!("{app_name}.app");
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(home).join("Applications"));
    }
    dirs.into_iter().map(|d| d.join(&file)).find(|p| p.exists())
}

fn mdfind_app(app_name: &str) -> Option<String> {
    // `app_name` is always a trusted catalog constant, never user input.
    let query = format!("kMDItemFSName == '{app_name}.app'");
    let out = Command::new("mdfind").arg(&query).output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .find(|l| l.ends_with(".app"))
        .map(str::to_string)
}

fn found(id: &str, method: DetectMethod, resolved_path: Option<String>) -> Detected {
    Detected {
        id: id.to_string(),
        available: true,
        method,
        resolved_path,
    }
}

fn not_found(id: &str) -> Detected {
    Detected {
        id: id.to_string(),
        available: false,
        method: DetectMethod::NotFound,
        resolved_path: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_tool_is_not_found() {
        let d = detect("definitely-not-a-real-tool-xyz", None);
        assert!(!d.available);
        assert_eq!(d.method, DetectMethod::NotFound);
    }

    #[test]
    fn override_path_that_exists_wins() {
        // /bin/sh exists on every macOS; a bogus id still resolves via override.
        let d = detect("anything", Some("/bin/sh"));
        assert!(d.available);
        assert_eq!(d.method, DetectMethod::Override);
        assert_eq!(d.resolved_path.as_deref(), Some("/bin/sh"));
    }

    #[test]
    fn override_path_that_missing_falls_through() {
        let d = detect("no-such-id", Some("/no/such/path/xyz"));
        assert!(!d.available);
    }
}
