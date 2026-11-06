//! The macOS status item: the logo as a template image, and a menu of status rows rebuilt on
//! every refresh. `task list` and `supervisor status` refresh every minute, `doctor` every ten
//! (the UI's own doctor runs land in `LastDoctor` too); all of it off the main thread, through
//! the same `commands` the window calls.

use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use serde_json::Value;
use tauri::image::Image;
use tauri::include_image;
use tauri::menu::{Menu, MenuBuilder, MenuEvent, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, AppHandle, Manager};

use crate::cf::CfError;
use crate::commands::{self, LastDoctor};
use crate::{show_window, updater};

/// The CF logo in black + alpha, 36 px = 18 pt @2x (tray-icon draws it 18 pt tall).
const ICON: Image<'_> = include_image!("icons/tray-template.png");
const TRAY_ID: &str = "main";
const STATUS_INTERVAL: Duration = Duration::from_secs(60);
const DOCTOR_INTERVAL: Duration = Duration::from_secs(10 * 60);
/// Longest status row: details come from the CLI and a menu is not a log viewer.
const LABEL_MAX: usize = 80;

const ID_OPEN: &str = "open";
const ID_CHECK_UPDATES: &str = "check-updates";
const ID_QUIT: &str = "quit";
const OPEN: &str = "Open Coding Friend";
const CHECK_UPDATES: &str = "Check for Updates…";
const QUIT: &str = "Quit";
const CLI_NOT_FOUND: &str = "Coding Friend CLI not found";

/// The status rows, as labels. The memory daemon's row is read from `LastDoctor` on each
/// rebuild, so a doctor run from the window shows up at the next refresh.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrayView {
    cli_missing: bool,
    /// The last status refresh reached the CLI (no doctor yet then means "pending").
    cli_answered: bool,
    tasks: String,
    daemon: String,
    supervisor: String,
}

impl Default for TrayView {
    fn default() -> Self {
        Self {
            cli_missing: false,
            cli_answered: true,
            tasks: "Running tasks: …".to_string(),
            daemon: daemon_label(None, true),
            supervisor: "Supervisor: …".to_string(),
        }
    }
}

/// Create the status item and start its refresh loops.
pub fn build(app: &App) -> tauri::Result<()> {
    let view = TrayView::default();
    let menu = build_menu(app.handle(), &view)?;
    app.manage(Mutex::new(view));
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(ICON)
        .icon_as_template(true)
        .tooltip("Coding Friend")
        .menu(&menu)
        .on_menu_event(on_menu)
        .build(app)?;

    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        loop {
            refresh_status(&handle).await;
            tokio::time::sleep(STATUS_INTERVAL).await;
        }
    });
    // The window's version gate runs doctor at launch, so the first tray run waits a round.
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(DOCTOR_INTERVAL).await;
            if let Err(err) = commands::cf_doctor(handle.state::<LastDoctor>()).await {
                eprintln!("coding-friend: tray doctor: {err:?}");
            }
            rebuild(&handle);
        }
    });
    Ok(())
}

async fn refresh_status(app: &AppHandle) {
    let (tasks, supervisor) = tokio::join!(commands::task_list(), commands::supervisor_status());
    {
        let state = app.state::<Mutex<TrayView>>();
        let mut view = state.lock().unwrap_or_else(PoisonError::into_inner);
        view.cli_missing = [&tasks, &supervisor]
            .iter()
            .any(|result| matches!(result, Err(CfError::CliNotFound { .. })));
        view.cli_answered = tasks.is_ok() || supervisor.is_ok();
        view.tasks = tasks_label(&tasks);
        view.supervisor = supervisor_label(&supervisor);
    }
    rebuild(app);
}

/// Rebuild the menu on the main thread, from the stored rows and the last doctor result.
fn rebuild(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let view = {
            let state = handle.state::<Mutex<TrayView>>();
            let mut view = state.lock().unwrap_or_else(PoisonError::into_inner);
            view.daemon = daemon_label(
                handle.state::<LastDoctor>().get().as_ref(),
                view.cli_answered,
            );
            view.clone()
        };
        let Some(tray) = handle.tray_by_id(TRAY_ID) else {
            return;
        };
        match build_menu(&handle, &view) {
            Ok(menu) => {
                if let Err(err) = tray.set_menu(Some(menu)) {
                    eprintln!("coding-friend: tray menu: {err}");
                }
            }
            Err(err) => eprintln!("coding-friend: tray menu: {err}"),
        }
    });
}

fn on_menu(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        ID_OPEN => show_window(app),
        ID_CHECK_UPDATES => updater::check_now(app),
        ID_QUIT => app.exit(0),
        _ => {}
    }
}

fn build_menu(app: &AppHandle, view: &TrayView) -> tauri::Result<Menu<tauri::Wry>> {
    let mut menu = MenuBuilder::new(app);
    let mut rows = 0usize;
    for row in menu_labels(view) {
        match row.as_deref() {
            None => menu = menu.separator(),
            Some(OPEN) => menu = menu.text(ID_OPEN, OPEN),
            Some(CHECK_UPDATES) => menu = menu.text(ID_CHECK_UPDATES, CHECK_UPDATES),
            Some(QUIT) => menu = menu.text(ID_QUIT, QUIT),
            Some(text) => {
                rows += 1;
                let item =
                    MenuItem::with_id(app, format!("status-{rows}"), text, false, None::<&str>)?;
                menu = menu.item(&item);
            }
        }
    }
    menu.build()
}

/// Menu rows: `Some(label)` or `None` for a separator. Status rows (disabled) first, then the
/// actions, and always Quit last: with the window hidden it is the only way out.
pub fn menu_labels(view: &TrayView) -> Vec<Option<String>> {
    let mut items = if view.cli_missing {
        vec![Some(CLI_NOT_FOUND.to_string())]
    } else {
        vec![
            Some(view.tasks.clone()),
            Some(view.daemon.clone()),
            Some(view.supervisor.clone()),
        ]
    };
    items.extend([
        None,
        Some(OPEN.to_string()),
        Some(CHECK_UPDATES.to_string()),
        None,
        Some(QUIT.to_string()),
    ]);
    items
}

/// Tasks a worker is on right now: `running`, or `waiting` on an answer.
fn running_tasks(tasks: &Value) -> Option<usize> {
    let tasks = tasks.as_array()?;
    Some(
        tasks
            .iter()
            .filter(|task| matches!(task["state"].as_str(), Some("running" | "waiting")))
            .count(),
    )
}

fn tasks_label(tasks: &Result<Value, CfError>) -> String {
    match tasks.as_ref().ok().and_then(running_tasks) {
        Some(n) => format!("Running tasks: {n}"),
        None => "Running tasks: unavailable".to_string(),
    }
}

/// The `memory.daemon` check of the last doctor run: its detail ("running"), else its status.
/// No doctor yet reads as pending while the CLI answers, else as unavailable like the other rows.
fn daemon_label(doctor: Option<&Value>, cli_answered: bool) -> String {
    let Some(doctor) = doctor else {
        return if cli_answered {
            "Memory daemon: …".to_string()
        } else {
            "Memory daemon: unavailable".to_string()
        };
    };
    let check = doctor["checks"]
        .as_array()
        .and_then(|checks| checks.iter().find(|check| check["id"] == "memory.daemon"));
    let text = check
        .and_then(|check| check["detail"].as_str().or(check["status"].as_str()))
        .unwrap_or("unknown");
    format!("Memory daemon: {}", one_line(text))
}

/// Same wording as the sidebar's `describeSupervisor` (app/src/components/Sidebar.tsx).
fn supervisor_label(status: &Result<Value, CfError>) -> String {
    let Ok(status) = status else {
        return "Supervisor: unavailable".to_string();
    };
    let launchd = &status["launchd"];
    if status["supported"] != true || !launchd.is_object() {
        return "Supervisor: not available here".to_string();
    }
    let mut parts = vec![if launchd["needsReinstall"] == true {
        "needs reinstall".to_string()
    } else if launchd["loaded"] == true {
        "on".to_string()
    } else {
        "off".to_string()
    }];
    parts.push(match status["heartbeat"]["ageSeconds"].as_f64() {
        Some(age) => format!("last tick {} ago", format_age(age)),
        None => "no tick yet".to_string(),
    });
    for key in ["paused", "orphaned"] {
        match status[key].as_u64() {
            Some(n) if n > 0 => parts.push(format!("{n} {key}")),
            _ => {}
        }
    }
    format!("Supervisor: {}", parts.join(" · "))
}

fn format_age(seconds: f64) -> String {
    if seconds < 60.0 {
        format!("{} s", seconds.round())
    } else if seconds < 3600.0 {
        format!("{} min", (seconds / 60.0).round())
    } else if seconds < 86400.0 {
        format!("{} h", (seconds / 3600.0).round())
    } else {
        format!("{} d", (seconds / 86400.0).round())
    }
}

/// One bounded line: AppKit lays a newline out inside a menu item, and a bidi override would
/// reverse the rest of the label. A legibility guard, not a spoofing filter.
fn one_line(text: &str) -> String {
    let printable: String = text
        .chars()
        .filter(|c| (!c.is_control() || c.is_whitespace()) && !is_bidi_control(*c))
        .collect();
    let flat = printable.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= LABEL_MAX {
        return flat;
    }
    let head: String = flat.chars().take(LABEL_MAX).collect();
    format!("{head}…")
}

fn is_bidi_control(c: char) -> bool {
    matches!(c, '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn running_and_waiting_tasks_count_as_running() {
        let tasks = json!([
            {"state": "running"}, {"state": "waiting"}, {"state": "paused"},
            {"state": "queued"}, {"state": "succeeded"}
        ]);
        assert_eq!(tasks_label(&Ok(tasks)), "Running tasks: 2");
        assert_eq!(tasks_label(&Ok(json!({}))), "Running tasks: unavailable");
    }

    /// Guard: a missing CLI replaces the status rows, and Quit always ends the menu.
    #[test]
    fn a_missing_cli_replaces_the_status_rows() {
        let view = TrayView {
            cli_missing: true,
            ..TrayView::default()
        };
        assert_eq!(
            menu_labels(&view),
            vec![
                Some(CLI_NOT_FOUND.to_string()),
                None,
                Some(OPEN.to_string()),
                Some(CHECK_UPDATES.to_string()),
                None,
                Some(QUIT.to_string()),
            ]
        );
    }

    #[test]
    fn status_rows_read_the_cli_json() {
        let doctor = json!({"checks": [
            {"id": "memory.daemon", "status": "warn", "detail": "not\nrunning\u{202e}"}
        ]});
        assert_eq!(
            daemon_label(Some(&doctor), true),
            "Memory daemon: not running"
        );
        assert_eq!(daemon_label(None, true), "Memory daemon: …");
        assert_eq!(daemon_label(None, false), "Memory daemon: unavailable");
        let supervisor = json!({
            "supported": true,
            "launchd": {"loaded": true, "needsReinstall": false},
            "heartbeat": {"ageSeconds": 125},
            "paused": 1,
            "orphaned": 0
        });
        assert_eq!(
            supervisor_label(&Ok(supervisor)),
            "Supervisor: on · last tick 2 min ago · 1 paused"
        );
    }
}
