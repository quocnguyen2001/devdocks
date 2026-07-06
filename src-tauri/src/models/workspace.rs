//! Workspace configuration data model — the single source of truth for DevDock.
//!
//! Kept structurally in sync with the TypeScript types (`src/types/workspace.ts`)
//! and the Zod schema (`src/lib/workspace-schema.ts`). Every struct is
//! `camelCase` on the wire so on-disk JSON keys equal the TS keys. Unknown fields
//! are tolerated (no `deny_unknown_fields`) but *ignored, not preserved* — an
//! unknown key written by a newer build is dropped the next time an older build
//! re-saves. Schema evolution is governed by `schema_version` +
//! `crate::storage::migrations`.

use serde::{Deserialize, Serialize};

use crate::error::RepoError;

/// Current on-disk schema version. Bump only for a breaking shape change and add
/// a matching arm in `crate::storage::migrations::migrate`.
pub const WORKSPACE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub schema_version: u32,
    pub name: String,
    /// Absolute project path. Existence is checked at launch (Phase 3), not save.
    pub path: String,
    #[serde(default)]
    pub description: Option<String>,
    /// Lucide icon name.
    #[serde(default)]
    pub icon: Option<String>,
    /// Accent color (hex or design token).
    #[serde(default)]
    pub accent_color: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub ide: Option<IdeConfig>,
    #[serde(default)]
    pub terminals: Vec<TerminalConfig>,
    /// AI tool ids (e.g. "claude-desktop", "gemini-cli").
    #[serde(default)]
    pub ai_tools: Vec<String>,
    /// Additional application ids (e.g. "docker-desktop", "tableplus").
    #[serde(default)]
    pub applications: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<DependencyConfig>,
    #[serde(default)]
    pub browser_urls: Vec<BrowserUrl>,
    #[serde(default)]
    pub startup_sequence: Vec<StartupStep>,
    #[serde(default)]
    pub hooks: Hooks,
    #[serde(default)]
    pub env_vars: Vec<EnvVar>,
    #[serde(default)]
    pub metadata: Metadata,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeConfig {
    /// IDE id: "vscode" | "phpstorm" | "cursor" | "windsurf" | "zed" | "intellij".
    pub app: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalConfig {
    /// Stable id so the startup sequence can reference a specific terminal.
    #[serde(default = "new_id")]
    pub id: String,
    /// Terminal app: "iterm2" | "terminal" | "warp" (warp is launch-only).
    pub app: String,
    /// Working dir; relative paths resolve against the workspace `path` (Phase 3).
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub command: String,
    /// Delay before this terminal launches, in milliseconds.
    #[serde(default)]
    pub delay: u64,
}

/// A wait-for-ready dependency (e.g. Docker). The launch engine consumes these
/// fields directly rather than hard-coding timeouts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyConfig {
    #[serde(default = "new_id")]
    pub id: String,
    /// Dependency kind, e.g. "docker".
    pub kind: String,
    /// Start the dependency app (e.g. `open -a Docker`) before polling.
    #[serde(default)]
    pub start: bool,
    /// Readiness probe (e.g. "docker info"); `None` → start-only, no wait. Run as
    /// whitespace-tokenized argv (NO shell): a probe needing quoting/pipes/`sh -c`
    /// won't work as written.
    #[serde(default)]
    pub check_cmd: Option<String>,
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    #[serde(default)]
    pub on_timeout: OnTimeout,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OnTimeout {
    /// Skip steps that depend on this one (default).
    #[default]
    SkipDependents,
    /// Proceed anyway.
    Continue,
    /// Fail the whole launch run.
    FailRun,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUrl {
    pub url: String,
    /// Specific browser app; `None` → system default.
    #[serde(default)]
    pub browser: Option<String>,
}

/// One entry in the ordered launch sequence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupStep {
    pub kind: StepKind,
    /// Id/name of the specific item to launch (terminal id, app id, …); `None`
    /// applies to all items of `kind` (e.g. all browser URLs).
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub delay_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StepKind {
    Ide,
    Terminal,
    Application,
    AiTool,
    Dependency,
    BrowserUrls,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hooks {
    #[serde(default)]
    pub before_launch: Vec<HookConfig>,
    #[serde(default)]
    pub after_launch: Vec<HookConfig>,
    #[serde(default)]
    pub before_close: Vec<HookConfig>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookConfig {
    pub command: String,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default = "default_hook_timeout_secs")]
    pub timeout_secs: u64,
    #[serde(default)]
    pub failure_policy: FailurePolicy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FailurePolicy {
    /// Continue the run if the hook fails (default).
    #[default]
    Continue,
    /// Halt the run on hook failure.
    Halt,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub last_launched: Option<String>,
}

// --- defaults ---
fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn default_timeout_secs() -> u64 {
    60
}
fn default_poll_interval_ms() -> u64 {
    1000
}
fn default_hook_timeout_secs() -> u64 {
    30
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

impl Workspace {
    /// Create a new workspace with a fresh id, current schema version, and
    /// created/updated timestamps.
    pub fn new(name: impl Into<String>, path: impl Into<String>) -> Self {
        let now = now_rfc3339();
        Self {
            id: new_id(),
            schema_version: WORKSPACE_SCHEMA_VERSION,
            name: name.into(),
            path: path.into(),
            description: None,
            icon: None,
            accent_color: None,
            tags: Vec::new(),
            ide: None,
            terminals: Vec::new(),
            ai_tools: Vec::new(),
            applications: Vec::new(),
            dependencies: Vec::new(),
            browser_urls: Vec::new(),
            startup_sequence: Vec::new(),
            hooks: Hooks::default(),
            env_vars: Vec::new(),
            metadata: Metadata {
                created_at: Some(now.clone()),
                updated_at: Some(now),
                last_launched: None,
            },
        }
    }

    /// Update `metadata.updated_at` to now.
    pub fn touch(&mut self) {
        self.metadata.updated_at = Some(now_rfc3339());
    }

    /// Validate required fields. Path existence is a launch-time concern (Phase 3).
    pub fn validate(&self) -> Result<(), RepoError> {
        if self.name.trim().is_empty() {
            return Err(RepoError::Validation("name is required".into()));
        }
        if self.path.trim().is_empty() {
            return Err(RepoError::Validation("path is required".into()));
        }
        // 0 is not a valid wait timeout / poll interval (matches the Zod
        // `.positive()` constraint so both sides agree).
        for dep in &self.dependencies {
            if dep.timeout_secs == 0 || dep.poll_interval_ms == 0 {
                return Err(RepoError::Validation(format!(
                    "dependency '{}' timeoutSecs and pollIntervalMs must be >= 1",
                    dep.kind
                )));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Workspace {
        let mut ws = Workspace::new("Laravel CRM", "/Users/me/Projects/laravel-crm");
        ws.ide = Some(IdeConfig {
            app: "phpstorm".into(),
        });
        ws.terminals.push(TerminalConfig {
            id: "t1".into(),
            app: "iterm2".into(),
            cwd: ".".into(),
            command: "npm run dev".into(),
            delay: 0,
        });
        ws.applications = vec!["docker-desktop".into(), "tableplus".into()];
        ws.dependencies.push(DependencyConfig {
            id: "d1".into(),
            kind: "docker".into(),
            start: true,
            check_cmd: Some("docker info".into()),
            timeout_secs: 60,
            poll_interval_ms: 1000,
            on_timeout: OnTimeout::SkipDependents,
            required: true,
        });
        ws
    }

    #[test]
    fn round_trips_and_uses_camel_case() {
        let ws = sample();
        let json = serde_json::to_string_pretty(&ws).unwrap();
        // camelCase keys on the wire (the TS/Zod contract).
        assert!(json.contains("\"schemaVersion\""));
        assert!(json.contains("\"aiTools\""));
        assert!(json.contains("\"browserUrls\""));
        assert!(json.contains("\"skipDependents\""));
        let back: Workspace = serde_json::from_str(&json).unwrap();
        assert_eq!(ws, back);
    }

    #[test]
    fn deserializes_minimal_shape_with_defaults() {
        let json = r#"{
            "id": "x", "schemaVersion": 1, "name": "X", "path": "/p",
            "ide": {"app": "vscode"},
            "terminals": [{"id": "t", "app": "iterm2", "cwd": ".", "command": "ls"}],
            "applications": ["docker-desktop"]
        }"#;
        let ws: Workspace = serde_json::from_str(json).unwrap();
        assert_eq!(ws.name, "X");
        assert!(ws.tags.is_empty());
        assert_eq!(ws.hooks.before_launch.len(), 0);
        assert_eq!(ws.terminals[0].delay, 0);
    }

    #[test]
    fn tolerates_unknown_fields() {
        // deny_unknown_fields is intentionally OFF for forward-compat.
        let json = r#"{"id":"x","schemaVersion":1,"name":"X","path":"/p","futureField":123}"#;
        let ws: Workspace = serde_json::from_str(json).unwrap();
        assert_eq!(ws.id, "x");
    }

    #[test]
    fn validate_rejects_empty_name_or_path() {
        let mut ws = Workspace::new("", "/p");
        assert!(ws.validate().is_err());
        ws.name = "ok".into();
        ws.path = "  ".into();
        assert!(ws.validate().is_err());
        ws.path = "/p".into();
        assert!(ws.validate().is_ok());
    }

    #[test]
    fn validate_rejects_zero_dependency_timeout_or_poll() {
        let mut ws = Workspace::new("ok", "/p");
        ws.dependencies.push(DependencyConfig {
            id: "d1".into(),
            kind: "docker".into(),
            start: true,
            check_cmd: Some("docker info".into()),
            timeout_secs: 0, // invalid
            poll_interval_ms: 1000,
            on_timeout: OnTimeout::SkipDependents,
            required: false,
        });
        assert!(ws.validate().is_err());
        ws.dependencies[0].timeout_secs = 60;
        ws.dependencies[0].poll_interval_ms = 0; // invalid
        assert!(ws.validate().is_err());
        ws.dependencies[0].poll_interval_ms = 1000;
        assert!(ws.validate().is_ok());
    }
}
