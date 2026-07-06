//! Launch engine commands: detection, launch, and single-step retry.

use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::launch::detect::{self, Detected};
use crate::launch::orchestrator::{self, LaunchSummary};
use crate::launch::run_plan::RunRegistry;
use crate::launch::{escape, launchers};
use crate::models::workspace::Workspace;
use crate::storage::workspace_repo::WorkspaceRepo;

/// Detect availability of the given tool ids (IDEs, terminals, apps, AI tools).
#[tauri::command]
pub fn detect_tools(ids: Vec<String>) -> Vec<Detected> {
    detect::detect_many(&ids)
}

/// Launch a workspace. Single-active: rejected if a run is already in progress.
/// Streams `launch:progress` events and returns a summary.
#[tauri::command]
pub async fn launch_workspace(
    app: AppHandle,
    workspace: Workspace,
) -> Result<LaunchSummary, String> {
    let run_id = uuid::Uuid::new_v4().to_string();
    let plan = orchestrator::build_plan(run_id.clone(), &workspace);

    // Reserve the single-active slot before awaiting; scope the state guard so it
    // is not held across the await.
    {
        let registry = app.state::<RunRegistry>();
        registry.begin(plan.clone()).map_err(|e| e.to_string())?;
    }

    let summary = orchestrator::execute_plan(&app, &plan).await;

    app.state::<RunRegistry>().end(&run_id);
    orchestrator::record_launch(&app, &workspace.id);
    Ok(summary)
}

/// Re-run a single failed step from the retained plan for `run_id`. Serialized
/// against a launch and other retries via the single-active slot (review H1).
#[tauri::command]
pub async fn retry_step(app: AppHandle, run_id: String, step_id: String) -> Result<String, String> {
    app.state::<RunRegistry>()
        .acquire_retry()
        .map_err(|e| e.to_string())?;
    let result = retry_inner(&app, &run_id, &step_id).await;
    app.state::<RunRegistry>().release_retry();
    result
}

async fn retry_inner(app: &AppHandle, run_id: &str, step_id: &str) -> Result<String, String> {
    let step = app
        .state::<RunRegistry>()
        .step(run_id, step_id)
        .ok_or_else(|| format!("no retained step '{step_id}' for run '{run_id}'"))?;
    let status = orchestrator::execute_step(app, run_id, &step).await;
    Ok(format!("{status:?}"))
}

/// Run a workspace's before-close hooks (best-effort). Called by the frontend on
/// a graceful window close before allowing the window to close. Force-quit /
/// crash / logout are NOT covered (documented limitation, review M1).
#[tauri::command]
pub async fn run_before_close_hooks(app: AppHandle, workspace_id: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let ws = WorkspaceRepo::new(dir)
        .get(&workspace_id)
        .map_err(|e| e.to_string())?;
    if ws.hooks.before_close.is_empty() {
        return Ok(());
    }

    let env: Vec<(String, String)> = ws
        .env_vars
        .iter()
        .map(|e| (e.key.clone(), e.value.clone()))
        .collect();
    let base = escape::resolve_dir(&ws.path, Path::new("/")).ok();

    for hook in &ws.hooks.before_close {
        let cwd = match hook.cwd.as_deref() {
            Some(c) => base.as_deref().and_then(|b| escape::resolve_dir(c, b).ok()),
            None => base.clone(),
        };
        // Best-effort: run each hook; an individual failure does not block close.
        let _ = launchers::run_hook(&hook.command, cwd.as_deref(), hook.timeout_secs, &env).await;
    }
    Ok(())
}
