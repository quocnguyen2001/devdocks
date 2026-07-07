//! The resolved launch plan and the single-active run registry.
//!
//! The orchestrator resolves each workspace item into a concrete `ResolvedAction`
//! ONCE (detection + path resolution), stores the plan keyed by `run_id`, then
//! executes it. The plan is retained after the run so `retry_step` re-executes a
//! single step from the stored resolution (red-team F4) — not a fresh recompute.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use tokio_util::sync::CancellationToken;

use crate::launch::{LaunchError, TermApp};
use crate::models::workspace::OnTimeout;

/// A concrete, resolved launch action. All variants execute via argv (no shell)
/// except `Terminal`, which uses the audited two-layer escaping.
#[derive(Debug, Clone)]
pub enum ResolvedAction {
    /// `open -a <app_name> [args…]`
    OpenApp { app_name: String, args: Vec<String> },
    /// A direct CLI binary (absolute path) with args.
    RunCli { bin: String, args: Vec<String> },
    /// A terminal window via `osascript` with a resolved absolute `cwd`.
    Terminal {
        term: TermApp,
        cwd: PathBuf,
        command: String,
        env: Vec<(String, String)>,
    },
    /// Warp: launch-only (`open -a Warp`); cwd/command unsupported.
    WarpLaunchOnly,
    /// `open [-a <browser>] <url>` (http/https only).
    OpenUrl {
        browser: Option<String>,
        url: String,
    },
    /// Optionally start a dependency app, then poll a readiness command.
    DependencyWait {
        start_app: Option<String>,
        check_cmd: Option<String>,
        timeout_secs: u64,
        poll_ms: u64,
        on_timeout: OnTimeout,
    },
    /// A user lifecycle hook: arbitrary shell (`sh -c <command>`) with injected
    /// env, an optional cwd, and a timeout. `command` is intentionally raw shell
    /// (the hook IS a shell command); env is passed via the process environment,
    /// never string-composed.
    Hook {
        command: String,
        cwd: Option<PathBuf>,
        timeout_secs: u64,
        env: Vec<(String, String)>,
    },
    /// Pre-resolved skip (e.g. tool not installed, path not found).
    Skip { reason: String },
}

#[derive(Debug, Clone)]
pub struct ResolvedStep {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub delay_ms: u64,
    /// A failure of a required step aborts the remaining run.
    pub required: bool,
    pub action: ResolvedAction,
}

#[derive(Debug, Clone)]
pub struct RunPlan {
    pub run_id: String,
    pub workspace_id: String,
    pub steps: Vec<ResolvedStep>,
}

/// Enforces single-active launches and retains the most recent plan for retry.
#[derive(Default)]
pub struct RunRegistry {
    active: Mutex<Option<String>>,
    plans: Mutex<HashMap<String, RunPlan>>,
    /// The one active workflow run's cancel token (never a map — only one
    /// automation is ever active, sharing `active` with launches).
    workflow_token: Mutex<Option<(String, CancellationToken)>>,
}

impl RunRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Sentinel occupying the active slot while a retry runs.
    const RETRY_TOKEN: &'static str = "__retry__";

    // Poison-safe locks: the critical sections hold no `.await` and no user
    // closures, so recovering the inner value on poison is safe and avoids
    // turning one panic into a permanently-broken launch path (review L1).
    fn lock_active(&self) -> std::sync::MutexGuard<'_, Option<String>> {
        self.active.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn lock_plans(&self) -> std::sync::MutexGuard<'_, HashMap<String, RunPlan>> {
        self.plans.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Begin a run if none is active. Retains the plan (replacing any prior one).
    pub fn begin(&self, plan: RunPlan) -> Result<(), LaunchError> {
        let mut active = self.lock_active();
        if active.is_some() {
            return Err(LaunchError::AlreadyRunning);
        }
        let run_id = plan.run_id.clone();
        // Retain only the current run's plan (bounded memory).
        let mut plans = self.lock_plans();
        plans.clear();
        plans.insert(run_id.clone(), plan);
        *active = Some(run_id);
        Ok(())
    }

    /// End the active run (the plan stays retained for retry).
    pub fn end(&self, run_id: &str) {
        let mut active = self.lock_active();
        if active.as_deref() == Some(run_id) {
            *active = None;
        }
    }

    /// Reserve the single-active slot for a retry, serializing it against a
    /// launch and against other retries (review H1). Pair with `release_retry`.
    pub fn acquire_retry(&self) -> Result<(), LaunchError> {
        let mut active = self.lock_active();
        if active.is_some() {
            return Err(LaunchError::AlreadyRunning);
        }
        *active = Some(Self::RETRY_TOKEN.to_string());
        Ok(())
    }

    pub fn release_retry(&self) {
        let mut active = self.lock_active();
        if active.as_deref() == Some(Self::RETRY_TOKEN) {
            *active = None;
        }
    }

    /// Fetch a retained step for `retry_step`.
    pub fn step(&self, run_id: &str, step_id: &str) -> Option<ResolvedStep> {
        let plans = self.lock_plans();
        plans
            .get(run_id)?
            .steps
            .iter()
            .find(|s| s.id == step_id)
            .cloned()
    }

    fn lock_workflow_token(
        &self,
    ) -> std::sync::MutexGuard<'_, Option<(String, CancellationToken)>> {
        self.workflow_token
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    /// Reserve the single-active slot for a workflow run, storing its cancel token.
    /// Shares `active` with launches → mutual exclusion of all automation. The caller MUST
    /// wrap the run in a `WorkflowRunGuard` so the slot is freed on ANY exit.
    pub fn reserve_workflow(&self, run_id: String) -> Result<CancellationToken, LaunchError> {
        let mut active = self.lock_active();
        if active.is_some() {
            return Err(LaunchError::AlreadyRunning);
        }
        let token = CancellationToken::new();
        *self.lock_workflow_token() = Some((run_id.clone(), token.clone()));
        *active = Some(run_id);
        Ok(token)
    }

    /// Free the slot + clear the token. Idempotent; only acts if `run_id` still owns the slot.
    pub fn finish_workflow(&self, run_id: &str) {
        let mut active = self.lock_active();
        if active.as_deref() == Some(run_id) {
            *active = None;
        }
        let mut tok = self.lock_workflow_token();
        if tok.as_ref().map(|(id, _)| id.as_str()) == Some(run_id) {
            *tok = None;
        }
    }

    /// Cancel whatever workflow run currently holds the active slot. Works without the
    /// frontend knowing the run_id (covers popover-initiated runs). Idempotent.
    pub fn cancel_active_run(&self) -> bool {
        match &*self.lock_workflow_token() {
            Some((_, token)) => {
                token.cancel();
                true
            }
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan(run_id: &str) -> RunPlan {
        RunPlan {
            run_id: run_id.to_string(),
            workspace_id: "ws".to_string(),
            steps: Vec::new(),
        }
    }

    #[test]
    fn reserve_workflow_blocks_second_reserve_and_launch() {
        let reg = RunRegistry::default();
        let _token = reg.reserve_workflow("wf-1".to_string()).unwrap();

        // A second workflow reservation is rejected while one is active.
        assert!(matches!(
            reg.reserve_workflow("wf-2".to_string()),
            Err(LaunchError::AlreadyRunning)
        ));
        // A workspace launch shares the same gate and is also rejected.
        assert!(matches!(
            reg.begin(plan("launch-1")),
            Err(LaunchError::AlreadyRunning)
        ));
        // And a retry cannot slip in either.
        assert!(matches!(
            reg.acquire_retry(),
            Err(LaunchError::AlreadyRunning)
        ));
    }

    #[test]
    fn active_launch_blocks_workflow_reservation() {
        let reg = RunRegistry::default();
        reg.begin(plan("launch-1")).unwrap();
        assert!(matches!(
            reg.reserve_workflow("wf-1".to_string()),
            Err(LaunchError::AlreadyRunning)
        ));
    }

    #[test]
    fn cancel_active_run_cancels_the_stored_token() {
        let reg = RunRegistry::default();
        let token = reg.reserve_workflow("wf-1".to_string()).unwrap();
        assert!(!token.is_cancelled());
        assert!(reg.cancel_active_run());
        assert!(token.is_cancelled());
    }

    #[test]
    fn cancel_active_run_is_noop_with_no_active_workflow() {
        let reg = RunRegistry::default();
        assert!(!reg.cancel_active_run());
    }

    #[test]
    fn finish_workflow_frees_slot_and_clears_token() {
        let reg = RunRegistry::default();
        let _token = reg.reserve_workflow("wf-1".to_string()).unwrap();
        reg.finish_workflow("wf-1");

        // Slot is free: a new workflow and a launch can both proceed now.
        assert!(reg.reserve_workflow("wf-2".to_string()).is_ok());
        reg.finish_workflow("wf-2");
        assert!(reg.begin(plan("launch-1")).is_ok());
    }

    #[test]
    fn finish_workflow_ignores_a_stale_run_id() {
        let reg = RunRegistry::default();
        let _token = reg.reserve_workflow("wf-1".to_string()).unwrap();
        // A finish for a different run must not free the live slot.
        reg.finish_workflow("wf-other");
        assert!(matches!(
            reg.reserve_workflow("wf-2".to_string()),
            Err(LaunchError::AlreadyRunning)
        ));
    }
}
