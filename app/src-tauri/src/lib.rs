//! Coding Friend desktop app: a window onto the `cf` CLI.

use tauri::webview::PageLoadEvent;
use tauri::{ActivationPolicy, AppHandle, Manager, RunEvent, WindowEvent};

pub mod cf;
pub mod commands;
pub mod path_env;
mod tray;
mod updater;

const WINDOW: &str = "main";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Dialogs are shown from Rust only (confirms, pickers); no capability grants them to the page.
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // URLs open from Rust only (`open_url`); no link-click script is injected into the page.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        );

    // MCP bridge for agent-driven debugging (DOM, IPC, screenshots); never in release builds.
    #[cfg(debug_assertions)]
    let builder = builder.plugin(
        tauri_plugin_mcp_bridge::Builder::new()
            .bind_address("127.0.0.1")
            .build(),
    );

    builder
        .manage(commands::LastDoctor::default())
        .manage(commands::MutationLock::default())
        .manage(commands::KnownProjects::default())
        .invoke_handler(tauri::generate_handler![
            commands::cf_version,
            commands::cf_doctor,
            commands::last_doctor,
            commands::project_list,
            commands::add_project,
            commands::project_remove,
            commands::config_view,
            commands::config_schema,
            commands::config_set,
            commands::open_url,
            commands::task_list,
            commands::chef_status,
            commands::supervisor_status,
            commands::update_check,
            commands::update_yes,
            commands::run_fix,
            commands::check_cli,
            commands::get_cf_info,
            commands::choose_cf_path,
            commands::clear_cf_path,
        ])
        .setup(|app| {
            // settings.json (with the user's cfBinPath) lives in the app's config dir.
            if let Ok(dir) = app.path().app_config_dir() {
                cf::set_config_dir(dir);
            }
            // Probe the login shell's PATH off the main thread, so the window opens at once;
            // `path_env::login_path()` callers wait for this same probe.
            tauri::async_runtime::spawn(path_env::login_path());
            // Closing the window hides it; the app lives on in the menu bar until Quit.
            if let Some(window) = app.get_webview_window(WINDOW) {
                let handle = app.handle().clone();
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                        let _ = handle.set_activation_policy(ActivationPolicy::Accessory);
                    }
                });
            }
            tray::build(app)?;
            updater::install(app);
            // Granted at runtime so capabilities/default.json stays release-only.
            #[cfg(debug_assertions)]
            {
                app.add_capability(
                    tauri::ipc::CapabilityBuilder::new("mcp-bridge")
                        .window("main")
                        .permission("mcp-bridge:default"),
                )?;
            }
            Ok(())
        })
        // The main window starts hidden (tauri.conf.json) and shows once its page has loaded:
        // main.tsx sets the light/dark theme before that, so a dark-mode launch never flashes light.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished && webview.label() == WINDOW {
                show_window(webview.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running the Coding Friend app")
        .run(|app, event| {
            // Opening the app again (Finder, Spotlight, the Dock) brings the hidden window back.
            if let RunEvent::Reopen { .. } = event {
                show_window(app);
            }
        });
}

/// Show and focus the main window. Like dotlore: a Dock icon (Regular) while the window is
/// shown, menu bar only (Accessory) while it is hidden.
pub(crate) fn show_window(app: &AppHandle) {
    let _ = app.set_activation_policy(ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
