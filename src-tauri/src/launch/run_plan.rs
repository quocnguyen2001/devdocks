//! The resolved launch plan and the single-active run registry.
//!
//! The orchestrator resolves each workspace item into a concrete `ResolvedAction`
//! ONCE (detection + path resolution), stores the plan keyed by `run_id`, then
//! executes it. The plan is retained after the run so `retry_step` re-executes a
//! single step from the stored resolution (red-team F4) — not a fresh recompute.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

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
}
