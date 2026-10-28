//! Coding Friend desktop app: a window onto the `cf` CLI.

use tauri::webview::PageLoadEvent;
use tauri::Manager;

pub mod cf;
pub mod commands;
pub mod path_env;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Dialogs are shown from Rust only (confirms, pickers); no capability grants them to the page.
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

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
        .invoke_handler(tauri::generate_handler![
            commands::cf_version,
            commands::cf_doctor,
            commands::last_doctor,
            commands::project_list,
            commands::add_project,
            commands::project_remove,
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
            if payload.event() == PageLoadEvent::Finished && webview.label() == "main" {
                let _ = webview.window().show();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the Coding Friend app");
}
