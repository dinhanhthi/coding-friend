//! Tauri commands. Each one builds its `cf` argv in Rust from a fixed list: the frontend
//! never supplies argv, except `run_fix`, which must equal one of `RUNNABLE_FIXES`.
//!
//! The webview is not trusted: actions that change the user's setup (`update_yes`, `run_fix`,
//! `add_project`, `project_remove`) ask in a native dialog shown from Rust and run one at a
//! time; file and folder paths come from native pickers shown from Rust, never from the page.

use std::io::{ErrorKind, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath, MessageDialogButtons, MessageDialogKind};
use tokio::sync::oneshot;

use crate::cf::{self, CfError, CfSource, CliStatus, ResolvedCf};
use crate::path_env::login_path;

/// Keep identical to `RUNNABLE_FIXES` in cli/src/lib/doctor.ts.
const RUNNABLE_FIXES: [&[&str]; 3] = [
    &["supervisor", "install", "--json"],
    &["supervisor", "tick", "--json"],
    &["install", "--user", "--yes", "--json"],
];
const CF_BIN_KEY: &str = "cfBinPath";

/// The last `doctor --json` data (from `check_cli` or `cf_doctor`), reused by the UI and tray.
#[derive(Default)]
pub struct LastDoctor(Mutex<Option<Value>>);

impl LastDoctor {
    pub fn get(&self) -> Option<Value> {
        self.0.lock().ok().and_then(|data| data.clone())
    }

    fn set(&self, value: Option<Value>) {
        if let Ok(mut data) = self.0.lock() {
            *data = value;
        }
    }
}

/// Held from the confirm dialog to the end of the run: mutating commands never overlap.
#[derive(Default)]
pub struct MutationLock(tokio::sync::Mutex<()>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CfInfo {
    /// `None` when no `cf` was found; `error` then says why.
    cf: Option<ResolvedCf>,
    error: Option<CfError>,
    login_path: String,
    /// "login-shell" or "fallback".
    login_path_source: &'static str,
}

fn refused(message: String) -> CfError {
    CfError::Refused { message }
}

fn io(err: std::io::Error) -> CfError {
    CfError::Io {
        message: err.to_string(),
        stderr_tail: None,
    }
}

async fn run(words: &[&str], timeout: Duration) -> Result<Value, CfError> {
    let args: Vec<String> = words.iter().map(|word| word.to_string()).collect();
    cf::run_cf(&args, timeout).await
}

/// The argv itself when it equals one of `RUNNABLE_FIXES` word for word.
fn fix_argv(argv: Vec<String>) -> Result<Vec<String>, CfError> {
    let words = || argv.iter().map(String::as_str);
    if RUNNABLE_FIXES
        .iter()
        .any(|fix| fix.iter().copied().eq(words()))
    {
        Ok(argv)
    } else {
        Err(refused("not a runnable doctor fix".to_string()))
    }
}

/// An absolute path, canonicalized; one that no longer exists is kept as given unless `must_exist`.
fn project_path(path: &str, must_exist: bool) -> Result<PathBuf, CfError> {
    if path.starts_with('-') || !Path::new(path).is_absolute() {
        return Err(refused(format!("project path must be absolute: {path}")));
    }
    match std::fs::canonicalize(path) {
        Ok(canonical) => Ok(canonical),
        Err(_) if !must_exist => Ok(PathBuf::from(path)),
        Err(err) => Err(refused(format!("{path}: {err}"))),
    }
}

fn utf8(path: PathBuf) -> Result<String, CfError> {
    path.into_os_string()
        .into_string()
        .map_err(|_| refused("path is not valid UTF-8".to_string()))
}

/// `project <command> --json -- <path>`: after `--` the path is never read as an option.
async fn run_project(command: &str, path: &str) -> Result<Value, CfError> {
    run(
        &["project", command, "--json", "--", path],
        cf::QUERY_TIMEOUT,
    )
    .await
}

/// Native OK/Cancel warning shown from Rust; `Cancelled` unless the user presses OK.
async fn confirm(app: &AppHandle, command_line: &str) -> Result<(), CfError> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .message(format!("Coding Friend will run:\n\n{command_line}"))
        .title("Run this command?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .show(move |ok| {
            let _ = tx.send(ok);
        });
    // A dialog that never showed drops `tx`: treat it as Cancel.
    match rx.await {
        Ok(true) => Ok(()),
        _ => Err(CfError::Cancelled),
    }
}

/// Waits for a native picker's callback; `Cancelled` when the user closed it.
async fn picked(
    show: impl FnOnce(Box<dyn FnOnce(Option<FilePath>) + Send>),
) -> Result<PathBuf, CfError> {
    let (tx, rx) = oneshot::channel();
    show(Box::new(move |path| {
        let _ = tx.send(path);
    }));
    let path = rx.await.ok().flatten().ok_or(CfError::Cancelled)?;
    path.into_path()
        .map_err(|err| refused(format!("not a local path: {err}")))
}

/// Confirms `command_line`, then runs `argv`, one mutating command at a time.
async fn confirm_and_run(
    app: &AppHandle,
    lock: &MutationLock,
    command_line: &str,
    argv: &[String],
    timeout: Duration,
) -> Result<Value, CfError> {
    let _guard = lock.0.lock().await;
    confirm(app, command_line).await?;
    cf::run_cf(argv, timeout).await
}

/// `cf <argv>` as the user reads it in the confirm dialog (without `--json`).
fn command_line(argv: &[String]) -> String {
    let words: Vec<&str> = argv
        .iter()
        .map(String::as_str)
        .filter(|word| *word != "--json")
        .collect();
    format!("cf {}", words.join(" "))
}

/// Settings as a JSON object: `{}` when the file is missing, an error when it cannot be
/// read or parsed (never silently replaced).
fn read_settings(path: &Path) -> Result<Map<String, Value>, CfError> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(Map::new()),
        Err(err) => return Err(io(err)),
    };
    serde_json::from_str(&text).map_err(|err| {
        refused(format!(
            "{} is not a JSON object ({err}); fix or delete it",
            path.display()
        ))
    })
}

/// Sets (or with `None` removes) `cfBinPath` in settings.json, keeping its other keys.
fn save_cf_bin(bin: Option<&str>) -> Result<(), CfError> {
    let path =
        cf::settings_path().ok_or_else(|| refused("the app config dir is unknown".to_string()))?;
    let mut settings = read_settings(&path)?;
    match bin {
        Some(bin) => settings.insert(CF_BIN_KEY.to_string(), Value::from(bin)),
        None => settings.remove(CF_BIN_KEY),
    };
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(io)?;
    }
    let text = serde_json::to_string_pretty(&settings).map_err(|err| io(err.into()))? + "\n";
    // Write a fresh private temp file, then rename it over settings.json: a crash never
    // leaves half a file, and an existing file at the temp path is never written through.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |time| time.as_nanos());
    let tmp = path.with_extension(format!("json.{}.{nanos}.tmp", std::process::id()));
    let written = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&tmp)
        .and_then(|mut file| {
            file.write_all(text.as_bytes())?;
            file.sync_all()
        });
    if let Err(err) = written.and_then(|()| std::fs::rename(&tmp, &path)) {
        let _ = std::fs::remove_file(&tmp);
        return Err(io(err));
    }
    Ok(())
}

#[tauri::command]
pub async fn cf_version() -> Result<Value, CfError> {
    run(&["version", "--json"], cf::VERSION_TIMEOUT).await
}

#[tauri::command]
pub async fn cf_doctor(last: State<'_, LastDoctor>) -> Result<Value, CfError> {
    let data = run(&["doctor", "--json"], cf::DOCTOR_TIMEOUT).await?;
    last.set(Some(data.clone()));
    Ok(data)
}

#[tauri::command]
pub async fn last_doctor(last: State<'_, LastDoctor>) -> Result<Option<Value>, CfError> {
    Ok(last.get())
}

#[tauri::command]
pub async fn project_list() -> Result<Value, CfError> {
    run(&["project", "list", "--json"], cf::QUERY_TIMEOUT).await
}

/// Opens a native folder picker; the picked folder (canonicalized) is added. No confirm:
/// the user chose it in the picker.
#[tauri::command]
pub async fn add_project(app: AppHandle, lock: State<'_, MutationLock>) -> Result<Value, CfError> {
    let _guard = lock.0.lock().await;
    let folder = picked(|done| {
        app.dialog()
            .file()
            .set_title("Add a project")
            .pick_folder(done)
    })
    .await?;
    let path = utf8(project_path(&utf8(folder)?, true)?)?;
    run_project("add", &path).await
}

/// Removes a registry entry (never files), after a native confirm.
#[tauri::command]
pub async fn project_remove(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    path: String,
) -> Result<Value, CfError> {
    let path = utf8(project_path(&path, false)?)?;
    let _guard = lock.0.lock().await;
    // Debug-quoted, so a newline in the path cannot fake dialog text.
    confirm(&app, &format!("cf project remove -- {path:?}")).await?;
    run_project("remove", &path).await
}

#[tauri::command]
pub async fn task_list() -> Result<Value, CfError> {
    run(&["task", "list", "--json"], cf::QUERY_TIMEOUT).await
}

#[tauri::command]
pub async fn chef_status() -> Result<Value, CfError> {
    run(&["chef", "status", "--json"], cf::QUERY_TIMEOUT).await
}

#[tauri::command]
pub async fn supervisor_status() -> Result<Value, CfError> {
    run(&["supervisor", "status", "--json"], cf::QUERY_TIMEOUT).await
}

#[tauri::command]
pub async fn update_check() -> Result<Value, CfError> {
    run(&["update", "--check", "--json"], cf::UPDATE_CHECK_TIMEOUT).await
}

#[tauri::command]
pub async fn update_yes(app: AppHandle, lock: State<'_, MutationLock>) -> Result<Value, CfError> {
    let argv: Vec<String> = ["update", "--yes", "--json"].map(String::from).into();
    confirm_and_run(
        &app,
        &lock,
        &command_line(&argv),
        &argv,
        cf::UPDATE_YES_TIMEOUT,
    )
    .await
}

#[tauri::command]
pub async fn run_fix(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    argv: Vec<String>,
) -> Result<Value, CfError> {
    let argv = fix_argv(argv)?;
    confirm_and_run(&app, &lock, &command_line(&argv), &argv, cf::FIX_TIMEOUT).await
}

#[tauri::command]
pub async fn check_cli(last: State<'_, LastDoctor>) -> Result<CliStatus, CfError> {
    let status = cf::check_cli().await;
    last.set(status.doctor.clone());
    Ok(status)
}

#[tauri::command]
pub async fn get_cf_info() -> Result<CfInfo, CfError> {
    let (cf, error) = match cf::resolve_cf().await {
        Ok(cf) => (Some(cf), None),
        Err(err) => (None, Some(err)),
    };
    let login = login_path().await;
    Ok(CfInfo {
        cf,
        error,
        login_path: login.path.clone(),
        login_path_source: login.source.as_str(),
    })
}

/// Opens a native folder picker and takes the `cf` in the picked folder (a folder, not the
/// file: the macOS file picker resolves npm's `cf` symlink to its `index.js` target). Saves
/// it as `cfBinPath` only when it passes `check_cf_bin` (named `cf`, executable, yours, not
/// group/world-writable) and its `version --json` speaks contract 1.
#[tauri::command]
pub async fn choose_cf_path(
    app: AppHandle,
    lock: State<'_, MutationLock>,
) -> Result<ResolvedCf, CfError> {
    let _guard = lock.0.lock().await;
    let dir = picked(|done| {
        app.dialog()
            .file()
            .set_title("Choose the folder that contains the cf command")
            .pick_folder(done)
    })
    .await?;
    let bin = dir.join("cf");
    cf::check_cf_bin(&bin, true).map_err(|reason| {
        refused(format!(
            "{} has no usable cf command: {reason}",
            dir.display()
        ))
    })?;
    cf::probe_version(&bin).await?;
    save_cf_bin(Some(&utf8(bin.clone())?))?;
    Ok(ResolvedCf {
        path: bin,
        source: CfSource::Settings,
    })
}

/// Removes `cfBinPath`, so `cf` is looked up on the login-shell PATH again.
#[tauri::command]
pub async fn clear_cf_path(lock: State<'_, MutationLock>) -> Result<(), CfError> {
    let _guard = lock.0.lock().await;
    save_cf_bin(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn words(words: &[&str]) -> Vec<String> {
        words.iter().map(|word| word.to_string()).collect()
    }

    #[test]
    fn run_fix_accepts_only_an_exact_allow_listed_argv() {
        for fix in [
            ["supervisor", "install", "--json"].as_slice(),
            &["supervisor", "tick", "--json"],
            &["install", "--user", "--yes", "--json"],
        ] {
            assert_eq!(fix_argv(words(fix)), Ok(words(fix)));
        }
        for argv in [
            ["install", "supervisor", "--json"].as_slice(),
            &["supervisor", "install", "--json", "--force"],
            &["update", "--yes", "--json"],
        ] {
            assert!(
                matches!(fix_argv(words(argv)), Err(CfError::Refused { .. })),
                "{argv:?}"
            );
        }
    }

    #[test]
    fn project_path_must_be_absolute_and_never_an_option() {
        for path in ["-weird", "--json", "relative/dir"] {
            for must_exist in [true, false] {
                assert!(
                    matches!(project_path(path, must_exist), Err(CfError::Refused { .. })),
                    "{path}"
                );
            }
        }
        let dir = std::env::temp_dir();
        let canonical = std::fs::canonicalize(&dir).unwrap();
        assert_eq!(project_path(dir.to_str().unwrap(), true), Ok(canonical));
    }

    #[test]
    fn cf_bin_must_be_an_owned_private_executable_named_cf() {
        let root = std::env::temp_dir().join(format!("cf-bin-check-{}", std::process::id()));
        let bin = |sub: &str, name: &str, mode: u32| {
            let dir = root.join(sub);
            std::fs::create_dir_all(&dir).unwrap();
            let bin = dir.join(name);
            std::fs::write(&bin, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(mode)).unwrap();
            bin
        };

        assert_eq!(cf::check_cf_bin(&bin("ok", "cf", 0o755), true), Ok(()));
        for (path, owned) in [
            (bin("rm", "rm", 0o755), false),
            (bin("group", "cf", 0o775), true),
            (bin("world", "cf", 0o757), true),
            (bin("plain", "cf", 0o644), true),
        ] {
            assert!(cf::check_cf_bin(&path, owned).is_err(), "{path:?}");
        }

        // npm's install: bin/cf is a symlink to the CLI's index.js.
        let index_js = bin("npm-lib", "index.js", 0o755);
        let npm_bin = root.join("npm-bin");
        std::fs::create_dir_all(&npm_bin).unwrap();
        std::os::unix::fs::symlink(&index_js, npm_bin.join("cf")).unwrap();
        assert_eq!(cf::check_cf_bin(&npm_bin.join("cf"), true), Ok(()));
        std::fs::remove_dir_all(root).unwrap();
    }
}
