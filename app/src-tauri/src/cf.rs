//! Bridge to the `cf` CLI: spawn it with `--json`, read its one-line envelope.
//!
//! The result comes from the envelope's `ok`, never from the exit code
//! (`update --yes --json` can exit 1 with `ok:true`).

use std::ffi::OsStr;
use std::io::ErrorKind;
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{ExitStatus, Stdio};
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;

use crate::path_env::login_path;

pub const VERSION_TIMEOUT: Duration = Duration::from_secs(10);
/// `project`, `task`, `chef` and `supervisor` commands.
pub const QUERY_TIMEOUT: Duration = Duration::from_secs(15);
/// Doctor runs its probes one after another (worst case ~71 s).
pub const DOCTOR_TIMEOUT: Duration = Duration::from_secs(90);
pub const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(60);
pub const FIX_TIMEOUT: Duration = Duration::from_secs(120);
pub const UPDATE_YES_TIMEOUT: Duration = Duration::from_secs(15 * 60);

const CONTRACT_VERSION: i64 = 1;
const STDOUT_CAP: usize = 8 * 1024 * 1024;
const STDERR_TAIL: usize = 4 * 1024;
const ENV_BIN: &str = "CF_APP_CF_BIN";
const SETTINGS_FILE: &str = "settings.json";
/// Commander's messages for a command or option this CLI does not know.
const UNKNOWN_PREFIXES: [&str; 2] = ["error: unknown command ", "error: unknown option "];

static CONFIG_DIR: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CfError {
    /// No `cf` on PATH, or the configured binary does not exist (or cannot be spawned).
    CliNotFound { path: String },
    Timeout {
        secs: u64,
        stderr_tail: Option<String>,
    },
    /// No JSON envelope, or a USAGE envelope for an unknown command/option.
    CliTooOld { stderr_tail: Option<String> },
    Incompatible {
        contract_version: i64,
        stderr_tail: Option<String>,
    },
    CliError {
        code: String,
        message: String,
        stderr_tail: Option<String>,
    },
    Io {
        message: String,
        stderr_tail: Option<String>,
    },
    /// `cf` printed nothing and exited 127: `#!/usr/bin/env node` found no `node` on PATH.
    NodeNotFound {
        stderr_tail: Option<String>,
        /// "login-shell" or "fallback": where the PATH `cf` ran with came from.
        login_path_source: &'static str,
    },
    /// The app refused the request before spawning `cf` (argv or path not allowed).
    Refused { message: String },
    /// The user pressed Cancel in a native confirm dialog or picker; nothing ran.
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CfSource {
    Env,
    Settings,
    Path,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResolvedCf {
    pub path: PathBuf,
    pub source: CfSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GateState {
    Ok,
    NotFound,
    TooOld,
    NodeNotFound,
    Incompatible,
    Error,
}

/// What the version gate screen shows.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    pub state: GateState,
    pub cf: Option<ResolvedCf>,
    /// Semver from `version --json`; informational only.
    pub version: Option<String>,
    pub error: Option<CfError>,
    /// `doctor --json` data from the probe, so the UI need not run doctor again.
    pub doctor: Option<Value>,
}

/// The app's config dir (holds `settings.json`); set once at startup.
pub fn set_config_dir(dir: PathBuf) {
    let _ = CONFIG_DIR.set(dir);
}

pub fn settings_path() -> Option<PathBuf> {
    CONFIG_DIR.get().map(|dir| dir.join(SETTINGS_FILE))
}

/// `CF_APP_CF_BIN` > `cfBinPath` in settings.json > `cf` in the login shell's PATH.
/// A set path that is missing is `CliNotFound`, one that fails `check_cf_bin` is `Refused`
/// (with the reason): it never falls through.
pub async fn resolve_cf() -> Result<ResolvedCf, CfError> {
    if let Some(bin) = std::env::var_os(ENV_BIN).filter(|bin| !bin.is_empty()) {
        return trusted(PathBuf::from(bin), CfSource::Env, false);
    }
    if let Some(bin) = settings_cf_bin() {
        return trusted(bin, CfSource::Settings, true);
    }
    find_in_path(&login_path().await.path)
        .map(|path| ResolvedCf {
            path,
            source: CfSource::Path,
        })
        .ok_or(CfError::CliNotFound {
            path: "cf".to_string(),
        })
}

fn trusted(path: PathBuf, source: CfSource, owned: bool) -> Result<ResolvedCf, CfError> {
    match check_cf_bin(&path, owned) {
        Ok(()) => Ok(ResolvedCf { path, source }),
        // A relative path is refused, never looked up against the app's cwd.
        Err(_) if path.is_absolute() && !path.exists() => Err(CfError::CliNotFound {
            path: path.display().to_string(),
        }),
        Err(reason) => {
            let label = match source {
                CfSource::Env => ENV_BIN,
                _ => "settings.json cfBinPath",
            };
            Err(CfError::Refused {
                message: format!("{label} {}: {reason}", path.display()),
            })
        }
    }
}

/// A `cf` binary the app may run: an absolute path named exactly `cf` (as given: npm's
/// bin symlink points at `index.js`) to an executable regular file. With `owned`, both the
/// path itself and the file it leads to must belong to the current user, and that file
/// must not be group- or world-writable. `Err` says why not.
pub(crate) fn check_cf_bin(path: &Path, owned: bool) -> Result<(), String> {
    let shown = path.display();
    if !path.is_absolute() {
        return Err(format!("not an absolute path: {shown}"));
    }
    if path.file_name() != Some(OsStr::new("cf")) {
        return Err(format!("not named cf: {shown}"));
    }
    if !is_executable(path) {
        return Err(format!("not an executable file: {shown}"));
    }
    if !owned {
        return Ok(());
    }
    // SAFETY: getuid has no preconditions and cannot fail.
    let uid = unsafe { libc::getuid() };
    let link = std::fs::symlink_metadata(path).map_err(|err| format!("{shown}: {err}"))?;
    let target = std::fs::metadata(path).map_err(|err| format!("{shown}: {err}"))?;
    // A symlink's own mode bits mean nothing; only its owner counts.
    if link.uid() != uid || target.uid() != uid {
        return Err(format!("not owned by you: {shown}"));
    }
    if target.mode() & 0o022 != 0 {
        return Err(format!("group- or world-writable: {shown}"));
    }
    Ok(())
}

fn settings_cf_bin() -> Option<PathBuf> {
    let text = std::fs::read_to_string(settings_path()?).ok()?;
    let settings: Value = serde_json::from_str(&text).ok()?;
    let bin = settings.get("cfBinPath")?.as_str()?;
    (!bin.is_empty()).then(|| PathBuf::from(bin))
}

fn find_in_path(path: &str) -> Option<PathBuf> {
    path.split(':')
        .map(Path::new)
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join("cf"))
        .find(|bin| is_executable(bin))
}

pub(crate) fn is_executable(path: &Path) -> bool {
    std::fs::metadata(path)
        .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
}

/// Runs the resolved `cf` with `args` (which must hold `--json`) and returns the envelope's `data`.
pub async fn run_cf(args: &[String], timeout: Duration) -> Result<Value, CfError> {
    let cf = resolve_cf().await?;
    run_cf_at(&cf.path, args, timeout).await
}

/// `<bin> version --json`: `Ok` only for a contract-1 `ok:true` envelope.
pub async fn probe_version(bin: &Path) -> Result<Value, CfError> {
    run_cf_at(bin, &json_args("version"), VERSION_TIMEOUT).await
}

/// Capability probe: `version --json` must speak contract 1 and `doctor --json` must exist.
pub async fn check_cli() -> CliStatus {
    let cf = match resolve_cf().await {
        Ok(cf) => cf,
        Err(err) => return CliStatus::failed(None, None, err),
    };
    let version = match probe_version(&cf.path).await {
        Ok(data) => data.get("cli").and_then(Value::as_str).map(str::to_string),
        Err(err) => return CliStatus::failed(Some(cf), None, err),
    };
    let doctor = match run_cf_at(&cf.path, &json_args("doctor"), DOCTOR_TIMEOUT).await {
        Ok(data) => Some(data),
        // A CliError still came from a CLI that knows `doctor`; a slow or broken doctor
        // run does not block a CLI whose version check passed.
        Err(CfError::CliError { .. } | CfError::Timeout { .. } | CfError::Io { .. }) => None,
        Err(err) => return CliStatus::failed(Some(cf), version, err),
    };
    CliStatus {
        state: GateState::Ok,
        cf: Some(cf),
        version,
        error: None,
        doctor,
    }
}

impl CliStatus {
    fn failed(cf: Option<ResolvedCf>, version: Option<String>, err: CfError) -> Self {
        let state = match err {
            CfError::CliNotFound { .. } => GateState::NotFound,
            CfError::CliTooOld { .. } => GateState::TooOld,
            CfError::NodeNotFound { .. } => GateState::NodeNotFound,
            CfError::Incompatible { .. } => GateState::Incompatible,
            _ => GateState::Error,
        };
        CliStatus {
            state,
            cf,
            version,
            error: Some(err),
            doctor: None,
        }
    }
}

fn json_args(command: &str) -> [String; 2] {
    [command.to_string(), "--json".to_string()]
}

/// `--json` before any `--` (after it every word is a value, as in the CLI's `isJsonArgv`).
fn has_json_flag(args: &[String]) -> bool {
    args.iter()
        .take_while(|arg| *arg != "--")
        .any(|arg| arg == "--json")
}

async fn run_cf_at(bin: &Path, args: &[String], timeout: Duration) -> Result<Value, CfError> {
    if !has_json_flag(args) {
        return Err(io_error("refusing to run cf without --json".to_string()));
    }
    let home = std::env::var_os("HOME").ok_or_else(|| io_error("HOME is not set".to_string()))?;
    let login = login_path().await;
    let mut child = Command::new(bin)
        .args(args)
        .current_dir(home)
        .env("PATH", &login.path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Own process group, so a timeout also kills what cf started.
        .process_group(0)
        .kill_on_drop(true)
        .spawn()
        .map_err(|err| match err.kind() {
            ErrorKind::NotFound | ErrorKind::PermissionDenied => CfError::CliNotFound {
                path: bin.display().to_string(),
            },
            _ => io_error(format!("cannot run {}: {err}", bin.display())),
        })?;
    let pgid = child.id().map(|pid| pid as libc::pid_t);
    let (Some(mut stdout), Some(mut stderr)) = (child.stdout.take(), child.stderr.take()) else {
        return Err(io_error("cf pipes are missing".to_string()));
    };

    let mut out = Vec::new();
    let mut err = Vec::new();
    // Read both pipes while waiting: a full stderr pipe would otherwise block cf.
    let outcome = tokio::time::timeout(timeout, async {
        tokio::try_join!(
            read_capped(&mut stdout, &mut out),
            read_tail(&mut stderr, &mut err),
            child.wait()
        )
    })
    .await;

    if !matches!(outcome, Ok(Ok(_))) {
        if let Some(pgid) = pgid.filter(|pgid| *pgid > 0) {
            // SAFETY: killpg only sends a signal; an already gone group just returns ESRCH.
            unsafe {
                libc::killpg(pgid, libc::SIGKILL);
            }
        }
        let _ = child.wait().await;
    }
    let stderr_tail = tail_text(&err);
    match outcome {
        Ok(Ok((_, _, status))) if node_missing(status, &out) => Err(CfError::NodeNotFound {
            stderr_tail,
            login_path_source: login.source.as_str(),
        }),
        Ok(Ok(_)) => parse_envelope(&out, stderr_tail),
        Ok(Err(err)) => Err(CfError::Io {
            message: err.to_string(),
            stderr_tail,
        }),
        Err(_) => Err(CfError::Timeout {
            secs: timeout.as_secs(),
            stderr_tail,
        }),
    }
}

/// `env` exits 127 when the shebang's `node` is not on PATH, before `cf` prints anything.
fn node_missing(status: ExitStatus, stdout: &[u8]) -> bool {
    status.code() == Some(127) && stdout.iter().all(u8::is_ascii_whitespace)
}

fn io_error(message: String) -> CfError {
    CfError::Io {
        message,
        stderr_tail: None,
    }
}

async fn read_capped(
    reader: &mut (impl AsyncRead + Unpin),
    buf: &mut Vec<u8>,
) -> std::io::Result<()> {
    let mut chunk = [0u8; 8192];
    loop {
        let n = reader.read(&mut chunk).await?;
        if n == 0 {
            return Ok(());
        }
        if buf.len() + n > STDOUT_CAP {
            return Err(std::io::Error::other("cf stdout exceeds 8 MiB"));
        }
        buf.extend_from_slice(&chunk[..n]);
    }
}

/// Reads to EOF, keeping only roughly the last `STDERR_TAIL` bytes.
async fn read_tail(
    reader: &mut (impl AsyncRead + Unpin),
    buf: &mut Vec<u8>,
) -> std::io::Result<()> {
    let mut chunk = [0u8; 8192];
    loop {
        let n = reader.read(&mut chunk).await?;
        if n == 0 {
            return Ok(());
        }
        buf.extend_from_slice(&chunk[..n]);
        if buf.len() > 2 * STDERR_TAIL {
            buf.drain(..buf.len() - STDERR_TAIL);
        }
    }
}

fn tail_text(buf: &[u8]) -> Option<String> {
    let start = buf.len().saturating_sub(STDERR_TAIL);
    let text = String::from_utf8_lossy(&buf[start..]).trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// Exactly one non-empty line holding `{contractVersion, ok, data, error}`.
fn parse_envelope(stdout: &[u8], stderr_tail: Option<String>) -> Result<Value, CfError> {
    let text = String::from_utf8_lossy(stdout);
    let mut lines = text.lines().filter(|line| !line.trim().is_empty());
    let (Some(line), None) = (lines.next(), lines.next()) else {
        return Err(CfError::CliTooOld { stderr_tail });
    };
    let Ok(Value::Object(mut envelope)) = serde_json::from_str::<Value>(line) else {
        return Err(CfError::CliTooOld { stderr_tail });
    };
    let Some(contract_version) = envelope.get("contractVersion").and_then(Value::as_i64) else {
        return Err(CfError::CliTooOld { stderr_tail });
    };
    if contract_version != CONTRACT_VERSION {
        return Err(CfError::Incompatible {
            contract_version,
            stderr_tail,
        });
    }
    match envelope.get("ok").and_then(Value::as_bool) {
        Some(true) => Ok(envelope.remove("data").unwrap_or(Value::Null)),
        Some(false) => {
            let field = |key: &str| {
                envelope
                    .get("error")
                    .and_then(|error| error.get(key))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string()
            };
            let (code, message) = (field("code"), field("message"));
            if code == "USAGE" && UNKNOWN_PREFIXES.iter().any(|p| message.starts_with(p)) {
                return Err(CfError::CliTooOld { stderr_tail });
            }
            Err(CfError::CliError {
                code,
                message,
                stderr_tail,
            })
        }
        None => Err(CfError::CliTooOld { stderr_tail }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn temp_dir() -> PathBuf {
        static N: AtomicUsize = AtomicUsize::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("cf-bridge-test-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A fake `cf`: a `#!/bin/sh` script, mode 755.
    fn fake_cf(dir: &Path, body: &str) -> PathBuf {
        let bin = dir.join("cf");
        std::fs::write(&bin, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        bin
    }

    fn run(bin: &Path, timeout: Duration) -> Result<Value, CfError> {
        let args = json_args("version");
        tauri::async_runtime::block_on(run_cf_at(bin, &args, timeout))
    }

    #[test]
    fn envelope_decides_the_result_not_the_exit_code() {
        let tail = Some("oops".to_string());
        let too_old = Err(CfError::CliTooOld {
            stderr_tail: tail.clone(),
        });
        let ok = r#"{"contractVersion":1,"ok":true,"data":{"cli":"1.43.0"},"error":null}"#;
        let source = tauri::async_runtime::block_on(login_path()).source.as_str();
        let cases = [
            (ok.to_string(), Ok(json!({"cli": "1.43.0"}))),
            (
                String::new(),
                Err(CfError::NodeNotFound {
                    stderr_tail: tail.clone(),
                    login_path_source: source,
                }),
            ),
            (
                r#"{"contractVersion":1,"ok":false,"data":null,"error":{"code":"NOT_FOUND","message":"no such task"}}"#.to_string(),
                Err(CfError::CliError {
                    code: "NOT_FOUND".to_string(),
                    message: "no such task".to_string(),
                    stderr_tail: tail.clone(),
                }),
            ),
            ("Usage: cf [options] [command]".to_string(), too_old.clone()),
            (
                r#"{"contractVersion":1,"ok":false,"data":null,"error":{"code":"USAGE","message":"error: unknown command 'doctor'"}}"#.to_string(),
                too_old.clone(),
            ),
            (
                r#"{"contractVersion":2,"ok":true,"data":{},"error":null}"#.to_string(),
                Err(CfError::Incompatible {
                    contract_version: 2,
                    stderr_tail: tail.clone(),
                }),
            ),
            (format!("{ok}\n{ok}"), too_old),
        ];
        for (stdout, expected) in cases {
            let dir = temp_dir();
            // Exit 1 even on ok:true: only the envelope counts. Exit 127 with no stdout is
            // `env` not finding `node`.
            let code = if stdout.is_empty() { 127 } else { 1 };
            let bin = fake_cf(
                &dir,
                &format!("cat <<'EOF'\n{stdout}\nEOF\necho oops >&2\nexit {code}"),
            );
            assert_eq!(
                run(&bin, Duration::from_secs(10)),
                expected,
                "stdout: {stdout}"
            );
            std::fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn trusted_tells_a_missing_path_from_a_refused_one() {
        let dir = temp_dir();
        let missing = dir.join("cf");
        assert_eq!(
            trusted(missing.clone(), CfSource::Settings, true),
            Err(CfError::CliNotFound {
                path: missing.display().to_string()
            })
        );
        let rm = dir.join("rm");
        std::fs::write(&rm, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&rm, std::fs::Permissions::from_mode(0o755)).unwrap();
        for (path, reason) in [
            (rm, "not named cf"),
            (PathBuf::from("no-such-dir/cf"), "not an absolute path"),
        ] {
            let result = trusted(path, CfSource::Settings, true);
            assert!(
                matches!(&result, Err(CfError::Refused { message }) if message.contains(reason)),
                "{result:?}"
            );
        }
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn timeout_kills_the_whole_process_group() {
        let dir = temp_dir();
        let pid_file = dir.join("child.pid");
        let body = format!("sleep 300 &\necho $! > '{}'\nsleep 30", pid_file.display());
        let bin = fake_cf(&dir, &body);

        let result = run(&bin, Duration::from_secs(1));
        assert!(
            matches!(result, Err(CfError::Timeout { secs: 1, .. })),
            "{result:?}"
        );

        let pid: libc::pid_t = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        // The killed child stays a zombie until launchd reaps it; poll for it to vanish.
        let gone = (0..40).any(|_| {
            // SAFETY: signal 0 only checks that the pid exists.
            let alive = unsafe { libc::kill(pid, 0) } == 0;
            if alive {
                std::thread::sleep(Duration::from_millis(50));
            }
            !alive
        });
        assert!(gone, "child {pid} of the fake cf survived the timeout");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
