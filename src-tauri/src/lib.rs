//! DevDock Tauri backend entrypoint.
//!
//! Plugins and commands are registered here. Workspace configs are owned by Rust
//! (JSON files in the app config dir); the launch engine (Phase 3) attaches its
//! own commands and capabilities later.

mod commands;
mod error;
pub mod launch;
mod models;
mod storage;

use commands::launch::{detect_tools, launch_workspace, retry_step, run_before_close_hooks};
use commands::workspace::{
    delete_workspace, duplicate_workspace, get_workspace, list_workspaces, save_workspace,
};
use launch::run_plan::RunRegistry;

/// Initialize structured logging. `tracing` is the single logging facade for the
/// backend; secret-bearing values (env var values, Phase 6) must be wrapped in a
/// redacting `Secret` newtype so they can never reach a subscriber.
fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,devdocks_lib=debug"));

    // `try_init` so repeated init in tests/dev does not panic.
    let _ = fmt().with_env_filter(filter).with_target(false).try_init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        // App-level settings only (theme, window, recents index) — NOT workspace
        // configs, which are JSON files owned by the storage layer.
        .plugin(tauri_plugin_store::Builder::new().build())
        // Single-active launch registry + retained plans for retry.
        .manage(RunRegistry::new());

    // The dev seed command is only compiled in debug builds.
    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        list_workspaces,
        get_workspace,
        save_workspace,
        delete_workspace,
        duplicate_workspace,
        detect_tools,
        launch_workspace,
        retry_step,
        run_before_close_hooks,
        commands::workspace::dev_seed_workspace
    ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        list_workspaces,
        get_workspace,
        save_workspace,
        delete_workspace,
        duplicate_workspace,
        detect_tools,
        launch_workspace,
        retry_step,
        run_before_close_hooks
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
