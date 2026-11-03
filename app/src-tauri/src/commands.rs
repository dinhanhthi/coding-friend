//! Tauri commands. Each one builds its `cf` argv in Rust from a fixed list: the frontend
//! never supplies argv, except `run_fix`, which must equal one of `RUNNABLE_FIXES`.
//!
//! The webview is not trusted: actions that change the user's setup (`update_yes`, `run_fix`,
//! `add_project`, `project_remove`, `config_set`, memory and learn `*_edit`/`*_delete`,
//! `choose_learn_dir`, `set_learn_dir`) ask in a native dialog shown from Rust and run one at a
//! time; file and folder paths come from native pickers shown from Rust, never from the page.
//! Two exceptions choose a path from page input: `set_learn_dir` accepts only a path equal to
//! one of the `suggestions` Rust itself fetched from `learn status`, and memory/learn edit and
//! delete name their file by a validated id (`data_arg`, after `--`), which the CLI re-checks
//! with realpath inside its root. Bodies go to `cf` on stdin, never in argv or the dialog.
//! `open_url` (an `https:` link from rendered markdown) also asks first, then opens the
//! system browser without running `cf`.

use std::collections::HashSet;
use std::io::{ErrorKind, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::{DialogExt, FilePath, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
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
/// Emitted once the user pressed OK in a native confirm, just before `cf` starts.
const RUN_STARTED: &str = "cf-run-started";
const PROJECT_DIR: &str = "--project-dir=";
/// Keys that decide where CF writes files: `learn.outputDir` changes only through the learn
/// folder picker, `docsDir` only through the CLI. A parent key (`learn`) is refused too,
/// since `config set` writes a whole object.
const PROTECTED_KEYS: [&str; 2] = ["learn.outputDir", "docsDir"];
const MAX_CONFIG_VALUE: usize = 4096;
/// Same limit as `MAX_URL` in app/src/lib/markdown-links.ts.
const MAX_URL: usize = 2048;
/// Longest docs relpath the page may ask for (bytes).
const MAX_DOC_PATH: usize = 1024;
/// Longest memory or learn id (`<category>/<slug>`) the page may ask for (bytes).
const MAX_NOTE_ID: usize = 256;
/// Same limit as the CLI's `memory search` / `learn search` query.
const MAX_QUERY: usize = 500;
/// Keep identical to `LEARN_SUBFOLDER` in cli/src/lib/cloud-folders.ts.
const LEARN_SUBFOLDER: &str = "coding-friend-learn";
const LEARN_DIR_KEY: &str = "learn.outputDir";
/// `doctor --project-dir` only reads files (no host probe), so it needs less than `DOCTOR_TIMEOUT`.
const PROJECT_DOCTOR_TIMEOUT: Duration = Duration::from_secs(30);

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

/// Canonical paths of the registered projects that exist, from the last `project_list`: the
/// only folders a project-scoped command may target.
#[derive(Default)]
pub struct KnownProjects(Mutex<HashSet<PathBuf>>);

impl KnownProjects {
    /// Replaces the set with the `exists: true` entries of `project list` data.
    fn replace(&self, data: &Value) {
        let paths = data["projects"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|project| project["exists"] == Value::Bool(true))
            .filter_map(|project| project["path"].as_str())
            .filter_map(|path| std::fs::canonicalize(path).ok())
            .collect();
        if let Ok(mut known) = self.0.lock() {
            *known = paths;
        }
    }

    fn insert(&self, path: &Path) {
        if let Ok(mut known) = self.0.lock() {
            known.insert(path.to_path_buf());
        }
    }

    fn remove(&self, path: &Path) {
        if let Ok(mut known) = self.0.lock() {
            known.remove(path);
        }
    }

    fn contains(&self, path: &Path) -> bool {
        self.0.lock().is_ok_and(|known| known.contains(path))
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

/// An id or relative path from the page (memory, docs, learn): never empty, an option, a `..`
/// segment, a backslash or a control char, and at most `max` bytes. The CLI checks again
/// that it resolves inside its root.
pub fn data_arg(s: &str, max: usize) -> Result<String, CfError> {
    if s.is_empty()
        || s.len() > max
        || s.starts_with('-')
        || s.contains('\\')
        || s.chars().any(char::is_control)
        || s.split('/').any(|segment| segment == "..")
    {
        return Err(refused(format!("not a valid id or path: {s:?}")));
    }
    Ok(s.to_string())
}

/// A config value or search query from the page: any text (empty, `-1` and `../x` included,
/// since it goes after `--`), without control chars and at most `max` bytes.
fn text_arg(s: &str, max: usize) -> Result<String, CfError> {
    if s.len() > max || s.chars().any(char::is_control) {
        return Err(refused(format!(
            "text must be at most {max} bytes, without control characters"
        )));
    }
    Ok(s.to_string())
}

/// A sha256 from a `show` answer: exactly 64 lowercase hex chars.
fn sha_arg(s: &str) -> Result<String, CfError> {
    let hex = s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
    if !hex {
        return Err(refused(format!("not a sha256: {s:?}")));
    }
    Ok(s.to_string())
}

/// `path` canonicalized, or (while the learn subfolder does not exist yet) its canonical
/// parent joined with `LEARN_SUBFOLDER`; `None` for a relative path or a missing parent.
fn learn_dir_key(path: &str) -> Option<PathBuf> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return None;
    }
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return Some(canonical);
    }
    if path.file_name()? != LEARN_SUBFOLDER {
        return None;
    }
    Some(
        std::fs::canonicalize(path.parent()?)
            .ok()?
            .join(LEARN_SUBFOLDER),
    )
}

/// The suggestion (as `learn status` gave it) that `path` names, compared after
/// `learn_dir_key`; only `LEARN_SUBFOLDER` folders count. Anything else is `Refused`.
fn learn_dir_from_suggestions(path: &str, suggestions: &[String]) -> Result<String, CfError> {
    let not_suggested = || refused(format!("not a suggested learn folder: {path:?}"));
    let wanted = learn_dir_key(path).ok_or_else(not_suggested)?;
    suggestions
        .iter()
        .filter(|suggestion| Path::new(suggestion).file_name() == Some(LEARN_SUBFOLDER.as_ref()))
        .find(|suggestion| learn_dir_key(suggestion).as_ref() == Some(&wanted))
        .cloned()
        .ok_or_else(not_suggested)
}

/// `--project-dir=<abs>` for a folder in `KnownProjects` (compared after canonicalizing).
fn project_dir_arg(known: &KnownProjects, path: &str) -> Result<String, CfError> {
    let dir = project_path(path, true)?;
    if !known.contains(&dir) {
        return Err(refused(format!("not a registered project: {path:?}")));
    }
    Ok(format!("{PROJECT_DIR}{}", utf8(dir)?))
}

/// A dotted config key (`^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*){0,5}$`) that is not a
/// protected key or a parent of one (compared segment by segment).
fn config_key(key: &str) -> Result<(), CfError> {
    let segments: Vec<&str> = key.split('.').collect();
    let well_formed = segments.len() <= 6
        && segments.iter().all(|segment| {
            let mut chars = segment.chars();
            chars.next().is_some_and(|c| c.is_ascii_alphabetic())
                && chars.all(|c| c.is_ascii_alphanumeric())
        });
    if !well_formed {
        return Err(refused(format!("not a valid config key: {key:?}")));
    }
    let protected = PROTECTED_KEYS.iter().any(|protected| {
        let protected: Vec<&str> = protected.split('.').collect();
        protected.starts_with(&segments)
    });
    if protected {
        return Err(refused(format!(
            "{key} decides where Coding Friend writes files; change it with the cf CLI"
        )));
    }
    Ok(())
}

/// An `https://` URL with a host, without control chars and at most `MAX_URL` bytes (before
/// and after normalizing); returned normalized, so the confirm shows exactly what opens.
fn external_url(url: &str) -> Result<String, CfError> {
    let invalid = || refused(format!("not an https link: {url:?}"));
    if url.len() > MAX_URL || url.chars().any(char::is_control) || !url.starts_with("https://") {
        return Err(invalid());
    }
    let parsed = tauri::Url::parse(url).map_err(|_| invalid())?;
    if parsed.scheme() != "https" || parsed.host_str().is_none_or(str::is_empty) {
        return Err(invalid());
    }
    let normalized = parsed.to_string();
    if normalized.len() > MAX_URL {
        return Err(invalid());
    }
    Ok(normalized)
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
async fn ask(app: &AppHandle, title: &str, message: String) -> Result<(), CfError> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .show(move |ok| {
            let _ = tx.send(ok);
        });
    // A dialog that never showed drops `tx`: treat it as Cancel.
    if rx.await != Ok(true) {
        return Err(CfError::Cancelled);
    }
    Ok(())
}

/// `ask` before a `cf` run, showing the size of `body` (never the body itself). On OK it
/// emits `RUN_STARTED` (`{ command, op }`), so the page shows the run only from then on.
async fn confirm(
    app: &AppHandle,
    op: &str,
    command_line: &str,
    body: Option<&str>,
) -> Result<(), CfError> {
    let size = body.map_or(String::new(), |body| {
        format!(
            "\n\nNew body: {} bytes, sent on stdin (not shown here).",
            body.len()
        )
    });
    ask(
        app,
        "Run this command?",
        format!("Coding Friend will run:\n\n{command_line}{size}"),
    )
    .await?;
    // A lost event only leaves the page saying "Waiting for confirmation": never block the run.
    let _ = app.emit(
        RUN_STARTED,
        serde_json::json!({ "command": command_line, "op": op }),
    );
    Ok(())
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

/// Confirms `command_line`, then runs `argv` (with `body` on stdin), one mutating command
/// at a time.
async fn confirm_and_run(
    app: &AppHandle,
    lock: &MutationLock,
    op: &str,
    command_line: &str,
    argv: &[String],
    body: Option<&str>,
    timeout: Duration,
) -> Result<Value, CfError> {
    let _guard = lock.0.lock().await;
    confirm(app, op, command_line, body).await?;
    match body {
        Some(body) => cf::run_cf_with_input(argv, body, timeout).await,
        None => cf::run_cf(argv, timeout).await,
    }
}

/// `cf <argv>` as the user reads it in the confirm dialog (without `--json`). Words after
/// `--` and the `--project-dir=` path are Debug-quoted, so a newline cannot fake dialog text.
fn command_line(argv: &[String]) -> String {
    let mut words = vec!["cf".to_string()];
    let mut after_dashes = false;
    for word in argv {
        if after_dashes {
            words.push(format!("{word:?}"));
        } else if let Some(dir) = word.strip_prefix(PROJECT_DIR) {
            words.push(format!("{PROJECT_DIR}{dir:?}"));
        } else if word != "--json" {
            after_dashes = word == "--";
            words.push(word.clone());
        }
    }
    words.join(" ")
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
pub async fn project_list(known: State<'_, KnownProjects>) -> Result<Value, CfError> {
    let data = run(&["project", "list", "--json"], cf::QUERY_TIMEOUT).await?;
    known.replace(&data);
    Ok(data)
}

/// The path a `project add|remove` answer reports (the main repo root), canonicalized when
/// it still exists.
fn reported_path(path: &Value) -> Option<PathBuf> {
    let path = PathBuf::from(path.as_str()?);
    Some(std::fs::canonicalize(&path).unwrap_or(path))
}

/// Opens a native folder picker; the picked folder (canonicalized) is added. No confirm:
/// the user chose it in the picker.
#[tauri::command]
pub async fn add_project(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    known: State<'_, KnownProjects>,
) -> Result<Value, CfError> {
    let _guard = lock.0.lock().await;
    let folder = picked(|done| {
        app.dialog()
            .file()
            .set_title("Add a project")
            .pick_folder(done)
    })
    .await?;
    let path = utf8(project_path(&utf8(folder)?, true)?)?;
    let data = run_project("add", &path).await?;
    if let Some(added) = reported_path(&data["project"]["path"]) {
        known.insert(&added);
    }
    Ok(data)
}

/// Removes a registry entry (never files), after a native confirm.
#[tauri::command]
pub async fn project_remove(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    known: State<'_, KnownProjects>,
    path: String,
) -> Result<Value, CfError> {
    let path = utf8(project_path(&path, false)?)?;
    let _guard = lock.0.lock().await;
    // Debug-quoted, so a newline in the path cannot fake dialog text.
    confirm(
        &app,
        "projectRemove",
        &format!("cf project remove -- {path:?}"),
        None,
    )
    .await?;
    let data = run_project("remove", &path).await?;
    if let Some(removed) = reported_path(&data["path"]) {
        known.remove(&removed);
    }
    Ok(data)
}

/// `config get --json`, for one known project or (without one) the global Settings.
#[tauri::command]
pub async fn config_view(
    known: State<'_, KnownProjects>,
    project: Option<String>,
) -> Result<Value, CfError> {
    let mut argv: Vec<String> = ["config", "get", "--json"].map(String::from).into();
    if let Some(project) = project {
        argv.push(project_dir_arg(&known, &project)?);
    }
    cf::run_cf(&argv, cf::QUERY_TIMEOUT).await
}

#[tauri::command]
pub async fn config_schema() -> Result<Value, CfError> {
    run(&["config", "schema", "--json"], cf::QUERY_TIMEOUT).await
}

/// `config set --global|--local [--project-dir=P] --json -- <key> <value>` after a native
/// confirm; `--local` needs a known project.
#[tauri::command]
pub async fn config_set(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    known: State<'_, KnownProjects>,
    scope: String,
    project: Option<String>,
    key: String,
    value: String,
) -> Result<Value, CfError> {
    if scope != "global" && scope != "local" {
        return Err(refused(format!("unknown config scope: {scope:?}")));
    }
    if scope == "local" && project.is_none() {
        return Err(refused("a local config change needs a project".to_string()));
    }
    config_key(&key)?;
    let value = text_arg(&value, MAX_CONFIG_VALUE)?;
    let project_dir = project
        .map(|project| project_dir_arg(&known, &project))
        .transpose()?;

    let mut argv: Vec<String> = vec!["config".into(), "set".into(), format!("--{scope}")];
    // Debug-quoted, so a newline cannot fake dialog text.
    let mut line = format!("cf config set --{scope}");
    if let Some(flag) = project_dir {
        line += &format!(" {PROJECT_DIR}{:?}", &flag[PROJECT_DIR.len()..]);
        argv.push(flag);
    }
    line += &format!(" -- {key:?} {value:?}");
    argv.extend(["--json".into(), "--".into(), key, value]);
    confirm_and_run(
        &app,
        &lock,
        "configSet",
        &line,
        &argv,
        None,
        cf::QUERY_TIMEOUT,
    )
    .await
}

/// `docs list --json --project-dir=P`: the markdown files of a known project's docs folder.
#[tauri::command]
pub async fn docs_list(known: State<'_, KnownProjects>, project: String) -> Result<Value, CfError> {
    let argv = vec![
        "docs".into(),
        "list".into(),
        "--json".into(),
        project_dir_arg(&known, &project)?,
    ];
    cf::run_cf(&argv, cf::QUERY_TIMEOUT).await
}

/// `docs show --json --project-dir=P -- <relpath>`; the CLI checks the file stays inside
/// the docs folder.
#[tauri::command]
pub async fn docs_show(
    known: State<'_, KnownProjects>,
    project: String,
    relpath: String,
) -> Result<Value, CfError> {
    let argv = vec![
        "docs".into(),
        "show".into(),
        "--json".into(),
        project_dir_arg(&known, &project)?,
        "--".into(),
        data_arg(&relpath, MAX_DOC_PATH)?,
    ];
    cf::run_cf(&argv, cf::QUERY_TIMEOUT).await
}

/// `doctor --json --project-dir=P`: the `project` checks of a known project. Read-only (hints
/// only, no fixes), so no confirm; it never touches `LastDoctor`.
#[tauri::command]
pub async fn project_doctor(
    known: State<'_, KnownProjects>,
    project: String,
) -> Result<Value, CfError> {
    let argv = vec![
        "doctor".into(),
        "--json".into(),
        project_dir_arg(&known, &project)?,
    ];
    cf::run_cf(&argv, PROJECT_DOCTOR_TIMEOUT).await
}

/// Opens an `https:` link in the system browser after a native confirm showing the full URL.
/// No `MutationLock` and no `RUN_STARTED`: it never runs `cf`.
#[tauri::command]
pub async fn open_url(app: AppHandle, url: String) -> Result<(), CfError> {
    let url = external_url(&url)?;
    ask(
        &app,
        "Open this link?",
        format!("Coding Friend will open this link in your browser:\n\n{url}"),
    )
    .await?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|err| CfError::Io {
            message: err.to_string(),
            stderr_tail: None,
        })
}

fn to_args(words: &[&str]) -> Vec<String> {
    words.iter().map(|word| word.to_string()).collect()
}

/// `memory list --json --project-dir=P`.
#[tauri::command]
pub async fn memory_list(
    known: State<'_, KnownProjects>,
    project: String,
) -> Result<Value, CfError> {
    let mut args = to_args(&["memory", "list", "--json"]);
    args.push(project_dir_arg(&known, &project)?);
    cf::run_cf(&args, cf::MEMORY_QUERY_TIMEOUT).await
}

/// `memory search --json --project-dir=P -- <query>`.
#[tauri::command]
pub async fn memory_search(
    known: State<'_, KnownProjects>,
    project: String,
    query: String,
) -> Result<Value, CfError> {
    let mut args = to_args(&["memory", "search", "--json"]);
    args.push(project_dir_arg(&known, &project)?);
    args.extend(["--".into(), text_arg(&query, MAX_QUERY)?]);
    cf::run_cf(&args, cf::MEMORY_QUERY_TIMEOUT).await
}

/// `memory show --json --project-dir=P -- <id>`.
#[tauri::command]
pub async fn memory_show(
    known: State<'_, KnownProjects>,
    project: String,
    id: String,
) -> Result<Value, CfError> {
    let mut args = to_args(&["memory", "show", "--json"]);
    args.push(project_dir_arg(&known, &project)?);
    args.extend(["--".into(), data_arg(&id, MAX_NOTE_ID)?]);
    cf::run_cf(&args, cf::QUERY_TIMEOUT).await
}

/// `memory edit --json --stdin --if-match <sha> --project-dir=P -- <id>` with `body` on
/// stdin, after a native confirm.
#[tauri::command]
pub async fn memory_edit(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    known: State<'_, KnownProjects>,
    project: String,
    id: String,
    sha: String,
    body: String,
) -> Result<Value, CfError> {
    let mut args = to_args(&["memory", "edit", "--json", "--stdin", "--if-match"]);
    args.push(sha_arg(&sha)?);
    args.push(project_dir_arg(&known, &project)?);
    args.extend(["--".into(), data_arg(&id, MAX_NOTE_ID)?]);
    let line = command_line(&args);
    confirm_and_run(
        &app,
        &lock,
        "memoryEdit",
        &line,
        &args,
        Some(&body),
        cf::MEMORY_WRITE_TIMEOUT,
    )
    .await
}

/// `memory delete --json --yes --if-match <sha> --project-dir=P -- <id>`, after a native
/// confirm.
#[tauri::command]
pub async fn memory_delete(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    known: State<'_, KnownProjects>,
    project: String,
    id: String,
    sha: String,
) -> Result<Value, CfError> {
    let mut args = to_args(&["memory", "delete", "--json", "--yes", "--if-match"]);
    args.push(sha_arg(&sha)?);
    args.push(project_dir_arg(&known, &project)?);
    args.extend(["--".into(), data_arg(&id, MAX_NOTE_ID)?]);
    let line = command_line(&args);
    confirm_and_run(
        &app,
        &lock,
        "memoryDelete",
        &line,
        &args,
        None,
        cf::MEMORY_WRITE_TIMEOUT,
    )
    .await
}

#[tauri::command]
pub async fn learn_status() -> Result<Value, CfError> {
    run(&["learn", "status", "--json"], cf::QUERY_TIMEOUT).await
}

#[tauri::command]
pub async fn learn_list() -> Result<Value, CfError> {
    run(&["learn", "list", "--json"], cf::LEARN_QUERY_TIMEOUT).await
}

/// `learn search --json -- <query>`.
#[tauri::command]
pub async fn learn_search(query: String) -> Result<Value, CfError> {
    let query = text_arg(&query, MAX_QUERY)?;
    run(
        &["learn", "search", "--json", "--", &query],
        cf::LEARN_QUERY_TIMEOUT,
    )
    .await
}

/// `learn show --json -- <id>`.
#[tauri::command]
pub async fn learn_show(id: String) -> Result<Value, CfError> {
    let id = data_arg(&id, MAX_NOTE_ID)?;
    run(&["learn", "show", "--json", "--", &id], cf::QUERY_TIMEOUT).await
}

/// `learn edit --json --stdin --if-match <sha> -- <id>` with `body` on stdin, after a native
/// confirm.
#[tauri::command]
pub async fn learn_edit(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    id: String,
    sha: String,
    body: String,
) -> Result<Value, CfError> {
    let args = to_args(&[
        "learn",
        "edit",
        "--json",
        "--stdin",
        "--if-match",
        &sha_arg(&sha)?,
        "--",
        &data_arg(&id, MAX_NOTE_ID)?,
    ]);
    let line = command_line(&args);
    confirm_and_run(
        &app,
        &lock,
        "learnEdit",
        &line,
        &args,
        Some(&body),
        cf::LEARN_WRITE_TIMEOUT,
    )
    .await
}

/// `learn delete --json --yes --if-match <sha> -- <id>`, after a native confirm.
#[tauri::command]
pub async fn learn_delete(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    id: String,
    sha: String,
) -> Result<Value, CfError> {
    let args = to_args(&[
        "learn",
        "delete",
        "--json",
        "--yes",
        "--if-match",
        &sha_arg(&sha)?,
        "--",
        &data_arg(&id, MAX_NOTE_ID)?,
    ]);
    let line = command_line(&args);
    confirm_and_run(
        &app,
        &lock,
        "learnDelete",
        &line,
        &args,
        None,
        cf::LEARN_WRITE_TIMEOUT,
    )
    .await
}

/// Confirms and runs `config set --global --json -- learn.outputDir <dir>`. The caller holds
/// the `MutationLock` and chose `dir` from a picker or a Rust-fetched suggestion.
async fn save_learn_dir(app: &AppHandle, dir: String) -> Result<Value, CfError> {
    let args = to_args(&[
        "config",
        "set",
        "--global",
        "--json",
        "--",
        LEARN_DIR_KEY,
        &dir,
    ]);
    confirm(app, "learnDir", &command_line(&args), None).await?;
    cf::run_cf(&args, cf::QUERY_TIMEOUT).await
}

/// Opens a native folder picker; the picked folder (canonicalized) becomes the learn folder
/// after a native confirm.
#[tauri::command]
pub async fn choose_learn_dir(
    app: AppHandle,
    lock: State<'_, MutationLock>,
) -> Result<Value, CfError> {
    let _guard = lock.0.lock().await;
    let folder = picked(|done| {
        app.dialog()
            .file()
            .set_title("Choose the learn folder")
            .pick_folder(done)
    })
    .await?;
    let dir = utf8(project_path(&utf8(folder)?, true)?)?;
    save_learn_dir(&app, dir).await
}

/// Makes one of `learn status`'s suggested cloud folders the learn folder, after a native
/// confirm. Rust fetches the suggestions itself; any other path is `Refused`.
#[tauri::command]
pub async fn set_learn_dir(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    path: String,
) -> Result<Value, CfError> {
    let _guard = lock.0.lock().await;
    let status = run(&["learn", "status", "--json"], cf::QUERY_TIMEOUT).await?;
    let suggestions: Vec<String> = status["suggestions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|suggestion| suggestion["path"].as_str())
        .map(str::to_string)
        .collect();
    let dir = learn_dir_from_suggestions(&path, &suggestions)?;
    save_learn_dir(&app, dir).await
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
        "update",
        &command_line(&argv),
        &argv,
        None,
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
    confirm_and_run(
        &app,
        &lock,
        "fix",
        &command_line(&argv),
        &argv,
        None,
        cf::FIX_TIMEOUT,
    )
    .await
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
    fn data_arg_refuses_options_traversal_control_chars_and_long_input() {
        for arg in ["notes/a-b.md", "Algo_Structure/foo (1)"] {
            assert_eq!(data_arg(arg, 30), Ok(arg.to_string()));
        }
        for arg in ["", "-x", "a\0b", "a\nb", "../x", "a/../b", "a\\b", "abcdef"] {
            assert!(
                matches!(data_arg(arg, 5), Err(CfError::Refused { .. })),
                "{arg:?}"
            );
        }
    }

    #[test]
    fn text_arg_keeps_values_and_refuses_control_chars_and_long_input() {
        for arg in ["../shared-docs", "-1", ""] {
            assert_eq!(text_arg(arg, 20), Ok(arg.to_string()));
        }
        for arg in ["a\0b", "a\nb", &"x".repeat(21)] {
            assert!(
                matches!(text_arg(arg, 20), Err(CfError::Refused { .. })),
                "{arg:?}"
            );
        }
    }

    #[test]
    fn sha_arg_needs_64_lowercase_hex_chars() {
        let sha = "0123456789abcdef".repeat(4);
        assert_eq!(sha_arg(&sha), Ok(sha.clone()));
        for arg in [
            String::new(),
            sha[1..].to_string(),
            format!("{sha}0"),
            sha.to_uppercase(),
            format!("g{}", &sha[1..]),
            format!("-{}", &sha[1..]),
        ] {
            assert!(
                matches!(sha_arg(&arg), Err(CfError::Refused { .. })),
                "{arg:?}"
            );
        }
    }

    #[test]
    fn learn_dir_must_be_one_of_the_suggestions() {
        let root = std::env::temp_dir().join(format!("cf-learn-dir-{}", std::process::id()));
        let existing = root.join("icloud").join(LEARN_SUBFOLDER);
        let missing_parent = root.join("drive");
        std::fs::create_dir_all(&existing).unwrap();
        std::fs::create_dir_all(&missing_parent).unwrap();
        let shown = |path: &Path| path.to_str().unwrap().to_string();
        let missing = shown(&missing_parent.join(LEARN_SUBFOLDER));
        let suggestions = [shown(&existing), missing.clone()];

        // The suggestion string itself is kept, also when given through a `..` detour.
        let detour = shown(&root.join("drive/../icloud").join(LEARN_SUBFOLDER));
        assert_eq!(
            learn_dir_from_suggestions(&detour, &suggestions),
            Ok(shown(&existing))
        );
        assert_eq!(
            learn_dir_from_suggestions(&missing, &suggestions),
            Ok(missing.clone())
        );
        for path in [
            shown(&missing_parent),
            shown(&root.join("other").join(LEARN_SUBFOLDER)),
            "relative/coding-friend-learn".to_string(),
        ] {
            assert!(
                matches!(
                    learn_dir_from_suggestions(&path, &suggestions),
                    Err(CfError::Refused { .. })
                ),
                "{path}"
            );
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn external_url_accepts_only_short_https_urls_without_control_chars() {
        assert_eq!(
            external_url("https://example.com/a?b=1#c"),
            Ok("https://example.com/a?b=1#c".to_string())
        );
        for url in [
            "http://example.com",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "https://",
            "https://example.com/\na",
            "https://example.com/\u{7}",
            &format!("https://example.com/{}", "a".repeat(2048)),
        ] {
            assert!(
                matches!(external_url(url), Err(CfError::Refused { .. })),
                "{url:?}"
            );
        }
    }

    #[test]
    fn project_dir_arg_needs_a_known_project() {
        let known = KnownProjects::default();
        let dir = std::env::temp_dir();
        let path = dir.to_str().unwrap();
        assert!(matches!(
            project_dir_arg(&known, path),
            Err(CfError::Refused { .. })
        ));
        let canonical = std::fs::canonicalize(&dir).unwrap();
        known.insert(&canonical);
        assert_eq!(
            project_dir_arg(&known, path),
            Ok(format!("--project-dir={}", canonical.display()))
        );
    }

    #[test]
    fn config_key_follows_the_pattern_and_never_moves_written_files() {
        for key in ["tdd", "learn.autoCommit", "a1.b2.c3.d4.e5.f6", "learnX"] {
            assert_eq!(config_key(key), Ok(()), "{key}");
        }
        for key in [
            "",
            "1a",
            "a..b",
            "a.",
            "a-b",
            "a.b.c.d.e.f.g",
            "--global",
            "learn",
            "learn.outputDir",
            "docsDir",
        ] {
            assert!(
                matches!(config_key(key), Err(CfError::Refused { .. })),
                "{key}"
            );
        }
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
