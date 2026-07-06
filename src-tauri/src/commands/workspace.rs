//! Tauri command handlers for workspace CRUD. Thin wrappers over `WorkspaceRepo`
//! that resolve the app config dir and map errors to strings for the frontend.

use tauri::{AppHandle, Emitter, Manager};

use crate::models::workspace::Workspace;
use crate::storage::workspace_repo::WorkspaceRepo;

/// Notify all windows (main + popover) that the workspace set changed so each
/// re-fetches. Kept minimal (no payload) — listeners just refetch.
fn notify_changed(app: &AppHandle) {
    let _ = app.emit("workspaces:changed", ());
}

fn repo(app: &AppHandle) -> Result<WorkspaceRepo, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config directory unavailable: {e}"))?;
    Ok(WorkspaceRepo::new(dir))
}

#[tauri::command]
pub fn list_workspaces(app: AppHandle) -> Result<Vec<Workspace>, String> {
    repo(&app)?.list().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_workspace(app: AppHandle, id: String) -> Result<Workspace, String> {
    repo(&app)?.get(&id).map_err(|e| e.to_string())
}

/// Persist a workspace (create or update). Returns the stored value with its
/// bumped `updatedAt` so the frontend can sync.
#[tauri::command]
pub fn save_workspace(app: AppHandle, mut workspace: Workspace) -> Result<Workspace, String> {
    repo(&app)?
        .save(&mut workspace)
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(workspace)
}

#[tauri::command]
pub fn delete_workspace(app: AppHandle, id: String) -> Result<(), String> {
    repo(&app)?.delete(&id).map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn duplicate_workspace(app: AppHandle, id: String) -> Result<Workspace, String> {
    let ws = repo(&app)?.duplicate(&id).map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(ws)
}

/// Dev-only: seed a rich workspace exercising the full launch matrix (Phase 3):
/// an IDE, an iTerm2 terminal with cwd+command, a Docker dependency, an app, and
/// a browser URL. Not compiled into release builds.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn dev_seed_workspace(app: AppHandle) -> Result<Workspace, String> {
    use crate::models::workspace::{
        BrowserUrl, DependencyConfig, IdeConfig, OnTimeout, TerminalConfig,
    };

    let mut ws = Workspace::new("Sample Workspace", "/tmp");
    ws.description = Some("Dev-seeded workspace for launch-engine validation".into());
    ws.tags = vec!["sample".into()];
    ws.ide = Some(IdeConfig {
        app: "vscode".into(),
    });
    ws.terminals.push(TerminalConfig {
        id: "term-dev".into(),
        app: "iterm2".into(),
        cwd: ".".into(),
        command: "echo hello from devdock".into(),
        delay: 0,
    });
    ws.applications = vec!["docker-desktop".into()];
    ws.dependencies.push(DependencyConfig {
        id: "dep-docker".into(),
        kind: "docker".into(),
        start: true,
        check_cmd: Some("docker info".into()),
        timeout_secs: 60,
        poll_interval_ms: 1000,
        on_timeout: OnTimeout::SkipDependents,
        required: false,
    });
    ws.browser_urls.push(BrowserUrl {
        url: "https://tauri.app".into(),
        browser: None,
    });

    repo(&app)?.save(&mut ws).map_err(|e| e.to_string())?;
    Ok(ws)
}
