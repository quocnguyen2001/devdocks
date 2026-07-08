//! DevDock Tauri backend entrypoint.
//!
//! Plugins and commands are registered here. Workspace configs are owned by Rust
//! (JSON files in the app config dir). This also wires the macOS menu-bar tray +
//! single-instance; close-to-menu-bar (hide, not quit) is handled in the frontend
//! (`src/App.tsx`) as the single close handler.

mod commands;
mod error;
pub mod launch;
mod models;
mod storage;

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use commands::launch::{detect_tools, launch_workspace, retry_step, run_before_close_hooks};
use commands::workflow::{
    cancel_active_run, delete_workflow, duplicate_workflow, get_workflow, list_workflows,
    run_workflow, save_workflow,
};
use commands::workspace::{
    delete_workspace, duplicate_workspace, get_workspace, list_workspaces, save_workspace,
};
use launch::run_plan::RunRegistry;

/// Initialize structured logging. `tracing` is the single logging facade for the
/// backend; secret-bearing values (env var values) are wrapped in a redacting
/// `Secret` newtype so they can never reach a subscriber.
fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,devdocks_lib=debug"));

    // `try_init` so repeated init in tests/dev does not panic.
    let _ = fmt().with_env_filter(filter).with_target(false).try_init();
}

/// Reveal + focus the main window (tray "Open", tray left-click, second launch).
fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Toggle the tray popover: hide if visible, else position it under the tray icon
/// and show + focus it (Phase 4).
fn toggle_popover(app: &AppHandle) {
    use tauri_plugin_positioner::{Position, WindowExt};
    let Some(popover) = app.get_webview_window("popover") else {
        return;
    };
    if popover.is_visible().unwrap_or(false) {
        let _ = popover.hide();
    } else {
        let _ = popover.move_window(Position::TrayCenter);
        let _ = popover.show();
        let _ = popover.set_focus();
        // Tell the popover to refresh its data on show.
        let _ = app.emit("popover:shown", ());
    }
}

/// Reveal the main window (popover footer "Open DevDock").
#[tauri::command]
fn open_main_window(app: AppHandle) {
    show_main(&app);
}

/// Quit the whole app (popover footer "Quit").
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Apply NSVisualEffectView vibrancy to the main window (sidebar material) and
/// the popover (popover material). Non-fatal: a failure is logged, never panics,
/// and the translucent app surfaces remain readable without the effect.
#[cfg(target_os = "macos")]
fn apply_window_vibrancy(app: &AppHandle) {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

    if let Some(main) = app.get_webview_window("main") {
        if let Err(e) = apply_vibrancy(
            &main,
            NSVisualEffectMaterial::Sidebar,
            Some(NSVisualEffectState::Active),
            None,
        ) {
            tracing::warn!(error = %e, "failed to apply main-window vibrancy");
        }
    }
    // The popover intentionally gets NO vibrancy: on macOS 26 the visual-effect
    // view's corner-radius clip is unreliable, leaving a square material corner
    // poking past the DOM panel's rounded border. Instead the popover renders an
    // opaque rounded card on its transparent window and relies on the native
    // window shadow (tauri.conf.json) to hug that rounded shape.
}

/// Build the menu-bar tray: an embedded monochrome template icon, a right-click
/// Open/Quit menu, and a left-click that reveals the main window. (Phase 4 swaps
/// the left-click to toggle the popover.)
fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItemBuilder::with_id("open", "Open DevDock").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit DevDock").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&open_item, &quit_item])
        .build()?;

    // Embedded so the tray icon can never be a missing file at runtime (red-team
    // "no-surface" guard): with the window hidden, the tray must always exist.
    let icon = Image::from_bytes(include_bytes!("../icons/tray-icon-Template.png"))?;

    TrayIconBuilder::with_id("devdock-tray")
        .icon(icon)
        .icon_as_template(true)
        .show_menu_on_left_click(false)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Positioner needs the tray rect to place the popover under the icon.
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_popover(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

    let builder = tauri::Builder::default()
        // Single-instance MUST be registered first; focus the existing window on a
        // second launch instead of spawning a duplicate menu-bar app.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        // Launch-at-login: a macOS LaunchAgent, toggled from Settings. No launch
        // args are passed so a login start behaves like a normal launch.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        // App-level settings only (theme, window, recents index) — NOT workspace
        // configs, which are JSON files owned by the storage layer.
        .plugin(tauri_plugin_store::Builder::new().build())
        // Single-active launch registry + retained plans for retry.
        .manage(RunRegistry::new())
        .setup(|app| {
            setup_tray(app.handle())?;
            #[cfg(target_os = "macos")]
            apply_window_vibrancy(app.handle());
            Ok(())
        });

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
        open_main_window,
        quit_app,
        list_workflows,
        get_workflow,
        save_workflow,
        delete_workflow,
        duplicate_workflow,
        run_workflow,
        cancel_active_run,
        commands::fonts::list_system_fonts,
        commands::apps::list_installed_apps,
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
        run_before_close_hooks,
        open_main_window,
        quit_app,
        list_workflows,
        get_workflow,
        save_workflow,
        delete_workflow,
        duplicate_workflow,
        run_workflow,
        cancel_active_run,
        commands::fonts::list_system_fonts,
        commands::apps::list_installed_apps
    ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if app.state::<RunRegistry>().cancel_active_run() {
                    // Give the spawned run task a moment to observe cancellation and let
                    // run_hook's kill_on_drop SIGKILL the in-flight script child.
                    std::thread::sleep(std::time::Duration::from_millis(2000));
                }
            }
        });
}
