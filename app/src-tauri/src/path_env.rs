//! PATH of the user's login shell.
//!
//! Launched from Finder, the app inherits launchd's bare PATH, without the nvm or
//! Homebrew dirs, so `cf` (a node shebang script) fails. Ask the login shell for its
//! PATH once per launch, with a fallback when that probe fails.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncReadExt;
use tokio::process::{ChildStdout, Command};
use tokio::sync::OnceCell;

const MARKER: &str = "__CF_PATH__";
const PROBE_SCRIPT: &str = r#"printf "__CF_PATH__%s__CF_PATH__" "$PATH""#;
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_SHELL: &str = "/bin/zsh";
const FALLBACK_DIRS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

static LOGIN_PATH: OnceCell<LoginPath> = OnceCell::const_new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathSource {
    LoginShell,
    Fallback,
}

impl PathSource {
    pub fn as_str(self) -> &'static str {
        match self {
            PathSource::LoginShell => "login-shell",
            PathSource::Fallback => "fallback",
        }
    }
}

#[derive(Debug)]
pub struct LoginPath {
    pub path: String,
    pub source: PathSource,
}

/// The PATH to spawn `cf` with. The first call runs the probe (up to 5 s); calls made
/// while it runs wait for that same probe, and later calls return the cached value.
pub async fn login_path() -> &'static LoginPath {
    LOGIN_PATH.get_or_init(resolve).await
}

async fn resolve() -> LoginPath {
    match probe().await {
        Some(path) => LoginPath {
            path,
            source: PathSource::LoginShell,
        },
        None => LoginPath {
            path: fallback_path(std::env::var("PATH").ok().as_deref()),
            source: PathSource::Fallback,
        },
    }
}

/// `$SHELL` when it is an absolute path that exists, else `/bin/zsh`.
fn shell_binary() -> PathBuf {
    std::env::var_os("SHELL")
        .map(PathBuf::from)
        .filter(|shell| shell.is_absolute() && shell.exists())
        .unwrap_or_else(|| Path::new(DEFAULT_SHELL).to_path_buf())
}

async fn probe() -> Option<String> {
    let mut child = Command::new(shell_binary())
        .args(["-ilc", PROBE_SCRIPT])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        // Own process group, so the kill below also reaches what rc files started (e.g. nvm).
        .process_group(0)
        .kill_on_drop(true)
        .spawn()
        .ok()?;
    let pgid = child.id()? as libc::pid_t;
    let mut stdout = child.stdout.take()?;

    let found = tokio::time::timeout(PROBE_TIMEOUT, read_until_path(&mut stdout))
        .await
        .ok()
        .flatten();

    // Always kill the group: a child left by an rc file may still hold the pipe open.
    // SAFETY: killpg only sends a signal; an already gone group just returns ESRCH.
    unsafe {
        libc::killpg(pgid, libc::SIGKILL);
    }
    let _ = child.wait().await;
    found
}

/// Reads stdout until it holds a complete marker pair, or until EOF.
async fn read_until_path(stdout: &mut ChildStdout) -> Option<String> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        let n = stdout.read(&mut chunk).await.ok()?;
        buf.extend_from_slice(&chunk[..n]);
        let found = extract_path(&String::from_utf8_lossy(&buf));
        if found.is_some() || n == 0 {
            return found;
        }
    }
}

/// The text between the first two markers; rc files may print noise around them.
fn extract_path(stdout: &str) -> Option<String> {
    let (_, rest) = stdout.split_once(MARKER)?;
    let (path, _) = rest.split_once(MARKER)?;
    (!path.is_empty()).then(|| path.to_string())
}

/// Inherited PATH plus the Homebrew dirs, deduped, first occurrence kept.
fn fallback_path(inherited: Option<&str>) -> String {
    let mut dirs: Vec<&str> = Vec::new();
    for dir in inherited.unwrap_or("").split(':').chain(FALLBACK_DIRS) {
        if !dir.is_empty() && !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    dirs.join(":")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_path_ignores_rc_noise_around_the_markers() {
        let stdout = "nvm says hi\n__CF_PATH__/a/bin:/b/bin__CF_PATH__bye\n";
        assert_eq!(extract_path(stdout).as_deref(), Some("/a/bin:/b/bin"));
        assert_eq!(extract_path("__CF_PATH__/a/bin"), None);
        assert_eq!(extract_path("__CF_PATH____CF_PATH__"), None);
    }

    /// Runs the real probe on this machine: `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn probe_finds_login_shell_path() {
        let login = tauri::async_runtime::block_on(login_path());
        println!(
            "source={} contains_nvm={}",
            login.source.as_str(),
            login.path.contains(".nvm")
        );
        assert_eq!(login.source, PathSource::LoginShell);
    }
}
