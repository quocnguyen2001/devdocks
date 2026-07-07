//! Workflow (sequential macro) data model — mirrors `Workspace` conventions.
//!
//! Kept structurally in sync with the TypeScript types (`src/types/workflow.ts`)
//! and the Zod schema (`src/lib/workflow-schema.ts`). Every struct is
//! `camelCase` on the wire so on-disk JSON keys equal the TS keys. Unknown
//! fields are tolerated (no `deny_unknown_fields`) but *ignored, not
//! preserved*. Schema evolution is governed by `schema_version` +
//! `crate::storage::migrations::migrate_workflow`.
//!
use serde::{Deserialize, Serialize};

use crate::error::RepoError;
use crate::models::workspace::FailurePolicy; // reuse: identical continue|halt enum

/// Current on-disk schema version. Bump only for a breaking shape change and add
/// a matching arm in `crate::storage::migrations::migrate_workflow`.
pub const WORKFLOW_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub id: String,
    pub schema_version: u32,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub accent_color: Option<String>,
    #[serde(default)]
    pub steps: Vec<WorkflowStep>,
    #[serde(default)]
    pub metadata: WorkflowMetadata,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStep {
    #[serde(default = "new_id")]
    pub id: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub failure_policy: FailurePolicy,
    /// The discriminant (`kind`) and its type-specific fields are flattened onto the
    /// step so the wire shape is one flat object (mirrors the Zod discriminatedUnion).
    #[serde(flatten)]
    pub action: StepAction,
}

/// Internally-tagged on `kind`. `rename_all = "camelCase"` renames the VARIANT names
/// (`launchWorkspace`/`openApp`/`runScript`/`delay`). It does NOT rename the fields inside
/// struct variants — that requires `rename_all_fields = "camelCase"` (serde >= 1.0.190; the
/// repo pins `serde = "1"`). Without it, fields serialize snake_case (`workspace_id`,
/// `app_name`, `timeout_secs`, `duration_ms`) and the camelCase wire shape the Zod schema
/// produces (`workspaceId`, ...) fails to deserialize with `missing field workspace_id`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum StepAction {
    LaunchWorkspace {
        workspace_id: String,
    },
    OpenApp {
        app_name: String,
    },
    RunScript {
        /// A shell command or a path to a `.sh` script; executed via `sh -c` (Phase 2).
        command: String,
        #[serde(default)]
        cwd: Option<String>,
        #[serde(default = "default_script_timeout_secs")]
        timeout_secs: u64,
    },
    Delay {
        duration_ms: u64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowRunStatus {
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowMetadata {
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub last_run_at: Option<String>,
    #[serde(default)]
    pub last_run_status: Option<WorkflowRunStatus>,
}

// --- defaults ---
fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn default_true() -> bool {
    true
}
fn default_script_timeout_secs() -> u64 {
    30
}
fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

impl Workflow {
    pub fn new(name: impl Into<String>) -> Self {
        let now = now_rfc3339();
        Self {
            id: new_id(),
            schema_version: WORKFLOW_SCHEMA_VERSION,
            name: name.into(),
            description: None,
            accent_color: None,
            steps: Vec::new(),
            metadata: WorkflowMetadata {
                created_at: Some(now.clone()),
                updated_at: Some(now),
                last_run_at: None,
                last_run_status: None,
            },
        }
    }

    pub fn touch(&mut self) {
        self.metadata.updated_at = Some(now_rfc3339());
    }

    /// Validate name + each step. Steps array MAY be empty (draft); the editor's Zod
    /// additionally requires >= 1 step to submit.
    pub fn validate(&self) -> Result<(), RepoError> {
        if self.name.trim().is_empty() {
            return Err(RepoError::Validation("name is required".into()));
        }
        for step in &self.steps {
            match &step.action {
                StepAction::LaunchWorkspace { workspace_id } if workspace_id.trim().is_empty() => {
                    return Err(RepoError::Validation(
                        "launchWorkspace step needs a workspaceId".into(),
                    ))
                }
                StepAction::OpenApp { app_name } => {
                    if app_name.trim().is_empty() {
                        return Err(RepoError::Validation(
                            "openApp step needs an appName".into(),
                        ));
                    }
                    // Mirror the runtime guard so a step that could never launch cannot be
                    // saved green. Reuses the same check `open_app` applies at run time.
                    if crate::launch::escape::validate_app_name(app_name).is_err() {
                        return Err(RepoError::Validation(format!(
                            "openApp step has an invalid appName: {app_name}"
                        )));
                    }
                }
                StepAction::RunScript {
                    command,
                    timeout_secs,
                    ..
                } => {
                    if command.trim().is_empty() {
                        return Err(RepoError::Validation(
                            "runScript step needs a command".into(),
                        ));
                    }
                    if *timeout_secs == 0 {
                        return Err(RepoError::Validation(
                            "runScript timeoutSecs must be >= 1".into(),
                        ));
                    }
                    if *timeout_secs > 3600 {
                        return Err(RepoError::Validation(
                            "runScript timeoutSecs must be <= 3600 (1h)".into(),
                        ));
                    }
                }
                StepAction::Delay { duration_ms } => {
                    if *duration_ms == 0 {
                        return Err(RepoError::Validation(
                            "delay durationMs must be >= 1".into(),
                        ));
                    }
                    if *duration_ms > 3_600_000 {
                        return Err(RepoError::Validation(
                            "delay durationMs must be <= 3_600_000 (1h)".into(),
                        ));
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(action: StepAction) -> WorkflowStep {
        WorkflowStep {
            id: "s1".into(),
            label: None,
            enabled: true,
            failure_policy: FailurePolicy::Continue,
            action,
        }
    }

    #[test]
    fn launch_workspace_step_wire_shape_is_camel_case() {
        let s = step(StepAction::LaunchWorkspace {
            workspace_id: "ws-1".into(),
        });
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(
            json,
            r#"{"id":"s1","label":null,"enabled":true,"failurePolicy":"continue","kind":"launchWorkspace","workspaceId":"ws-1"}"#
        );
        let back: WorkflowStep = serde_json::from_str(&json).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn open_app_step_wire_shape_is_camel_case() {
        let s = step(StepAction::OpenApp {
            app_name: "Visual Studio Code".into(),
        });
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(
            json,
            r#"{"id":"s1","label":null,"enabled":true,"failurePolicy":"continue","kind":"openApp","appName":"Visual Studio Code"}"#
        );
        let back: WorkflowStep = serde_json::from_str(&json).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn run_script_step_wire_shape_is_camel_case() {
        let s = step(StepAction::RunScript {
            command: "npm run dev".into(),
            cwd: Some(".".into()),
            timeout_secs: 30,
        });
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(
            json,
            r#"{"id":"s1","label":null,"enabled":true,"failurePolicy":"continue","kind":"runScript","command":"npm run dev","cwd":".","timeoutSecs":30}"#
        );
        let back: WorkflowStep = serde_json::from_str(&json).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn delay_step_wire_shape_is_camel_case() {
        let s = step(StepAction::Delay { duration_ms: 1000 });
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(
            json,
            r#"{"id":"s1","label":null,"enabled":true,"failurePolicy":"continue","kind":"delay","durationMs":1000}"#
        );
        let back: WorkflowStep = serde_json::from_str(&json).unwrap();
        assert_eq!(back, s);
    }

    /// Cross-language fixture parity: exact JSON strings the Zod schema would emit
    /// for each kind (see `src/lib/__tests__/workflow-schema.test.ts` for the mirror
    /// assertion that Zod accepts this same shape). Both directions are checked so
    /// the two schemas cannot silently drift into different wire shapes.
    #[test]
    fn parses_zod_emitted_fixtures_for_every_kind() {
        let fixtures = [
            r#"{"id":"a","label":null,"enabled":true,"failurePolicy":"continue","kind":"launchWorkspace","workspaceId":"ws-1"}"#,
            r#"{"id":"b","label":"Open editor","enabled":true,"failurePolicy":"halt","kind":"openApp","appName":"Visual Studio Code"}"#,
            r#"{"id":"c","label":null,"enabled":false,"failurePolicy":"continue","kind":"runScript","command":"echo hi","cwd":null,"timeoutSecs":30}"#,
            r#"{"id":"d","label":null,"enabled":true,"failurePolicy":"continue","kind":"delay","durationMs":1000}"#,
        ];
        for fixture in fixtures {
            let step: WorkflowStep = serde_json::from_str(fixture).unwrap();
            let round_tripped = serde_json::to_string(&step).unwrap();
            let a: serde_json::Value = serde_json::from_str(fixture).unwrap();
            let b: serde_json::Value = serde_json::from_str(&round_tripped).unwrap();
            assert_eq!(a, b);
        }
    }

    #[test]
    fn deserializes_minimal_shape_with_defaults() {
        let json = r#"{"kind":"runScript","command":"ls"}"#;
        let s: WorkflowStep = serde_json::from_str(json).unwrap();
        assert!(s.enabled);
        assert_eq!(s.failure_policy, FailurePolicy::Continue);
        match s.action {
            StepAction::RunScript { timeout_secs, .. } => assert_eq!(timeout_secs, 30),
            _ => panic!("expected RunScript"),
        }
    }

    #[test]
    fn tolerates_unknown_fields() {
        let json = r#"{"kind":"delay","durationMs":500,"futureField":123}"#;
        let s: WorkflowStep = serde_json::from_str(json).unwrap();
        match s.action {
            StepAction::Delay { duration_ms } => assert_eq!(duration_ms, 500),
            _ => panic!("expected Delay"),
        }
    }

    #[test]
    fn validate_rejects_empty_name() {
        let wf = Workflow::new("");
        assert!(wf.validate().is_err());
    }

    #[test]
    fn validate_accepts_empty_steps() {
        let wf = Workflow::new("ok");
        assert!(wf.validate().is_ok());
    }

    #[test]
    fn validate_rejects_empty_workspace_id() {
        let mut wf = Workflow::new("ok");
        wf.steps.push(step(StepAction::LaunchWorkspace {
            workspace_id: "  ".into(),
        }));
        assert!(wf.validate().is_err());
    }

    #[test]
    fn validate_rejects_empty_app_name() {
        let mut wf = Workflow::new("ok");
        wf.steps.push(step(StepAction::OpenApp {
            app_name: "".into(),
        }));
        assert!(wf.validate().is_err());
    }

    #[test]
    fn validate_rejects_disallowed_app_name_chars() {
        let mut wf = Workflow::new("ok");
        wf.steps.push(step(StepAction::OpenApp {
            app_name: "../evil".into(),
        }));
        assert!(wf.validate().is_err());

        let mut wf2 = Workflow::new("ok");
        wf2.steps.push(step(StepAction::OpenApp {
            app_name: "app/name".into(),
        }));
        assert!(wf2.validate().is_err());
    }

    #[test]
    fn validate_accepts_valid_app_name() {
        let mut wf = Workflow::new("ok");
        wf.steps.push(step(StepAction::OpenApp {
            app_name: "Visual Studio Code".into(),
        }));
        assert!(wf.validate().is_ok());
    }

    #[test]
    fn validate_rejects_empty_command() {
        let mut wf = Workflow::new("ok");
        wf.steps.push(step(StepAction::RunScript {
            command: "".into(),
            cwd: None,
            timeout_secs: 30,
        }));
        assert!(wf.validate().is_err());
    }

    #[test]
    fn validate_rejects_zero_and_over_cap_timeout_secs() {
        let mut wf = Workflow::new("ok");
        wf.steps.push(step(StepAction::RunScript {
            command: "ls".into(),
            cwd: None,
            timeout_secs: 0,
        }));
        assert!(wf.validate().is_err());
        wf.steps[0].action = StepAction::RunScript {
            command: "ls".into(),
            cwd: None,
            timeout_secs: 3601,
        };
        assert!(wf.validate().is_err());
        wf.steps[0].action = StepAction::RunScript {
            command: "ls".into(),
            cwd: None,
            timeout_secs: 3600,
        };
        assert!(wf.validate().is_ok());
    }

    #[test]
    fn validate_rejects_zero_and_over_cap_duration_ms() {
        let mut wf = Workflow::new("ok");
        wf.steps.push(step(StepAction::Delay { duration_ms: 0 }));
        assert!(wf.validate().is_err());
        wf.steps[0].action = StepAction::Delay {
            duration_ms: 3_600_001,
        };
        assert!(wf.validate().is_err());
        wf.steps[0].action = StepAction::Delay {
            duration_ms: 3_600_000,
        };
        assert!(wf.validate().is_ok());
    }
}
