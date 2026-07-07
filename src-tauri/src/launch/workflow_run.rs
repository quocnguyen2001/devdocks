//! Workflow execution engine: light plan mapping + lazy per-step resolution,
//! the RAII single-active guard, the sink-shaped step loop (unit-testable
//! without Tauri), and the Tauri-facing `execute_workflow` wrapper.
//!
//! Reuses the launch engine's primitives (`run_action`, `run_hook`, `build_plan`)
//! rather than forking a parallel engine. See plan.md decisions 2-5.

use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager}; // Manager brings `app.state`/`app.path` into scope
use tokio_util::sync::CancellationToken;

use crate::launch::orchestrator;
use crate::launch::run_plan::{ResolvedAction, RunRegistry};
use crate::launch::{escape, launchers, LaunchError, LaunchProgress, StepOutcome, StepStatus};
use crate::models::workflow::{StepAction, Workflow, WorkflowRunStatus};
use crate::models::workspace::FailurePolicy;
use crate::storage::workspace_repo::WorkspaceRepo;

/// Run-plan action: raw values only; resolution happens at execution time.
pub enum WorkflowRunAction {
    LaunchWorkspace {
        workspace_id: String,
    },
    OpenApp {
        app_name: String,
    },
    RunScript {
        command: String,
        cwd: Option<String>,
        timeout_secs: u64,
    },
    Delay {
        ms: u64,
    },
}

pub struct WorkflowRunStep {
    pub id: String,
    pub kind: String, // "launchWorkspace" | "openApp" | "runScript" | "delay"
    pub label: String,
    pub enabled: bool,
    pub failure_policy: FailurePolicy,
    pub action: WorkflowRunAction,
}

pub struct WorkflowRunPlan {
    pub run_id: String,
    pub workflow_id: String,
    pub steps: Vec<WorkflowRunStep>,
}

/// `workflow:done` payload — genuinely new (aggregate counts + terminal status).
/// (`workflow:progress` reuses `LaunchProgress`; no duplicate progress struct.)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSummary {
    pub run_id: String,
    pub workflow_id: String,
    pub total: usize,
    pub ok: usize,
    pub failed: usize,
    pub skipped: usize,
    pub cancelled: usize,
    pub status: WorkflowRunStatus,
}

/// RAII guard over the single-active slot for a workflow run. `Drop` frees the
/// slot + clears the token on normal end, panic, or a dropped future — there is
/// no manual `end` call to skip.
pub struct WorkflowRunGuard {
    app: AppHandle,
    run_id: String,
    token: CancellationToken,
}

impl WorkflowRunGuard {
    /// Reserve the slot and return an RAII guard. On drop the slot is freed + token cleared.
    pub fn begin(app: &AppHandle, run_id: String) -> Result<Self, LaunchError> {
        let token = app
            .state::<RunRegistry>()
            .reserve_workflow(run_id.clone())?;
        Ok(Self {
            app: app.clone(),
            run_id,
            token,
        })
    }
    pub fn token(&self) -> CancellationToken {
        self.token.clone()
    }
    pub fn run_id(&self) -> &str {
        &self.run_id
    }
}

impl Drop for WorkflowRunGuard {
    fn drop(&mut self) {
        self.app
            .state::<RunRegistry>()
            .finish_workflow(&self.run_id);
    }
}

/// Build a light run plan: label + kind + raw action only. Filesystem/workspace
/// resolution is deferred to execution time (F4) — no TOCTOU across long delays.
pub fn build_workflow_plan(run_id: String, wf: &Workflow) -> WorkflowRunPlan {
    let steps = wf
        .steps
        .iter()
        .map(|s| {
            let (kind, label, action) = match &s.action {
                StepAction::Delay { duration_ms } => (
                    "delay",
                    format!("Wait {duration_ms} ms"),
                    WorkflowRunAction::Delay { ms: *duration_ms },
                ),
                StepAction::OpenApp { app_name } => (
                    "openApp",
                    format!("Open {app_name}"),
                    WorkflowRunAction::OpenApp {
                        app_name: app_name.clone(),
                    },
                ),
                StepAction::RunScript {
                    command,
                    cwd,
                    timeout_secs,
                } => (
                    "runScript",
                    format!("Run: {}", truncate(command, 40)),
                    WorkflowRunAction::RunScript {
                        command: command.clone(),
                        cwd: cwd.clone(),
                        timeout_secs: *timeout_secs,
                    },
                ),
                StepAction::LaunchWorkspace { workspace_id } => (
                    "launchWorkspace",
                    "Launch workspace".to_string(),
                    WorkflowRunAction::LaunchWorkspace {
                        workspace_id: workspace_id.clone(),
                    },
                ),
            };
            WorkflowRunStep {
                id: s.id.clone(),
                kind: kind.to_string(),
                label: s.label.clone().unwrap_or(label),
                enabled: s.enabled,
                failure_policy: s.failure_policy,
                action,
            }
        })
        .collect();
    WorkflowRunPlan {
        run_id,
        workflow_id: wf.id.clone(),
        steps,
    }
}

#[derive(Default)]
pub struct StepTally {
    pub ok: usize,
    pub failed: usize,
    pub skipped: usize,
    pub cancelled: usize,
}

/// Pure loop: cancellation checked BETWEEN steps; `run_one` runs an enabled step (and is
/// responsible for any in-flight racing). `sink(step, status, message)` reports progress.
///
/// `run_one` returns a boxed future (rather than a bare associated type) because a plain
/// `FnMut(&WorkflowRunStep, &CancellationToken) -> Fut` cannot express a `Fut` borrowing
/// from the call's arguments. A single named lifetime `'p` (shared by `steps`, `token`,
/// and the boxed future) — rather than a higher-ranked `for<'a>` bound — lets the closure
/// also capture longer-lived outer data (e.g. `app`, `run_id`) by reference.
pub async fn execute_steps<'p, Run>(
    steps: &'p [WorkflowRunStep],
    token: &'p CancellationToken,
    mut run_one: Run,
    mut sink: impl FnMut(&WorkflowRunStep, StepStatus, Option<&str>),
) -> StepTally
where
    Run: FnMut(
        &'p WorkflowRunStep,
        &'p CancellationToken,
    ) -> Pin<Box<dyn Future<Output = StepOutcome> + Send + 'p>>,
{
    let mut t = StepTally::default();
    let mut aborted = false;
    let mut run_cancelled = false;
    for step in steps {
        if token.is_cancelled() || run_cancelled {
            sink(step, StepStatus::Cancelled, Some("run cancelled"));
            t.cancelled += 1;
            continue;
        }
        if aborted {
            sink(
                step,
                StepStatus::Skipped,
                Some("skipped after a halted step failed"),
            );
            t.skipped += 1;
            continue;
        }
        if !step.enabled {
            sink(step, StepStatus::Skipped, Some("step disabled"));
            t.skipped += 1;
            continue;
        }
        sink(step, StepStatus::Running, None);
        let outcome = run_one(step, token).await;
        match outcome.status {
            StepStatus::Ok => t.ok += 1,
            StepStatus::Skipped => t.skipped += 1,
            StepStatus::Cancelled => {
                t.cancelled += 1;
                run_cancelled = true;
            }
            StepStatus::Failed => {
                t.failed += 1;
                if step.failure_policy == FailurePolicy::Halt {
                    aborted = true;
                }
            }
            StepStatus::Pending | StepStatus::Running => {}
        }
        sink(step, outcome.status, outcome.message.as_deref());
    }
    t
}

/// Thin Tauri wrapper: real runner + `workflow:progress` sink, then `workflow:done`.
pub async fn execute_workflow(
    app: &AppHandle,
    plan: &WorkflowRunPlan,
    token: CancellationToken,
) -> WorkflowSummary {
    // Borrowed from `plan` (a reference parameter, so it outlives the loop-scoped
    // per-call lifetime the boxed-future HRTB requires) rather than cloned into a
    // closure-owned local, which a `for<'a> ... -> Pin<Box<dyn Future + 'a>>` bound
    // cannot soundly borrow from (Output can only borrow the call's own `'a` args).
    let run_id = &plan.run_id;
    let t = execute_steps(
        &plan.steps,
        &token,
        |step, tok| {
            Box::pin(run_workflow_action(
                app,
                run_id,
                &step.id,
                &step.action,
                tok,
            ))
        },
        |step, status, message| emit(app, run_id, step, status, message),
    )
    .await;

    let status = derive_status(&t);
    let summary = WorkflowSummary {
        run_id: plan.run_id.clone(),
        workflow_id: plan.workflow_id.clone(),
        total: plan.steps.len(),
        ok: t.ok,
        failed: t.failed,
        skipped: t.skipped,
        cancelled: t.cancelled,
        status,
    };
    let _ = app.emit("workflow:done", &summary);
    summary
}

/// Any cancellation dominates (the run was aborted, regardless of prior failures);
/// otherwise any failure marks the whole run failed; a clean/all-skipped run completes.
fn derive_status(t: &StepTally) -> WorkflowRunStatus {
    if t.cancelled > 0 {
        WorkflowRunStatus::Cancelled
    } else if t.failed > 0 {
        WorkflowRunStatus::Failed
    } else {
        WorkflowRunStatus::Completed
    }
}

fn emit(
    app: &AppHandle,
    run_id: &str,
    step: &WorkflowRunStep,
    status: StepStatus,
    message: Option<&str>,
) {
    let payload = LaunchProgress {
        run_id: run_id.to_string(),
        step_id: step.id.clone(),
        kind: step.kind.clone(),
        label: step.label.clone(),
        status,
        message: message.map(str::to_string),
    };
    let _ = app.emit("workflow:progress", &payload); // reuse LaunchProgress under a new event name
}

/// Race a delay against the cancel token. Free of `AppHandle` so it is directly
/// unit-testable.
async fn run_delay(ms: u64, token: &CancellationToken) -> StepOutcome {
    tokio::select! {
        _ = token.cancelled() => StepOutcome::cancelled("cancelled during delay"),
        _ = tokio::time::sleep(Duration::from_millis(ms)) => StepOutcome::ok(),
    }
}

/// Resolve `cwd` lazily (a missing dir fails at execution time) and race
/// `run_hook` against the cancel token. Free of `AppHandle` so it is directly
/// unit-testable; no bespoke shell runner (`run_hook`'s `kill_on_drop` SIGKILLs
/// the child when the raced future is dropped on cancel/timeout).
async fn run_script(
    command: &str,
    cwd: Option<&str>,
    timeout_secs: u64,
    token: &CancellationToken,
) -> StepOutcome {
    let resolved = match cwd {
        None => None,
        Some(c) => match escape::resolve_dir(c, Path::new("/")) {
            Ok(p) => Some(p),
            Err(_) => return StepOutcome::failed(format!("working directory not found: {c}")),
        },
    };
    tokio::select! {
        _ = token.cancelled() => StepOutcome::cancelled("script cancelled"),
        out = launchers::run_hook(command, resolved.as_deref(), timeout_secs, &[]) => out,
    }
}

/// Look up a `launchWorkspace` step's target at execution time (not at plan
/// build time), so a workspace deleted mid-run fails its step here with a clear
/// message rather than resolving stale or failing silently earlier. `AppHandle`-
/// free (takes a plain config dir) so it is directly unit-testable.
fn resolve_workspace(
    config_dir: &Path,
    workspace_id: &str,
) -> Result<crate::models::workspace::Workspace, String> {
    WorkspaceRepo::new(config_dir)
        .get(workspace_id)
        .map_err(|_| format!("workspace {workspace_id} no longer exists"))
}

async fn run_workflow_action(
    app: &AppHandle,
    run_id: &str,
    step_id: &str,
    action: &WorkflowRunAction,
    token: &CancellationToken,
) -> StepOutcome {
    match action {
        WorkflowRunAction::Delay { ms } => run_delay(*ms, token).await,
        // Reuse the launch primitive; workflows carry no args (empty vec).
        WorkflowRunAction::OpenApp { app_name } => {
            launchers::run_action(&ResolvedAction::OpenApp {
                app_name: app_name.clone(),
                args: Vec::new(),
            })
            .await
        }
        WorkflowRunAction::RunScript {
            command,
            cwd,
            timeout_secs,
        } => run_script(command, cwd.as_deref(), *timeout_secs, token).await,
        WorkflowRunAction::LaunchWorkspace { workspace_id } => {
            // Resolve NOW: a workspace deleted before this step runs fails the step here
            // (lazy resolution, not a stale build-time snapshot).
            let Ok(dir) = app.path().app_config_dir() else {
                return StepOutcome::failed("cannot access workspace storage");
            };
            let ws = match resolve_workspace(&dir, workspace_id) {
                Ok(ws) => ws,
                Err(msg) => return StepOutcome::failed(msg),
            };
            let plan = orchestrator::build_plan(format!("{run_id}:{step_id}"), &ws);
            run_nested_workspace(app, &plan, token).await
        }
    }
}

/// Nested workspace launch: reuse `run_action` in a small token-aware loop
/// (NOT `execute_plan`, which broadcasts `launch:*` events and takes no token).
/// Cancellation is checked BETWEEN sub-steps; an in-flight sub-step runs to
/// completion (racing it would detach `open`/`osascript` children or SIGKILL an
/// in-flight hook mid-run).
async fn run_nested_workspace(
    app: &AppHandle,
    plan: &crate::launch::run_plan::RunPlan,
    token: &CancellationToken,
) -> StepOutcome {
    let (mut failed, mut skipped) = (0usize, 0usize);
    let mut aborted = false;
    for step in &plan.steps {
        if token.is_cancelled() {
            // Stop dispatching further sub-steps; any already in-flight has completed.
            return StepOutcome::cancelled("cancelled during workspace launch");
        }
        if aborted {
            skipped += 1;
            continue;
        }
        if step.delay_ms > 0 {
            tokio::time::sleep(Duration::from_millis(step.delay_ms)).await;
        }
        let outcome = launchers::run_action(&step.action).await; // run to completion; NOT raced
        match outcome.status {
            StepStatus::Failed => {
                failed += 1;
                if step.required {
                    aborted = true;
                }
            }
            StepStatus::Skipped => skipped += 1,
            _ => {}
        }
        // Nested per-sub-step progress is intentionally dropped (not re-emitted). The workflow
        // panel shows the single aggregated launchWorkspace step.
    }
    let _ = skipped; // tallied for symmetry with orchestrator; not surfaced separately in v1
    orchestrator::record_launch(app, &plan.workspace_id); // best-effort recency + workspaces:changed
    if failed > 0 {
        StepOutcome::failed(format!("{failed} workspace step(s) failed"))
    } else {
        StepOutcome::ok()
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() > max {
        format!("{}…", s.chars().take(max).collect::<String>())
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn step(id: &str, enabled: bool, policy: FailurePolicy) -> WorkflowRunStep {
        WorkflowRunStep {
            id: id.to_string(),
            kind: "delay".into(),
            label: id.to_string(),
            enabled,
            failure_policy: policy,
            action: WorkflowRunAction::Delay { ms: 0 },
        }
    }

    #[tokio::test]
    async fn continue_policy_isolates_a_failed_step() {
        let steps = vec![
            step("a", true, FailurePolicy::Continue),
            step("b", true, FailurePolicy::Continue),
            step("c", true, FailurePolicy::Continue),
        ];
        let token = CancellationToken::new();
        let seen: Arc<std::sync::Mutex<Vec<(String, StepStatus)>>> =
            Arc::new(std::sync::Mutex::new(Vec::new()));
        let seen2 = seen.clone();
        let t = execute_steps(
            &steps,
            &token,
            |s, _tok| {
                let id = s.id.clone();
                Box::pin(async move {
                    if id == "b" {
                        StepOutcome::failed("boom")
                    } else {
                        StepOutcome::ok()
                    }
                })
            },
            move |s, status, _msg| {
                seen2.lock().unwrap().push((s.id.clone(), status));
            },
        )
        .await;
        assert_eq!(t.ok, 2);
        assert_eq!(t.failed, 1);
        assert_eq!(t.skipped, 0);
        // "c" still ran (continue isolates the failure).
        let recorded = seen.lock().unwrap();
        assert!(recorded
            .iter()
            .any(|(id, s)| id == "c" && *s == StepStatus::Ok));
    }

    #[tokio::test]
    async fn halt_policy_aborts_remaining_steps_as_skipped() {
        let steps = vec![
            step("a", true, FailurePolicy::Halt),
            step("b", true, FailurePolicy::Halt),
            step("c", true, FailurePolicy::Halt),
        ];
        let token = CancellationToken::new();
        let t = execute_steps(
            &steps,
            &token,
            |s, _tok| {
                let id = s.id.clone();
                Box::pin(async move {
                    if id == "a" {
                        StepOutcome::failed("boom")
                    } else {
                        StepOutcome::ok()
                    }
                })
            },
            |_s, _status, _msg| {},
        )
        .await;
        assert_eq!(t.failed, 1);
        assert_eq!(t.skipped, 2);
        assert_eq!(t.ok, 0);
    }

    #[tokio::test]
    async fn disabled_step_is_skipped() {
        let steps = vec![step("a", false, FailurePolicy::Continue)];
        let token = CancellationToken::new();
        let ran = Arc::new(AtomicUsize::new(0));
        let ran2 = ran.clone();
        let t = execute_steps(
            &steps,
            &token,
            move |_s, _tok| {
                ran2.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { StepOutcome::ok() })
            },
            |_s, _status, _msg| {},
        )
        .await;
        assert_eq!(t.skipped, 1);
        assert_eq!(ran.load(Ordering::SeqCst), 0); // run_one never invoked for a disabled step
    }

    #[tokio::test]
    async fn pre_cancelled_token_marks_all_steps_cancelled_without_running() {
        let steps = vec![
            step("a", true, FailurePolicy::Continue),
            step("b", true, FailurePolicy::Continue),
        ];
        let token = CancellationToken::new();
        token.cancel();
        let ran = Arc::new(AtomicUsize::new(0));
        let ran2 = ran.clone();
        let t = execute_steps(
            &steps,
            &token,
            move |_s, _tok| {
                ran2.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { StepOutcome::ok() })
            },
            |_s, _status, _msg| {},
        )
        .await;
        assert_eq!(t.cancelled, 2);
        assert_eq!(ran.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn a_cancelled_outcome_marks_remaining_steps_cancelled_too() {
        let steps = vec![
            step("a", true, FailurePolicy::Continue),
            step("b", true, FailurePolicy::Continue),
            step("c", true, FailurePolicy::Continue),
        ];
        let token = CancellationToken::new();
        let t = execute_steps(
            &steps,
            &token,
            |s, _tok| {
                let id = s.id.clone();
                Box::pin(async move {
                    if id == "a" {
                        StepOutcome::cancelled("cancelled")
                    } else {
                        StepOutcome::ok()
                    }
                })
            },
            |_s, _status, _msg| {},
        )
        .await;
        assert_eq!(t.cancelled, 3);
        assert_eq!(t.ok, 0);
    }

    #[tokio::test]
    async fn delay_cancels_promptly_instead_of_completing() {
        let token = CancellationToken::new();
        let tok2 = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(10)).await;
            tok2.cancel();
        });
        let outcome = run_delay(5_000, &token).await;
        assert_eq!(outcome.status, StepStatus::Cancelled);
    }

    #[tokio::test]
    async fn run_script_true_is_ok() {
        let token = CancellationToken::new();
        let outcome = run_script("true", None, 5, &token).await;
        assert_eq!(outcome.status, StepStatus::Ok);
    }

    #[tokio::test]
    async fn run_script_exit_3_is_failed() {
        let token = CancellationToken::new();
        let outcome = run_script("exit 3", None, 5, &token).await;
        assert_eq!(outcome.status, StepStatus::Failed);
    }

    #[tokio::test]
    async fn run_script_times_out_is_failed() {
        let token = CancellationToken::new();
        let outcome = run_script("sleep 5", None, 1, &token).await;
        assert_eq!(outcome.status, StepStatus::Failed);
        assert!(outcome.message.unwrap().contains("timed out"));
    }

    #[tokio::test]
    async fn run_script_pre_cancelled_token_cancels_without_waiting() {
        let token = CancellationToken::new();
        token.cancel();
        let started = std::time::Instant::now();
        let outcome = run_script("sleep 5", None, 5, &token).await;
        assert_eq!(outcome.status, StepStatus::Cancelled);
        // Proves the 5s sleep was skipped, not a tight latency bound (which
        // flakes under load); a 4s ceiling has ample margin yet still fails if
        // the child were actually awaited.
        assert!(started.elapsed() < Duration::from_secs(4));
    }

    #[tokio::test]
    async fn run_script_missing_cwd_fails_at_execution() {
        let token = CancellationToken::new();
        let outcome = run_script("true", Some("/definitely/not/a/real/path/xyz"), 5, &token).await;
        assert_eq!(outcome.status, StepStatus::Failed);
        assert!(outcome
            .message
            .unwrap()
            .contains("working directory not found"));
    }

    // --- Cross-module integration coverage over the sink-shaped `execute_steps` loop ---

    fn delay_step(id: &str, policy: FailurePolicy, enabled: bool) -> WorkflowRunStep {
        WorkflowRunStep {
            id: id.to_string(),
            kind: "delay".into(),
            label: id.to_string(),
            enabled,
            failure_policy: policy,
            action: WorkflowRunAction::Delay { ms: 0 },
        }
    }

    /// `[delay, ok-step, failed-step(halt), delay]` — the halting failure aborts the
    /// trailing delay (`Skipped`); the run tallies `failed >= 1` and derives `Failed`.
    #[tokio::test]
    async fn halt_then_continue_sequence_ends_failed_with_trailing_step_skipped() {
        let steps = vec![
            delay_step("d1", FailurePolicy::Continue, true),
            delay_step("ok", FailurePolicy::Continue, true),
            delay_step("boom", FailurePolicy::Halt, true),
            delay_step("d2", FailurePolicy::Continue, true),
        ];
        let token = CancellationToken::new();
        let seen: Arc<std::sync::Mutex<Vec<(String, StepStatus)>>> =
            Arc::new(std::sync::Mutex::new(Vec::new()));
        let seen2 = seen.clone();
        let t = execute_steps(
            &steps,
            &token,
            |s, _tok| {
                let id = s.id.clone();
                Box::pin(async move {
                    if id == "boom" {
                        StepOutcome::failed("boom")
                    } else {
                        StepOutcome::ok()
                    }
                })
            },
            move |s, status, _msg| {
                seen2.lock().unwrap().push((s.id.clone(), status));
            },
        )
        .await;

        assert_eq!(t.ok, 2);
        assert_eq!(t.failed, 1);
        assert_eq!(t.skipped, 1);
        assert_eq!(t.cancelled, 0);
        assert_eq!(derive_status(&t), WorkflowRunStatus::Failed);

        let recorded = seen.lock().unwrap();
        assert_eq!(
            recorded.iter().find(|(id, _)| id == "d2").map(|(_, s)| *s),
            Some(StepStatus::Skipped)
        );
    }

    /// A step returning `Cancelled` marks it and every remaining step `Cancelled`;
    /// the derived status is `Cancelled` (dominates over any prior ok/failed tally).
    #[tokio::test]
    async fn cancel_mid_run_marks_current_and_remaining_steps_cancelled() {
        let steps = vec![
            delay_step("a", FailurePolicy::Continue, true),
            delay_step("cancel-here", FailurePolicy::Continue, true),
            delay_step("c", FailurePolicy::Continue, true),
        ];
        let token = CancellationToken::new();
        let t = execute_steps(
            &steps,
            &token,
            |s, _tok| {
                let id = s.id.clone();
                Box::pin(async move {
                    if id == "cancel-here" {
                        StepOutcome::cancelled("cancelled mid-run")
                    } else {
                        StepOutcome::ok()
                    }
                })
            },
            |_s, _status, _msg| {},
        )
        .await;

        assert_eq!(t.ok, 1);
        assert_eq!(t.cancelled, 2);
        assert_eq!(derive_status(&t), WorkflowRunStatus::Cancelled);
    }

    /// All steps disabled ⇒ every step is skipped, none run, and the run still
    /// derives `Completed` (no failure, no cancellation).
    #[tokio::test]
    async fn all_disabled_sequence_completes_with_everything_skipped() {
        let steps = vec![
            delay_step("a", FailurePolicy::Continue, false),
            delay_step("b", FailurePolicy::Continue, false),
            delay_step("c", FailurePolicy::Halt, false),
        ];
        let token = CancellationToken::new();
        let ran = Arc::new(AtomicUsize::new(0));
        let ran2 = ran.clone();
        let t = execute_steps(
            &steps,
            &token,
            move |_s, _tok| {
                ran2.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { StepOutcome::ok() })
            },
            |_s, _status, _msg| {},
        )
        .await;

        assert_eq!(t.skipped, 3);
        assert_eq!(t.ok, 0);
        assert_eq!(ran.load(Ordering::SeqCst), 0);
        assert_eq!(derive_status(&t), WorkflowRunStatus::Completed);
    }

    /// A workspace deleted after the run starts (mid-run) but before its
    /// `launchWorkspace` step executes fails at execution time with a clear
    /// message — not spuriously at plan-build time, and not a stale resolution.
    #[test]
    fn workspace_deleted_mid_run_fails_the_step_at_execution() {
        use crate::models::workspace::Workspace;
        use crate::storage::workspace_repo::WorkspaceRepo;

        let root = std::env::temp_dir().join(format!("devdock-test-{}", uuid::Uuid::new_v4()));
        fs_create(&root);
        let repo = WorkspaceRepo::new(&root);
        let mut ws = Workspace::new("Deleted Mid Run", "/tmp");
        repo.save(&mut ws).unwrap();

        // Simulate the workspace vanishing after the run started but before this
        // step runs (a delete race, not a stale plan snapshot).
        repo.delete(&ws.id).unwrap();

        let result = resolve_workspace(&root, &ws.id);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no longer exists"));

        std::fs::remove_dir_all(&root).ok();
    }

    fn fs_create(dir: &std::path::Path) {
        std::fs::create_dir_all(dir).unwrap();
    }
}
