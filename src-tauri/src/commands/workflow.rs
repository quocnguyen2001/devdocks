//! Tauri command handlers for workflow CRUD + run/cancel. CRUD mirrors
//! `commands/workspace.rs` (repo helper + `notify_changed`). `run_workflow`
//! reserves the single-active slot synchronously (so a concurrent automation
//! is rejected immediately) then spawns the run and returns its `run_id`; the
//! terminal result arrives over `workflow:done`.

use tauri::{AppHandle, Emitter, Manager};

use crate::launch::run_plan::RunRegistry;
use crate::launch::workflow_run;
use crate::models::workflow::Workflow;
use crate::storage::workflow_repo::WorkflowRepo;

/// Notify all windows that the workflow set changed so each re-fetches.
fn notify_changed(app: &AppHandle) {
    let _ = app.emit("workflows:changed", ());
}

fn repo(app: &AppHandle) -> Result<WorkflowRepo, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config directory unavailable: {e}"))?;
    Ok(WorkflowRepo::new(dir))
}

#[tauri::command]
pub fn list_workflows(app: AppHandle) -> Result<Vec<Workflow>, String> {
    repo(&app)?.list().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_workflow(app: AppHandle, id: String) -> Result<Workflow, String> {
    repo(&app)?.get(&id).map_err(|e| e.to_string())
}

/// Persist a workflow (create or update). Returns the stored value with its
/// bumped `updatedAt` so the frontend can sync.
#[tauri::command]
pub fn save_workflow(app: AppHandle, mut workflow: Workflow) -> Result<Workflow, String> {
    repo(&app)?.save(&mut workflow).map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(workflow)
}

#[tauri::command]
pub fn delete_workflow(app: AppHandle, id: String) -> Result<(), String> {
    repo(&app)?.delete(&id).map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn duplicate_workflow(app: AppHandle, id: String) -> Result<Workflow, String> {
    let wf = repo(&app)?.duplicate(&id).map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(wf)
}

/// Run a workflow: reserves the single-active slot NOW (rejecting a concurrent
/// automation synchronously), then spawns the run and returns its `run_id`
/// immediately. The terminal result travels over `workflow:done`.
#[tauri::command]
pub async fn run_workflow(app: AppHandle, workflow_id: String) -> Result<String, String> {
    let wf = repo(&app)?.get(&workflow_id).map_err(|e| e.to_string())?;
    let run_id = uuid::Uuid::new_v4().to_string();
    let plan = workflow_run::build_workflow_plan(run_id.clone(), &wf);

    // Reserve NOW (rejects a concurrent automation synchronously). Guard frees the slot on drop.
    let guard =
        workflow_run::WorkflowRunGuard::begin(&app, run_id.clone()).map_err(|e| e.to_string())?;

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let guard = guard; // dropped at task end → frees slot (covers panic/normal/drop)
        let token = guard.token();
        let summary = workflow_run::execute_workflow(&app2, &plan, token).await; // emits workflow:done
                                                                                 // Persist coarse run history (best-effort; re-reads the file, see Phase 1 record_run).
        if let Ok(r) = repo(&app2) {
            if let Err(e) = r.record_run(
                &workflow_id,
                chrono::Utc::now().to_rfc3339(),
                summary.status,
            ) {
                tracing::warn!(error = %e, "failed to record workflow run");
            }
        }
        let _ = app2.emit("workflows:changed", ());
    });

    Ok(run_id) // returned immediately; terminal result arrives via `workflow:done`
}

/// Cancel whatever workflow run currently holds the single-active slot.
/// Idempotent; a no-op if nothing is running.
#[tauri::command]
pub fn cancel_active_run(app: AppHandle) -> Result<(), String> {
    app.state::<RunRegistry>().cancel_active_run();
    Ok(())
}
