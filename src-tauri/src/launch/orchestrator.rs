//! Launch orchestration: resolve a workspace into a plan (detection + paths, once),
//! execute it with live progress events and per-step error isolation, and support
//! single-step retry from the retained plan.
//!
//! Steps run in a canonical order (dependencies → IDE → terminals → apps → AI
//! tools → browser URLs). Honoring a custom `startup_sequence` is a follow-up.

use std::path::Path;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::launch::detect::{self, DetectMethod};
use crate::launch::launchers::run_action;
use crate::launch::run_plan::{ResolvedAction, ResolvedStep, RunPlan};
use crate::launch::{escape, LaunchProgress, StepStatus, TermApp};
use crate::models::workspace::{FailurePolicy, HookConfig, OnTimeout, Workspace};
use crate::storage::workspace_repo::WorkspaceRepo;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSummary {
    pub run_id: String,
    pub total: usize,
    pub ok: usize,
    pub failed: usize,
    pub skipped: usize,
    pub partial: bool,
}

/// Build the resolved plan. Detection and path resolution happen here, once, so
/// `retry_step` re-executes from the stored resolution.
pub fn build_plan(run_id: String, ws: &Workspace) -> RunPlan {
    let base = escape::resolve_dir(&ws.path, Path::new("/")).ok();
    let base_str = base.as_ref().map(|p| p.to_string_lossy().into_owned());
    let env: Vec<(String, String)> = ws
        .env_vars
        .iter()
        .map(|e| (e.key.clone(), e.value.clone()))
        .collect();
    let mut steps: Vec<ResolvedStep> = Vec::new();

    // Before-launch hooks run first.
    steps.extend(hook_steps(
        &ws.hooks.before_launch,
        base.as_deref(),
        &env,
        "Before-launch",
    ));

    // Dependencies (e.g. Docker) first.
    for dep in &ws.dependencies {
        let start_app = if dep.start && dep.kind.eq_ignore_ascii_case("docker") {
            Some("Docker".to_string())
        } else {
            None
        };
        steps.push(ResolvedStep {
            id: dep.id.clone(),
            kind: "dependency".into(),
            label: format!("Wait for {}", dep.kind),
            delay_ms: 0,
            required: dep.required || matches!(dep.on_timeout, OnTimeout::FailRun),
            action: ResolvedAction::DependencyWait {
                start_app,
                check_cmd: dep.check_cmd.clone(),
                timeout_secs: dep.timeout_secs,
                poll_ms: dep.poll_interval_ms,
                on_timeout: dep.on_timeout,
            },
        });
    }

    // IDE.
    if let Some(ide) = &ws.ide {
        let det = detect::detect(&ide.app, None);
        let action = if !det.available {
            ResolvedAction::Skip {
                reason: format!("{} not installed", ide.app),
            }
        } else if let Some(base) = &base_str {
            match (det.method, det.resolved_path) {
                (DetectMethod::Cli, Some(bin)) => ResolvedAction::RunCli {
                    bin,
                    args: vec![base.clone()],
                },
                _ => ResolvedAction::OpenApp {
                    app_name: detect::app_name(&ide.app).unwrap_or(&ide.app).to_string(),
                    args: vec![base.clone()],
                },
            }
        } else {
            ResolvedAction::Skip {
                reason: "workspace path not found".into(),
            }
        };
        steps.push(ResolvedStep {
            id: format!("ide-{}", ide.app),
            kind: "ide".into(),
            label: format!("Open IDE ({})", ide.app),
            delay_ms: 0,
            required: false,
            action,
        });
    }

    // Terminals.
    for t in &ws.terminals {
        let action = if t.app.eq_ignore_ascii_case("warp") {
            ResolvedAction::WarpLaunchOnly
        } else {
            let term = match t.app.as_str() {
                "iterm2" => Some(TermApp::Iterm2),
                "terminal" => Some(TermApp::Terminal),
                _ => None,
            };
            match (term, &base) {
                (None, _) => ResolvedAction::Skip {
                    reason: format!("unsupported terminal: {}", t.app),
                },
                (Some(_), None) => ResolvedAction::Skip {
                    reason: "workspace path not found".into(),
                },
                (Some(term), Some(base)) => match escape::resolve_dir(&t.cwd, base) {
                    Ok(cwd) => ResolvedAction::Terminal {
                        term,
                        cwd,
                        command: t.command.clone(),
                        env: env.clone(),
                    },
                    Err(_) => ResolvedAction::Skip {
                        reason: format!("terminal cwd not found: {}", t.cwd),
                    },
                },
            }
        };
        steps.push(ResolvedStep {
            id: format!("terminal-{}", t.id),
            kind: "terminal".into(),
            label: format!("Terminal ({})", t.app),
            delay_ms: t.delay,
            required: false,
            action,
        });
    }

    // Additional applications + AI tools (CLI if the tool has one, else `open -a`).
    for app_id in ws.applications.iter().chain(ws.ai_tools.iter()) {
        let det = detect::detect(app_id, None);
        let action = match (det.available, det.method, det.resolved_path) {
            (true, DetectMethod::Cli, Some(bin)) => ResolvedAction::RunCli { bin, args: vec![] },
            (true, _, _) => ResolvedAction::OpenApp {
                app_name: detect::app_name(app_id).unwrap_or(app_id).to_string(),
                args: vec![],
            },
            (false, _, _) => ResolvedAction::Skip {
                reason: format!("{app_id} not installed"),
            },
        };
        steps.push(ResolvedStep {
            id: format!("app-{app_id}"),
            kind: "application".into(),
            label: format!("Launch {app_id}"),
            delay_ms: 0,
            required: false,
            action,
        });
    }

    // Browser URLs.
    for (i, u) in ws.browser_urls.iter().enumerate() {
        steps.push(ResolvedStep {
            id: format!("url-{i}"),
            kind: "browser".into(),
            label: format!("Open {}", u.url),
            delay_ms: 0,
            required: false,
            action: ResolvedAction::OpenUrl {
                browser: u.browser.clone(),
                url: u.url.clone(),
            },
        });
    }

    // After-launch hooks run last.
    steps.extend(hook_steps(
        &ws.hooks.after_launch,
        base.as_deref(),
        &env,
        "After-launch",
    ));

    RunPlan {
        run_id,
        workspace_id: ws.id.clone(),
        steps,
    }
}

/// Build hook steps for a lifecycle phase. A hook with no `cwd` runs in the
/// workspace dir; `failure_policy = Halt` makes the step `required` (its failure
/// aborts the remaining run).
fn hook_steps(
    hooks: &[HookConfig],
    base: Option<&Path>,
    env: &[(String, String)],
    phase: &str,
) -> Vec<ResolvedStep> {
    hooks
        .iter()
        .enumerate()
        .map(|(i, h)| {
            let cwd = match h.cwd.as_deref() {
                Some(c) => base.and_then(|b| escape::resolve_dir(c, b).ok()),
                None => base.map(Path::to_path_buf),
            };
            ResolvedStep {
                id: format!("hook-{phase}-{i}"),
                kind: "hook".into(),
                label: format!("{phase} hook: {}", truncate(&h.command, 40)),
                delay_ms: 0,
                required: matches!(h.failure_policy, FailurePolicy::Halt),
                action: ResolvedAction::Hook {
                    command: h.command.clone(),
                    cwd,
                    timeout_secs: h.timeout_secs,
                    env: env.to_vec(),
                },
            }
        })
        .collect()
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() > n {
        format!("{}…", s.chars().take(n).collect::<String>())
    } else {
        s.to_string()
    }
}

/// Execute a plan, emitting progress. A non-required step's failure is isolated;
/// a required step's failure aborts the remaining steps (reported as skipped).
pub async fn execute_plan(app: &AppHandle, plan: &RunPlan) -> LaunchSummary {
    let (mut ok, mut failed, mut skipped) = (0usize, 0usize, 0usize);
    let mut aborted = false;

    for step in &plan.steps {
        if aborted {
            emit(
                app,
                &plan.run_id,
                step,
                StepStatus::Skipped,
                Some("aborted after a required step failed"),
            );
            skipped += 1;
            continue;
        }
        if step.delay_ms > 0 {
            tokio::time::sleep(Duration::from_millis(step.delay_ms)).await;
        }
        emit(app, &plan.run_id, step, StepStatus::Running, None);
        let outcome = run_action(&step.action).await;
        match outcome.status {
            StepStatus::Ok => ok += 1,
            StepStatus::Skipped => skipped += 1,
            StepStatus::Failed => {
                failed += 1;
                if step.required {
                    aborted = true;
                }
            }
            StepStatus::Pending | StepStatus::Running => {}
        }
        emit(
            app,
            &plan.run_id,
            step,
            outcome.status,
            outcome.message.as_deref(),
        );
    }

    let summary = LaunchSummary {
        run_id: plan.run_id.clone(),
        total: plan.steps.len(),
        ok,
        failed,
        skipped,
        partial: failed > 0 || skipped > 0,
    };
    let _ = app.emit("launch:done", &summary);
    summary
}

/// Re-execute a single retained step (for `retry_step`), emitting its progress.
pub async fn execute_step(app: &AppHandle, run_id: &str, step: &ResolvedStep) -> StepStatus {
    emit(app, run_id, step, StepStatus::Running, None);
    let outcome = run_action(&step.action).await;
    emit(
        app,
        run_id,
        step,
        outcome.status,
        outcome.message.as_deref(),
    );
    outcome.status
}

fn emit(
    app: &AppHandle,
    run_id: &str,
    step: &ResolvedStep,
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
    let _ = app.emit("launch:progress", &payload);
}

/// Update `metadata.last_launched` for the workspace (best-effort; env excluded).
pub fn record_launch(app: &AppHandle, workspace_id: &str) {
    let Ok(dir) = app.path().app_config_dir() else {
        return;
    };
    let repo = WorkspaceRepo::new(dir);
    if let Err(e) = repo.record_launched(workspace_id, chrono::Utc::now().to_rfc3339()) {
        tracing::warn!(error = %e, "failed to record last_launched");
    }
    // Recents changed → let both windows (incl. the popover) refresh.
    let _ = app.emit("workspaces:changed", ());
}
