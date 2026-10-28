//! Self-update: a silent check a minute after launch and every six hours after, the tray's
//! "Check for Updates…", and the install that follows (ask → download → install → restart).
//!
//! Every check runs through one seam, `check(app, interactive)`. Only the menu item may show a
//! dialog for "up to date" or a failure; a background check logs and stops. The endpoint fails
//! for anyone offline, and returns 404 while `app-latest` has no `latest.json` yet (or while
//! it is being re-uploaded), so a background check that surfaced that would nag every few hours.
//!
//! This is the only file that reaches `tauri-plugin-updater`, and only from Rust: no
//! capability grants the page any `updater:` command, so `capabilities/default.json` is untouched.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use tauri::{App, AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

const TITLE: &str = "Software Update";
const CHECK_FAILED: &str = "Could not check for updates. Check your connection and try again.";
const INSTALL_FAILED: &str =
    "Could not install the update. Coding Friend is unchanged; try again from Check for Updates…";

/// The first background check waits for the launch to settle.
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(60);
/// The app lives in the menu bar for days; a launch-only check would leave it behind.
const INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
/// Bounds the `latest.json` request, so a half-open connection cannot stall the loop.
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);

/// The version the last check found, and whether a prompt or an install is under way.
#[derive(Default)]
struct UpdateState {
    found: Mutex<Option<String>>,
    prompting: AtomicBool,
    installing: AtomicBool,
}

/// Start the background checks.
pub fn install(app: &App) {
    app.manage(UpdateState::default());
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK_DELAY).await;
        loop {
            check(&handle, false).await;
            tokio::time::sleep(INTERVAL).await;
        }
    });
}

/// "Check for Updates…": an interactive check.
pub fn check_now(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { check(&app, true).await });
}

async fn check(app: &AppHandle, interactive: bool) {
    let state = app.state::<UpdateState>();
    if state.installing.load(Ordering::SeqCst) {
        if interactive {
            info(app, "An update is already being installed.");
        }
        return;
    }
    let updater = match app.updater_builder().timeout(CHECK_TIMEOUT).build() {
        Ok(updater) => updater,
        Err(err) => return failed(app, interactive, CHECK_FAILED, err),
    };
    match updater.check().await {
        Ok(Some(update)) => {
            let fresh = record(&state, Some(update.version.clone()));
            if interactive || fresh {
                prompt(app, update);
            }
        }
        Ok(None) => {
            record(&state, None);
            if interactive {
                let version = &app.package_info().version;
                info(
                    app,
                    &format!("You're up to date. Coding Friend {version} is the latest version."),
                );
            }
        }
        Err(err) => failed(app, interactive, CHECK_FAILED, err),
    }
}

/// Keep what a check found. True when it is a version the user has not been asked about yet,
/// so "Later" is not asked again every six hours.
fn record(state: &UpdateState, found: Option<String>) -> bool {
    let mut last = state.found.lock().unwrap_or_else(PoisonError::into_inner);
    let previous = std::mem::replace(&mut *last, found.clone());
    is_fresh(previous.as_deref(), found.as_deref())
}

fn is_fresh(previous: Option<&str>, found: Option<&str>) -> bool {
    found.is_some() && found != previous
}

/// A background check logs and stops here; only an interactive one shows a short dialog.
fn failed(app: &AppHandle, interactive: bool, message: &str, err: tauri_plugin_updater::Error) {
    eprintln!("coding-friend: updater: {err}");
    if interactive {
        app.dialog()
            .message(message)
            .title(TITLE)
            .kind(MessageDialogKind::Warning)
            .show(|_| {});
    }
}

fn info(app: &AppHandle, message: &str) {
    app.dialog()
        .message(message)
        .title(TITLE)
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

/// One prompt at a time: a manual check while the background prompt is open adds no second one.
fn prompt(app: &AppHandle, update: Update) {
    if app
        .state::<UpdateState>()
        .prompting
        .swap(true, Ordering::SeqCst)
    {
        return;
    }
    let message = format!(
        "Version {} is available. Install and restart?",
        update.version
    );
    let handle = app.clone();
    app.dialog()
        .message(message)
        .title(TITLE)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install and Restart".to_string(),
            "Later".to_string(),
        ))
        .show(move |install| {
            handle
                .state::<UpdateState>()
                .prompting
                .store(false, Ordering::SeqCst);
            if install {
                download(handle, update);
            }
        });
}

/// Download, verify (the plugin checks the minisign signature), install, then restart.
fn download(app: AppHandle, update: Update) {
    if app
        .state::<UpdateState>()
        .installing
        .swap(true, Ordering::SeqCst)
    {
        return;
    }
    tauri::async_runtime::spawn(async move {
        match update.download_and_install(|_, _| {}, || {}).await {
            // `restart` does not return; the new bundle is already in place.
            Ok(()) => app.restart(),
            Err(err) => {
                app.state::<UpdateState>()
                    .installing
                    .store(false, Ordering::SeqCst);
                failed(&app, true, INSTALL_FAILED, err);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::is_fresh;

    /// Guard: "Later" is not asked again for the same version every six hours.
    #[test]
    fn only_a_version_not_already_recorded_is_fresh() {
        assert!(is_fresh(None, Some("0.2.0")));
        assert!(!is_fresh(Some("0.2.0"), Some("0.2.0")));
        assert!(is_fresh(Some("0.2.0"), Some("0.3.0")));
        assert!(!is_fresh(Some("0.2.0"), None));
    }
}
