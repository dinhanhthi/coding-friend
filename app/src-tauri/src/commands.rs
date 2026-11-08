//! Tauri commands. Each one builds its `cf` argv in Rust from a fixed list: the frontend
//! never supplies argv, except `run_fix`, which must equal one of `RUNNABLE_FIXES`.
//!
//! The webview is not trusted: actions that change the user's setup (`update_yes`, `run_fix`,
//! `add_project`, `project_remove`, `config_set`, memory and learn `*_edit`/`*_delete`,
//! `choose_learn_dir`, `set_learn_dir`, `session_export`, `session_save`, `session_load`,
//! `choose_session_dir`, `set_session_dir`, `task_reply`, `task_cancel`) ask in a native dialog shown from Rust and run one
//! at a time; file and folder paths come from native pickers or save dialogs shown from Rust,
//! never from the page. Exceptions choose a path from page input: `set_learn_dir` and
//! `set_session_dir` accept only a path equal to one of the `suggestions` Rust itself fetched
//! from `learn status` / `session status`, `session_load` only targets known projects, and
//! memory/learn edit and delete name their file by a validated id (`data_arg`, after `--`),
//! which the CLI re-checks with realpath inside its root; `docs_show` takes a relpath
//! (`doc_path_arg`, after `--`) the CLI re-checks the same way. Bodies go to `cf` on stdin,
//! never in argv or the dialog.
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
/// Flags whose path value `command_line` Debug-quotes.
const QUOTED_PATH_FLAGS: [&str; 3] = [PROJECT_DIR, "--out=", "--target="];
/// Keys that decide where CF writes files or sends data: `learn.outputDir` changes only through
/// the learn folder picker, `docsDir`, `session.dir`, `decision.allowRemote` and
/// `decision.baseUrl` only through the CLI. A parent key (`learn`, `session`, `decision`) is
/// refused too, since `config set` writes a whole object.
const PROTECTED_KEYS: [&str; 5] = [
    "learn.outputDir",
    "docsDir",
    "session.dir",
    "decision.allowRemote",
    "decision.baseUrl",
];
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
/// Keep identical to `SESSION_SUBFOLDER` in cli/src/lib/cloud-folders.ts.
const SESSION_SUBFOLDER: &str = "coding-friend-sessions";
const SESSION_DIR_KEY: &str = "session.dir";
/// `doctor --project-dir` only reads files (no host probe), so it needs less than `DOCTOR_TIMEOUT`.
const PROJECT_DOCTOR_TIMEOUT: Duration = Duration::from_secs(30);
/// Longest session ref (`<prefix>:<id>`) the page may ask for (bytes).
const MAX_SESSION_REF: usize = 256;
/// Keep identical to `REF_RE` in cli/src/lib/transcript.ts.
const SESSION_REF_PREFIXES: [&str; 4] = ["claude", "codex", "saved", "legacy"];
const MAX_SESSION_REF_ID: usize = 200;
/// `session list|show|export` (preview) and `sync status` read transcripts or walk folders.
const SESSION_READ_TIMEOUT: Duration = Duration::from_secs(30);
/// `session export --out`, `session save` and `session load` copy whole transcripts.
const SESSION_WRITE_TIMEOUT: Duration = Duration::from_secs(60);
/// Longest `session save` label the page may send (bytes).
const MAX_SESSION_LABEL: usize = 200;
/// Longest `task follow --cursor` the page may send (bytes).
const MAX_FOLLOW_CURSOR: usize = 160;
/// Longest `reply` answer the page may send (bytes).
const MAX_ANSWER: usize = 4096;
/// Most chars of a worker question or reply answer a confirm dialog shows.
const MAX_SHOWN_CHARS: usize = 300;

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

/// Held while an `open_url` confirm is up: a second link is refused, not stacked.
#[derive(Default)]
pub struct OpenUrlLock(tokio::sync::Mutex<()>);

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

/// An id from the page (memory, learn, session ref): never empty, an option, absolute (a
/// leading `/`), a `..` segment, a backslash or a control char, and at most `max` bytes. The
/// CLI checks again that it resolves inside its root.
pub fn data_arg(s: &str, max: usize) -> Result<String, CfError> {
    if s.is_empty()
        || s.len() > max
        || s.starts_with('-')
        || s.starts_with('/')
        || s.contains('\\')
        || s.chars().any(char::is_control)
        || s.split('/').any(|segment| segment == "..")
    {
        return Err(refused(format!("not a valid id or path: {s:?}")));
    }
    Ok(s.to_string())
}

/// A config value or search query from the page: any text (empty, `-1` and `../x` included,
/// since it goes after `--`), without control or format chars and at most `max` bytes.
fn text_arg(s: &str, max: usize) -> Result<String, CfError> {
    if s.len() > max || s.chars().any(|c| c.is_control() || is_format(c)) {
        return Err(refused(format!(
            "text must be at most {max} bytes, without control or format characters"
        )));
    }
    Ok(s.to_string())
}

/// The invisible Unicode format (Cf) chars that can hide or reorder text in a dialog: soft
/// hyphen U+00AD, Arabic letter mark U+061C, Mongolian vowel separator U+180E, zero-width
/// space U+200B, direction marks U+200E-200F, bidi embeddings and overrides U+202A-202E, word joiner
/// and invisible operators U+2060-2064, bidi isolates and deprecated format chars
/// U+2066-206F, BOM U+FEFF, interlinear annotations U+FFF9-FFFB and tags U+E0001-E007F.
/// Not every Cf char (e.g. the Arabic number signs U+0600-0605 are left out), and the
/// joiners U+200C/U+200D stay allowed: emoji sequences and Persian/Indic text need them.
fn is_format(c: char) -> bool {
    matches!(
        c,
        '\u{00AD}'
            | '\u{061C}'
            | '\u{180E}'
            | '\u{200B}'
            | '\u{200E}'
            | '\u{200F}'
            | '\u{202A}'..='\u{202E}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{206F}'
            | '\u{FEFF}'
            | '\u{FFF9}'..='\u{FFFB}'
            | '\u{E0001}'..='\u{E007F}'
    )
}

/// A docs relpath from the page (from `docs list`): `text_arg` rules (at most
/// `MAX_DOC_PATH` bytes), never empty, absolute (a leading `/`) or with a `..` segment
/// (split on `/` and `\\`, like the CLI's `readDoc`). A leading `-` is fine: it goes after
/// `--`, and the CLI checks again that it resolves inside the docs folder.
fn doc_path_arg(s: &str) -> Result<String, CfError> {
    let s = text_arg(s, MAX_DOC_PATH)?;
    if s.is_empty() || s.starts_with('/') || s.split(['/', '\\']).any(|segment| segment == "..") {
        return Err(refused(format!("not a valid doc path: {s:?}")));
    }
    Ok(s)
}

/// `s` Debug-quoted for a confirm dialog, cut to its first `max_chars` chars (never inside a
/// char) with the full byte count when longer. The Debug quoting is the protection: it shows
/// control, bidi and other invisible chars from untrusted text as `\u{..}` escapes.
fn preview(s: &str, max_chars: usize) -> String {
    match s.char_indices().nth(max_chars) {
        Some((end, _)) => format!("{:?} … (cut, {} bytes)", &s[..end], s.len()),
        None => format!("{s:?}"),
    }
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

/// A session ref from the page: `data_arg` rules (at most `MAX_SESSION_REF` bytes) and the
/// CLI's `^(claude|codex|saved|legacy):[A-Za-z0-9._-]{1,200}$`, the id not `.` or `..`.
fn session_ref(s: &str) -> Result<String, CfError> {
    let invalid = || refused(format!("not a valid session ref: {s:?}"));
    let s = data_arg(s, MAX_SESSION_REF).map_err(|_| invalid())?;
    let (prefix, id) = s.split_once(':').ok_or_else(invalid)?;
    let id_ok = !id.is_empty()
        && id.len() <= MAX_SESSION_REF_ID
        && id != "."
        && id != ".."
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b));
    if !SESSION_REF_PREFIXES.contains(&prefix) || !id_ok {
        return Err(invalid());
    }
    Ok(s)
}

/// A session id for `session save --session-id`: a UUID (`8-4-4-4-12` hex digits, any case),
/// the same rule as the CLI's `isSessionUuid`.
fn session_id_arg(s: &str) -> Result<String, CfError> {
    let uuid = s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_hexdigit(),
        });
    if !uuid {
        return Err(refused(format!("not a session id (UUID): {s:?}")));
    }
    Ok(s.to_string())
}

/// A task id or question id (`qid`): exactly 8 lowercase letters or digits, the CLI's
/// `^[a-z0-9]{8}$`.
fn task_id_arg(s: &str) -> Result<String, CfError> {
    let id = s.len() == 8
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit());
    if !id {
        return Err(refused(format!("not a task id: {s:?}")));
    }
    Ok(s.to_string())
}

/// An opaque `task follow` cursor from a previous answer, at most `MAX_FOLLOW_CURSOR` bytes
/// and shaped like the CLI's
/// `^v1(\.[1-9]\d{0,2}\.[A-Za-z0-9][A-Za-z0-9_-]{7,127}\.\d{1,15})?$`. The CLI checks
/// that the session id belongs to the task.
fn follow_cursor_arg(s: &str) -> Result<String, CfError> {
    let digits = |part: &str, max: usize| {
        (1..=max).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_digit())
    };
    let position = |rest: &str| {
        let Some(rest) = rest.strip_prefix('.') else {
            return false;
        };
        let parts: Vec<&str> = rest.split('.').collect();
        let [attempt, session, offset] = parts.as_slice() else {
            return false;
        };
        let session_ok = (8..=128).contains(&session.len())
            && session.as_bytes()[0].is_ascii_alphanumeric()
            && session
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
        digits(attempt, 3) && !attempt.starts_with('0') && session_ok && digits(offset, 15)
    };
    let valid = s.len() <= MAX_FOLLOW_CURSOR
        && s.strip_prefix("v1")
            .is_some_and(|rest| rest.is_empty() || position(rest));
    if !valid {
        return Err(refused(format!("not a follow cursor: {s:?}")));
    }
    Ok(s.to_string())
}

/// The providers `session list --provider` takes from the page; argv is built from the enum.
#[derive(Clone, Copy)]
enum SessionProvider {
    Claude,
    Codex,
    Saved,
}

impl SessionProvider {
    fn parse(s: &str) -> Result<Self, CfError> {
        match s {
            "claude" => Ok(Self::Claude),
            "codex" => Ok(Self::Codex),
            "saved" => Ok(Self::Saved),
            _ => Err(refused(format!("not a session provider: {s:?}"))),
        }
    }

    fn flag(self) -> &'static str {
        match self {
            Self::Claude => "--provider=claude",
            Self::Codex => "--provider=codex",
            Self::Saved => "--provider=saved",
        }
    }
}

/// `--project-dir=<abs>` when the page named a project (it must be in `KnownProjects`).
fn optional_project_dir(
    known: &KnownProjects,
    project: Option<&str>,
) -> Result<Option<String>, CfError> {
    project.map(|path| project_dir_arg(known, path)).transpose()
}

/// `session list --json [--provider=<p>] [--project-dir=P] [--limit=<n>]`, limit in 1..=500.
fn session_list_argv(
    known: &KnownProjects,
    provider: Option<&str>,
    project: Option<&str>,
    limit: Option<u32>,
) -> Result<Vec<String>, CfError> {
    let mut args = to_args(&["session", "list", "--json"]);
    if let Some(provider) = provider {
        args.push(SessionProvider::parse(provider)?.flag().into());
    }
    args.extend(optional_project_dir(known, project)?);
    if let Some(limit) = limit {
        args.push(format!("--limit={}", limit.clamp(1, 500)));
    }
    Ok(args)
}

/// `session show --json [--include-tool-output] [--offset=<n>] [--limit=<n>] [--project-dir=P]
/// -- <ref>`, limit in 1..=1000.
fn session_show_argv(
    known: &KnownProjects,
    r#ref: &str,
    project: Option<&str>,
    offset: Option<u32>,
    limit: Option<u32>,
    include_tool_output: bool,
) -> Result<Vec<String>, CfError> {
    let mut args = to_args(&["session", "show", "--json"]);
    if include_tool_output {
        args.push("--include-tool-output".into());
    }
    if let Some(offset) = offset {
        args.push(format!("--offset={offset}"));
    }
    if let Some(limit) = limit {
        args.push(format!("--limit={}", limit.clamp(1, 1000)));
    }
    args.extend(optional_project_dir(known, project)?);
    args.extend(["--".into(), session_ref(r#ref)?]);
    Ok(args)
}

/// `session export --json [--include-tool-output] [--project-dir=P] [--out=<path> --force]
/// -- <ref>`: without `out` the redacted Markdown is printed (the preview), with it the CLI
/// writes the file. Both use the same flags, so the preview's counts match the file.
fn session_export_argv(
    known: &KnownProjects,
    r#ref: &str,
    project: Option<&str>,
    include_tool_output: bool,
    out: Option<&str>,
) -> Result<Vec<String>, CfError> {
    let mut args = to_args(&["session", "export", "--json"]);
    if include_tool_output {
        args.push("--include-tool-output".into());
    }
    args.extend(optional_project_dir(known, project)?);
    if let Some(out) = out {
        args.extend([format!("--out={out}"), "--force".into()]);
    }
    args.extend(["--".into(), session_ref(r#ref)?]);
    Ok(args)
}

/// `session save --json --session-id <uuid> [--project-dir=P] -- <label>`; an empty or
/// whitespace-only label is refused.
fn session_save_argv(
    known: &KnownProjects,
    session_id: &str,
    label: &str,
    project: Option<&str>,
) -> Result<Vec<String>, CfError> {
    if label.trim().is_empty() {
        return Err(refused("the session label is empty".to_string()));
    }
    let mut args = to_args(&["session", "save", "--json", "--session-id"]);
    args.push(session_id_arg(session_id)?);
    args.extend(optional_project_dir(known, project)?);
    args.extend(["--".into(), text_arg(label, MAX_SESSION_LABEL)?]);
    Ok(args)
}

/// `session load --json --yes --target=<T> [--project-dir=P] -- <ref>`: `target` and
/// `project` must be known projects; a `legacy:` ref needs `project` (where its folder is).
fn session_load_argv(
    known: &KnownProjects,
    r#ref: &str,
    target: &str,
    project: Option<&str>,
) -> Result<Vec<String>, CfError> {
    let r#ref = session_ref(r#ref)?;
    if r#ref.starts_with("legacy:") && project.is_none() {
        return Err(refused(format!("{ref:?} needs its project")));
    }
    let mut args = to_args(&["session", "load", "--json", "--yes"]);
    args.push(format!("--target={}", known_project(known, target)?));
    args.extend(optional_project_dir(known, project)?);
    args.extend(["--".into(), r#ref]);
    Ok(args)
}

/// `task follow --json [--cursor <c>] -- <id>`.
fn task_follow_argv(id: &str, cursor: Option<&str>) -> Result<Vec<String>, CfError> {
    let mut args = to_args(&["task", "follow", "--json"]);
    if let Some(cursor) = cursor {
        args.extend(["--cursor".into(), follow_cursor_arg(cursor)?]);
    }
    args.extend(["--".into(), task_id_arg(id)?]);
    Ok(args)
}

/// `reply --json --task <id> -- <qid> <answer>`; the answer is one line of at most
/// `MAX_ANSWER` bytes.
fn task_reply_argv(task_id: &str, qid: &str, answer: &str) -> Result<Vec<String>, CfError> {
    let mut args = to_args(&["reply", "--json", "--task"]);
    args.push(task_id_arg(task_id)?);
    args.extend([
        "--".into(),
        task_id_arg(qid)?,
        text_arg(answer, MAX_ANSWER)?,
    ]);
    Ok(args)
}

/// The question of pending ask `qid` in `task show` data; `Refused` when the task has no
/// such pending ask (answered, or never asked).
fn pending_question(task: &Value, qid: &str) -> Result<String, CfError> {
    task["pendingAsks"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|ask| ask["qid"] == qid)
        .and_then(|ask| ask["question"].as_str())
        .map(str::to_string)
        .ok_or_else(|| refused(format!("task has no pending question {qid:?}")))
}

/// `task cancel --json -- <id>`.
fn task_cancel_argv(id: &str) -> Result<Vec<String>, CfError> {
    let mut args = to_args(&["task", "cancel", "--json"]);
    args.extend(["--".into(), task_id_arg(id)?]);
    Ok(args)
}

/// `path` canonicalized, or (while `subfolder` does not exist yet) its canonical parent
/// joined with `subfolder`; `None` for a relative path or a missing parent.
fn dir_key(path: &str, subfolder: &str) -> Option<PathBuf> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return None;
    }
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return Some(canonical);
    }
    if path.file_name()? != subfolder {
        return None;
    }
    Some(std::fs::canonicalize(path.parent()?).ok()?.join(subfolder))
}

/// The suggestion (as `learn status` or `session status` gave it) that `path` names,
/// compared after `dir_key`; only `subfolder` folders count. Anything else is `Refused`.
fn dir_from_suggestions(
    path: &str,
    suggestions: &[String],
    subfolder: &str,
) -> Result<String, CfError> {
    let not_suggested = || refused(format!("not a suggested {subfolder} folder: {path:?}"));
    let wanted = dir_key(path, subfolder).ok_or_else(not_suggested)?;
    suggestions
        .iter()
        .filter(|suggestion| Path::new(suggestion).file_name() == Some(subfolder.as_ref()))
        .find(|suggestion| dir_key(suggestion, subfolder).as_ref() == Some(&wanted))
        .cloned()
        .ok_or_else(not_suggested)
}

/// The canonical path of a folder in `KnownProjects`.
fn known_project(known: &KnownProjects, path: &str) -> Result<String, CfError> {
    let dir = project_path(path, true)?;
    if !known.contains(&dir) {
        return Err(refused(format!("not a registered project: {path:?}")));
    }
    utf8(dir)
}

/// `--project-dir=<abs>` for a folder in `KnownProjects` (compared after canonicalizing).
fn project_dir_arg(known: &KnownProjects, path: &str) -> Result<String, CfError> {
    Ok(format!("{PROJECT_DIR}{}", known_project(known, path)?))
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
            "{key} decides where Coding Friend writes files or sends data; change it with the cf CLI"
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

/// `ask` before a `cf` run, showing `details` (`label: value` lines built by Rust, under the
/// command line) and the size of `body` (never the body itself). On OK it emits
/// `RUN_STARTED` (`{ command, op }`), so the page shows the run only from then on.
async fn confirm(
    app: &AppHandle,
    op: &str,
    command_line: &str,
    details: &[String],
    body: Option<&str>,
) -> Result<(), CfError> {
    let details = if details.is_empty() {
        String::new()
    } else {
        format!("\n\n{}", details.join("\n"))
    };
    let size = body.map_or(String::new(), |body| {
        format!(
            "\n\nNew body: {} bytes, sent on stdin (not shown here).",
            body.len()
        )
    });
    ask(
        app,
        "Run this command?",
        format!("Coding Friend will run:\n\n{command_line}{details}{size}"),
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

/// Confirms `command_line` (with `details`), then runs `argv` (with `body` on stdin), one
/// mutating command at a time.
#[allow(clippy::too_many_arguments)]
async fn confirm_and_run(
    app: &AppHandle,
    lock: &MutationLock,
    op: &str,
    command_line: &str,
    details: &[String],
    argv: &[String],
    body: Option<&str>,
    timeout: Duration,
) -> Result<Value, CfError> {
    let _guard = lock.0.lock().await;
    confirm(app, op, command_line, details, body).await?;
    match body {
        Some(body) => cf::run_cf_with_input(argv, body, timeout).await,
        None => cf::run_cf(argv, timeout).await,
    }
}

/// `cf <argv>` as the user reads it in the confirm dialog (without `--json`). Words after
/// `--` and the paths of `QUOTED_PATH_FLAGS` are Debug-quoted, so a newline cannot fake
/// dialog text.
fn command_line(argv: &[String]) -> String {
    let mut words = vec!["cf".to_string()];
    let mut after_dashes = false;
    for word in argv {
        let flag_path = QUOTED_PATH_FLAGS
            .iter()
            .find_map(|flag| Some((flag, word.strip_prefix(flag)?)));
        if after_dashes {
            words.push(format!("{word:?}"));
        } else if let Some((flag, path)) = flag_path {
            words.push(format!("{flag}{path:?}"));
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
        &[],
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
        &[],
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
        doc_path_arg(&relpath)?,
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
/// No `MutationLock` and no `RUN_STARTED`: it never runs `cf`. While one link's confirm is
/// up, another `open_url` is refused (`OpenUrlLock`), so clicks never stack dialogs.
#[tauri::command]
pub async fn open_url(
    app: AppHandle,
    lock: State<'_, OpenUrlLock>,
    url: String,
) -> Result<(), CfError> {
    let url = external_url(&url)?;
    let _guard = lock
        .0
        .try_lock()
        .map_err(|_| refused("another link is waiting to be opened".to_string()))?;
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
        &[],
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
        &[],
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
        &[],
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
        &[],
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
    confirm(app, "learnDir", &command_line(&args), &[], None).await?;
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
    let dir = dir_from_suggestions(&path, &suggestions, LEARN_SUBFOLDER)?;
    save_learn_dir(&app, dir).await
}

/// `session list --json [--provider=<p>] [--project-dir=P] [--limit=<n>]`.
#[tauri::command]
pub async fn session_list(
    known: State<'_, KnownProjects>,
    provider: Option<String>,
    project: Option<String>,
    limit: Option<u32>,
) -> Result<Value, CfError> {
    let args = session_list_argv(&known, provider.as_deref(), project.as_deref(), limit)?;
    cf::run_cf(&args, SESSION_READ_TIMEOUT).await
}

/// `session show --json [--include-tool-output] [--offset=<n>] [--limit=<n>] [--project-dir=P]
/// -- <ref>`: one page of turns, always redacted by the CLI.
#[tauri::command]
pub async fn session_show(
    known: State<'_, KnownProjects>,
    r#ref: String,
    project: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
    include_tool_output: bool,
) -> Result<Value, CfError> {
    let args = session_show_argv(
        &known,
        &r#ref,
        project.as_deref(),
        offset,
        limit,
        include_tool_output,
    )?;
    cf::run_cf(&args, SESSION_READ_TIMEOUT).await
}

/// `session export --json [--include-tool-output] [--project-dir=P] -- <ref>`.
#[tauri::command]
pub async fn session_export_preview(
    known: State<'_, KnownProjects>,
    r#ref: String,
    project: Option<String>,
    include_tool_output: bool,
) -> Result<Value, CfError> {
    let args = session_export_argv(
        &known,
        &r#ref,
        project.as_deref(),
        include_tool_output,
        None,
    )?;
    cf::run_cf(&args, SESSION_READ_TIMEOUT).await
}

#[tauri::command]
pub async fn session_status() -> Result<Value, CfError> {
    run(&["session", "status", "--json"], cf::QUERY_TIMEOUT).await
}

#[tauri::command]
pub async fn sync_status() -> Result<Value, CfError> {
    run(&["sync", "status", "--json"], SESSION_READ_TIMEOUT).await
}

/// Exports the redacted Markdown of a session to a file the user picks. Under the
/// `MutationLock` for the whole flow: Rust runs the preview itself (for the byte and
/// redaction counts, never taken from the page), shows a native save dialog, confirms, then
/// runs the same argv with `--out=<path> --force`.
#[tauri::command]
pub async fn session_export(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    known: State<'_, KnownProjects>,
    r#ref: String,
    project: Option<String>,
    include_tool_output: bool,
) -> Result<Value, CfError> {
    let project = project.as_deref();
    let preview = session_export_argv(&known, &r#ref, project, include_tool_output, None)?;
    let _guard = lock.0.lock().await;
    let data = cf::run_cf(&preview, SESSION_READ_TIMEOUT).await?;
    let count = |value: &Value| {
        value
            .as_u64()
            .ok_or_else(|| refused("session export gave no byte or redaction count".to_string()))
    };
    let bytes = count(&data["bytes"])?;
    let redactions = count(&data["redactions"]["total"])?;
    // The ref is `[A-Za-z0-9._-]` after its prefix: a safe file name once `:` is replaced.
    let file_name = format!("{}.md", r#ref.replace(':', "-"));
    let out = picked(|done| {
        app.dialog()
            .file()
            .set_title("Export the session")
            .set_file_name(file_name)
            .add_filter("Markdown", &["md"])
            .save_file(done)
    })
    .await?;
    if !out.is_absolute() {
        return Err(refused(format!("not an absolute path: {out:?}")));
    }
    let out = utf8(out)?;
    let args = session_export_argv(&known, &r#ref, project, include_tool_output, Some(&out))?;
    let tool_output = if include_tool_output {
        "included (redacted, cut)"
    } else {
        "not included"
    };
    let details = [
        format!("Destination: {out:?}"),
        format!("Size: {bytes} bytes"),
        format!("Redactions: {redactions}"),
        format!("Tool output: {tool_output}"),
        "Redaction is best effort; read the file before sharing.".to_string(),
    ];
    confirm(&app, "sessionExport", &command_line(&args), &details, None).await?;
    cf::run_cf(&args, SESSION_WRITE_TIMEOUT).await
}

/// `session save --json --session-id <uuid> [--project-dir=P] -- <label>` after a native
/// confirm that names the destination (`dir` from Rust's own `session status`). Under the
/// `MutationLock` for the whole flow, status included.
#[tauri::command]
pub async fn session_save(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    known: State<'_, KnownProjects>,
    session_id: String,
    label: String,
    project: Option<String>,
) -> Result<Value, CfError> {
    let args = session_save_argv(&known, &session_id, &label, project.as_deref())?;
    // Locked before the status, so the folder the confirm names is the one the save uses.
    let _guard = lock.0.lock().await;
    let status = run(&["session", "status", "--json"], cf::QUERY_TIMEOUT).await?;
    let dir = status["dir"]
        .as_str()
        .ok_or_else(|| refused("session status gave no session folder".to_string()))?;
    let details = [
        format!("Destination: {dir:?}"),
        "Transcript is copied verbatim (not redacted). Use Export to share.".to_string(),
    ];
    confirm(&app, "sessionSave", &command_line(&args), &details, None).await?;
    cf::run_cf(&args, SESSION_WRITE_TIMEOUT).await
}

/// `session load --json --yes --target=<T> [--project-dir=P] -- <ref>` after a native
/// confirm; `target` (and `project`, required for a `legacy:` ref) must be known projects.
#[tauri::command]
pub async fn session_load(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    known: State<'_, KnownProjects>,
    r#ref: String,
    target: String,
    project: Option<String>,
) -> Result<Value, CfError> {
    let args = session_load_argv(&known, &r#ref, &target, project.as_deref())?;
    let target = known_project(&known, &target)?;
    let details = [
        format!("Session: {ref:?}"),
        format!("Target project: {target:?}"),
        "Only load sessions you saved yourself: a synced transcript becomes model context on resume."
            .to_string(),
    ];
    confirm_and_run(
        &app,
        &lock,
        "sessionLoad",
        &command_line(&args),
        &details,
        &args,
        None,
        SESSION_WRITE_TIMEOUT,
    )
    .await
}

/// Confirms and runs `config set --global --json -- session.dir <dir>`. The caller holds
/// the `MutationLock` and chose `dir` from a picker or a Rust-fetched suggestion.
async fn save_session_dir(app: &AppHandle, dir: String) -> Result<Value, CfError> {
    let args = to_args(&[
        "config",
        "set",
        "--global",
        "--json",
        "--",
        SESSION_DIR_KEY,
        &dir,
    ]);
    confirm(app, "sessionDir", &command_line(&args), &[], None).await?;
    cf::run_cf(&args, cf::QUERY_TIMEOUT).await
}

/// Opens a native folder picker; the picked folder (canonicalized) becomes the session
/// folder after a native confirm.
#[tauri::command]
pub async fn choose_session_dir(
    app: AppHandle,
    lock: State<'_, MutationLock>,
) -> Result<Value, CfError> {
    let _guard = lock.0.lock().await;
    let folder = picked(|done| {
        app.dialog()
            .file()
            .set_title("Choose the session folder")
            .pick_folder(done)
    })
    .await?;
    let dir = utf8(project_path(&utf8(folder)?, true)?)?;
    save_session_dir(&app, dir).await
}

/// Makes one of `session status`'s suggested cloud folders the session folder, after a
/// native confirm. Rust fetches the suggestions itself; any other path is `Refused`.
#[tauri::command]
pub async fn set_session_dir(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    path: String,
) -> Result<Value, CfError> {
    let _guard = lock.0.lock().await;
    let status = run(&["session", "status", "--json"], cf::QUERY_TIMEOUT).await?;
    let suggestions: Vec<String> = status["suggestions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|suggestion| suggestion["path"].as_str())
        .map(str::to_string)
        .collect();
    let dir = dir_from_suggestions(&path, &suggestions, SESSION_SUBFOLDER)?;
    save_session_dir(&app, dir).await
}

#[tauri::command]
pub async fn task_list() -> Result<Value, CfError> {
    run(&["task", "list", "--json"], cf::QUERY_TIMEOUT).await
}

/// `task follow --json [--cursor <c>] -- <id>`: one poll of the task's worker transcript.
#[tauri::command]
pub async fn task_follow(id: String, cursor: Option<String>) -> Result<Value, CfError> {
    let args = task_follow_argv(&id, cursor.as_deref())?;
    cf::run_cf(&args, cf::QUERY_TIMEOUT).await
}

/// `reply --json --task <id> -- <qid> <answer>`, after a native confirm that shows the
/// question (from Rust's own `task show`, never from the page) and the answer, both
/// Debug-quoted and cut to `MAX_SHOWN_CHARS`. Under the `MutationLock` for the whole flow.
#[tauri::command]
pub async fn task_reply(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    task_id: String,
    qid: String,
    answer: String,
) -> Result<Value, CfError> {
    let args = task_reply_argv(&task_id, &qid, &answer)?;
    let _guard = lock.0.lock().await;
    let task = run(
        &["task", "show", "--json", "--", &task_id],
        cf::QUERY_TIMEOUT,
    )
    .await?;
    let question = pending_question(&task, &qid)?;
    // Built by hand (not `command_line`) so the shown answer is cut too; both ids are
    // validated 8-char alphanumerics.
    let line = format!(
        "cf reply --task {task_id} -- {qid:?} {}",
        preview(&answer, MAX_SHOWN_CHARS)
    );
    let details = [
        format!("Question {qid} of task {task_id}:"),
        preview(&question, MAX_SHOWN_CHARS),
    ];
    confirm(&app, "taskReply", &line, &details, None).await?;
    cf::run_cf(&args, cf::QUERY_TIMEOUT).await
}

/// `task cancel --json -- <id>`, after a native confirm.
#[tauri::command]
pub async fn task_cancel(
    app: AppHandle,
    lock: State<'_, MutationLock>,
    id: String,
) -> Result<Value, CfError> {
    let args = task_cancel_argv(&id)?;
    let details = [format!("Cancel task {id} and stop its worker.")];
    confirm_and_run(
        &app,
        &lock,
        "taskCancel",
        &command_line(&args),
        &details,
        &args,
        None,
        cf::QUERY_TIMEOUT,
    )
    .await
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
        &[],
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
        &[],
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
        for arg in [
            "", "-x", "/x", "a\0b", "a\nb", "../x", "a/../b", "a\\b", "abcdef",
        ] {
            assert!(
                matches!(data_arg(arg, 5), Err(CfError::Refused { .. })),
                "{arg:?}"
            );
        }
    }

    #[test]
    fn text_arg_keeps_values_and_refuses_control_chars_and_long_input() {
        for arg in ["../shared-docs", "-1", "", "a\u{200D}b", "a\u{200C}b"] {
            assert_eq!(text_arg(arg, 20), Ok(arg.to_string()));
        }
        for arg in [
            "a\0b",
            "a\nb",
            "a\u{202E}b",
            "a\u{2066}b",
            "a\u{200B}b",
            "a\u{200F}b",
            "\u{FEFF}x",
            &"x".repeat(21),
        ] {
            assert!(
                matches!(text_arg(arg, 20), Err(CfError::Refused { .. })),
                "{arg:?}"
            );
        }
    }

    #[test]
    fn doc_path_arg_allows_leading_dash_and_refuses_traversal_and_absolute_paths() {
        for arg in ["-notes.md", "a/b.md", "a\\b.md"] {
            assert_eq!(doc_path_arg(arg), Ok(arg.to_string()));
        }
        for arg in [
            "",
            "/etc/x.md",
            "../x.md",
            "a/../b.md",
            "a\\..\\b.md",
            "a\nb.md",
        ] {
            assert!(
                matches!(doc_path_arg(arg), Err(CfError::Refused { .. })),
                "{arg:?}"
            );
        }
    }

    #[test]
    fn preview_debug_quotes_and_cuts_on_a_char_boundary() {
        assert_eq!(preview("a\nb", 10), r#""a\nb""#);
        assert_eq!(preview("a\u{202E}b", 10), r#""a\u{202e}b""#);
        // 3 chars kept of "éééé" (8 bytes): never a byte slice inside a char.
        assert_eq!(preview("éééé", 3), r#""ééé" … (cut, 8 bytes)"#);
    }

    #[test]
    fn pending_question_finds_the_qid_or_refuses() {
        let task = serde_json::json!({
            "pendingAsks": [{ "qid": "efgh5678", "question": "Which DB?" }]
        });
        assert_eq!(
            pending_question(&task, "efgh5678"),
            Ok("Which DB?".to_string())
        );
        assert!(matches!(
            pending_question(&task, "zzzz9999"),
            Err(CfError::Refused { .. })
        ));
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
    fn session_ref_needs_a_known_prefix_and_a_safe_id() {
        for arg in [
            "claude:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
            "codex:019a2b3c-thread.1",
            "saved:2026-11-04_fix-login",
            "legacy:a.b",
        ] {
            assert_eq!(session_ref(arg), Ok(arg.to_string()), "{arg}");
        }
        for arg in [
            "github:abc",
            "claude:",
            "claude:.",
            "claude:..",
            "saved:a/../b",
            "-claude:abc",
            "claude:a\nb",
            &format!("claude:{}", "a".repeat(250)),
        ] {
            assert!(
                matches!(session_ref(arg), Err(CfError::Refused { .. })),
                "{arg:?}"
            );
        }
    }

    #[test]
    fn session_show_argv_puts_the_ref_after_the_separator() {
        let known = KnownProjects::default();
        let argv = session_show_argv(&known, "saved:--json", None, Some(10), Some(5000), true);
        assert_eq!(
            argv,
            Ok(words(&[
                "session",
                "show",
                "--json",
                "--include-tool-output",
                "--offset=10",
                "--limit=1000",
                "--",
                "saved:--json",
            ]))
        );
        assert!(matches!(
            session_show_argv(&known, "--json", None, None, None, false),
            Err(CfError::Refused { .. })
        ));
    }

    #[test]
    fn session_list_argv_takes_only_the_three_providers() {
        let known = KnownProjects::default();
        assert_eq!(
            session_list_argv(&known, Some("codex"), None, Some(0)),
            Ok(words(&[
                "session",
                "list",
                "--json",
                "--provider=codex",
                "--limit=1"
            ]))
        );
        for provider in ["legacy", "Claude", "--all", "claude --json", ""] {
            assert!(
                matches!(
                    session_list_argv(&known, Some(provider), None, None),
                    Err(CfError::Refused { .. })
                ),
                "{provider:?}"
            );
        }
    }

    #[test]
    fn suggested_dir_must_be_one_of_the_suggestions() {
        for (subfolder, other) in [
            (LEARN_SUBFOLDER, SESSION_SUBFOLDER),
            (SESSION_SUBFOLDER, LEARN_SUBFOLDER),
        ] {
            let root = std::env::temp_dir().join(format!(
                "cf-suggested-dir-{subfolder}-{}",
                std::process::id()
            ));
            let existing = root.join("icloud").join(subfolder);
            let missing_parent = root.join("drive");
            std::fs::create_dir_all(&existing).unwrap();
            std::fs::create_dir_all(&missing_parent).unwrap();
            let shown = |path: &Path| path.to_str().unwrap().to_string();
            // `exists: false`: the subfolder is not created yet.
            let missing = shown(&missing_parent.join(subfolder));
            let wrong_kind = shown(&missing_parent.join(other));
            let suggestions = [shown(&existing), missing.clone(), wrong_kind.clone()];

            // The suggestion string itself is kept, also when given through a `..` detour.
            let detour = shown(&root.join("drive/../icloud").join(subfolder));
            assert_eq!(
                dir_from_suggestions(&detour, &suggestions, subfolder),
                Ok(shown(&existing))
            );
            assert_eq!(
                dir_from_suggestions(&missing, &suggestions, subfolder),
                Ok(missing.clone())
            );
            for path in [
                shown(&missing_parent),
                shown(&root.join("other").join(subfolder)),
                wrong_kind,
                format!("relative/{subfolder}"),
            ] {
                assert!(
                    matches!(
                        dir_from_suggestions(&path, &suggestions, subfolder),
                        Err(CfError::Refused { .. })
                    ),
                    "{path}"
                );
            }
            std::fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn session_export_writes_with_the_flags_of_its_preview() {
        let known = KnownProjects::default();
        let dir = std::fs::canonicalize(std::env::temp_dir()).unwrap();
        known.insert(&dir);
        let project = dir.to_str().unwrap();
        let project_dir = format!("--project-dir={project}");
        let preview = session_export_argv(&known, "saved:--json", Some(project), true, None);
        let write = session_export_argv(
            &known,
            "saved:--json",
            Some(project),
            true,
            Some("/tmp/x.md"),
        );
        let head = ["session", "export", "--json", "--include-tool-output"];
        let mut expected = words(&head);
        expected.extend([project_dir.clone(), "--".into(), "saved:--json".into()]);
        assert_eq!(preview, Ok(expected));
        let mut expected = words(&head);
        expected.extend([
            project_dir,
            "--out=/tmp/x.md".into(),
            "--force".into(),
            "--".into(),
            "saved:--json".into(),
        ]);
        assert_eq!(write, Ok(expected));
    }

    #[test]
    fn command_line_quotes_flag_paths_and_words_after_dashes() {
        let argv = words(&[
            "session",
            "export",
            "--json",
            "--out=/tmp/a\nOK",
            "--target=/p\nq",
            "--project-dir=/d\ne",
            "--force",
            "--",
            "saved:x",
            "--",
            "a\nb",
        ]);
        // A real newline in the argv shows as the two characters `\n`; every word after
        // the first `--` is quoted, a second `--` included.
        assert_eq!(
            command_line(&argv),
            r#"cf session export --out="/tmp/a\nOK" --target="/p\nq" --project-dir="/d\ne" --force -- "saved:x" "--" "a\nb""#
        );
    }

    #[test]
    fn session_save_argv_puts_the_label_after_the_separator() {
        let known = KnownProjects::default();
        let id = "0f1e2d3c-4b5a-6978-8796-A5B4C3D2E1F0";
        assert_eq!(
            session_save_argv(&known, id, "--json", None),
            Ok(words(&[
                "session",
                "save",
                "--json",
                "--session-id",
                id,
                "--",
                "--json"
            ]))
        );
        assert!(matches!(
            session_save_argv(&known, "--json", "x", None),
            Err(CfError::Refused { .. })
        ));
        assert!(matches!(
            session_save_argv(&known, id, "   ", None),
            Err(CfError::Refused { .. })
        ));
    }

    #[test]
    fn session_load_needs_a_known_project_for_a_legacy_ref() {
        let known = KnownProjects::default();
        let dir = std::fs::canonicalize(std::env::temp_dir()).unwrap();
        known.insert(&dir);
        let path = dir.to_str().unwrap();
        assert!(matches!(
            session_load_argv(&known, "legacy:a", path, None),
            Err(CfError::Refused { .. })
        ));
        assert_eq!(
            session_load_argv(&known, "legacy:a", path, Some(path)),
            Ok(words(&[
                "session",
                "load",
                "--json",
                "--yes",
                &format!("--target={path}"),
                &format!("--project-dir={path}"),
                "--",
                "legacy:a",
            ]))
        );
        assert_eq!(
            session_load_argv(&known, "saved:a", path, None),
            Ok(words(&[
                "session",
                "load",
                "--json",
                "--yes",
                &format!("--target={path}"),
                "--",
                "saved:a",
            ]))
        );
        assert!(matches!(
            session_load_argv(&KnownProjects::default(), "saved:a", path, None),
            Err(CfError::Refused { .. })
        ));
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
        for key in [
            "tdd",
            "learn.autoCommit",
            "a1.b2.c3.d4.e5.f6",
            "learnX",
            "decision.provider",
        ] {
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
            "session",
            "session.dir",
            "decision",
            "decision.allowRemote",
            "decision.baseUrl",
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

    #[test]
    fn task_id_arg_needs_8_lowercase_alphanumeric_chars() {
        assert_eq!(task_id_arg("abcd1234"), Ok("abcd1234".to_string()));
        for arg in [
            "",
            "-bcd1234",
            "../bcd12",
            "abcd123",
            "abcd12345",
            "ABCD1234",
            "abcd12\n4",
        ] {
            assert!(
                matches!(task_id_arg(arg), Err(CfError::Refused { .. })),
                "{arg:?}"
            );
        }
    }

    #[test]
    fn follow_cursor_arg_accepts_only_the_cli_cursor_shape() {
        let longest = format!("v1.999.{}.{}", "a".repeat(128), "9".repeat(15));
        for arg in [
            "v1",
            "v1.1.abcdefgh.0",
            "v1.2.0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.12345",
            "v1.10.019a2b3c_thread.7",
            &longest,
        ] {
            assert_eq!(follow_cursor_arg(arg), Ok(arg.to_string()), "{arg}");
        }
        for arg in [
            "",
            "v2",
            "-v1",
            "v1.",
            "v1.0.abcdefgh.0",
            "v1.1000.abcdefgh.0",
            "v1.1.abcdefg.0",
            "v1.1._bcdefgh.0",
            "v1.1.a/../bcdefgh.0",
            "v1.1.abcdefgh",
            "v1.1.abcdefgh.",
            "v1.1.abcdefgh.0.0",
            "v1.1.abcdefgh.1234567890123456",
            "v1.1.abcdefgh.0\n",
            &format!("v1.1.{}.0", "a".repeat(129)),
            &format!("v1.1.abcdefgh.0{}", "0".repeat(160)),
        ] {
            assert!(
                matches!(follow_cursor_arg(arg), Err(CfError::Refused { .. })),
                "{arg:?}"
            );
        }
    }

    #[test]
    fn task_argv_puts_ids_and_the_answer_after_the_separator() {
        let id = "abcd1234";
        assert_eq!(
            task_follow_argv(id, None),
            Ok(words(&["task", "follow", "--json", "--", id]))
        );
        assert_eq!(
            task_follow_argv(id, Some("v1.1.abcdefgh.0")),
            Ok(words(&[
                "task",
                "follow",
                "--json",
                "--cursor",
                "v1.1.abcdefgh.0",
                "--",
                id
            ]))
        );
        assert_eq!(
            task_reply_argv(id, "efgh5678", "--json"),
            Ok(words(&[
                "reply", "--json", "--task", id, "--", "efgh5678", "--json"
            ]))
        );
        assert_eq!(
            task_reply_argv(id, "efgh5678", &"x".repeat(MAX_ANSWER)).map(|argv| argv.len()),
            Ok(7)
        );
        assert_eq!(
            task_cancel_argv(id),
            Ok(words(&["task", "cancel", "--json", "--", id]))
        );
        for result in [
            task_follow_argv("--json", None),
            task_follow_argv(id, Some("--json")),
            task_reply_argv("--json", "efgh5678", "yes"),
            task_reply_argv(id, "-fgh5678", "yes"),
            task_reply_argv(id, "efgh5678", "yes\nno"),
            task_reply_argv(id, "efgh5678", &"x".repeat(MAX_ANSWER + 1)),
            task_cancel_argv("../../x"),
        ] {
            assert!(matches!(result, Err(CfError::Refused { .. })), "{result:?}");
        }
    }
}
