#!/usr/bin/env bash
# run-with-timeout.sh — run one external-reviewer CLI under a real, enforced
# deadline. Shared by run-agent-review.sh and run-codex-review.sh.
#
# Usage:
#   bash run-with-timeout.sh <seconds> <command> [args...]
#   bash run-with-timeout.sh --check <seconds>
#   bash run-with-timeout.sh --config-timeout <config-file> <default-seconds> [key]
#
# Deadline semantics (identical on both mechanisms):
#   - the clock starts when the command is launched;
#   - at the deadline the run's OWN process group gets TERM, then KILL after a
#     2s grace, so a child that ignores TERM and any grandchild it spawned die
#     too. Nothing is ever killed by executable name, and the group killed is
#     always the one created for this run — never the calling shell's.
#
# Mechanisms (`CF_TIMEOUT_IMPL`: auto | gnu | fallback; default auto):
#   gnu       `timeout`/`gtimeout` WITH `--kill-after` support. A `timeout`
#             that rejects `-k` (old busybox) cannot guarantee the kill, so it
#             is refused rather than trusted. It runs supervised, not exec-ed:
#             it escapes this run's process group, so the cancel has to be
#             forwarded to it and its own signal death translated back.
#   fallback  perl — already this runner's fallback dependency. The child calls
#             setpgid(0,0) before exec, so the group is created by construction.
#
# Exit codes:
#   124  deadline exceeded (same as timeout(1))
#   125  nothing was launched: bad arguments, or no enforceable mechanism
#   126  command found but not executable · 127 command not found
#   128+N  the command died from signal N (2 = INT, 15 = TERM, 9 = KILL)
#   otherwise the command's own exit code
#
# POSIX process semantics only (macOS/Linux). Windows is NOT supported and no
# claim is made about process groups there.

set -u

CF_TIMEOUT_GRACE=2

cf_timeout_err() {
  echo "CF_TIMEOUT=error $1" >&2
}

# A deadline is only enforceable if it is a positive whole number of seconds.
cf_timeout_valid_secs() {
  case "${1:-}" in
    "" | *[!0-9]*) return 1 ;;
  esac
  [ "$1" -gt 0 ] 2>/dev/null
}

# Print the path of a timeout(1) that actually supports --kill-after, or fail.
# The probe is a real invocation of a command that exits immediately, so a
# timeout(1) with different flag syntax is detected instead of assumed.
cf_timeout_find_gnu() {
  local candidate to
  for candidate in timeout gtimeout; do
    to="$(command -v "$candidate" 2>/dev/null || true)"
    [ -n "$to" ] || continue
    "$to" -k 1 1 sh -c 'exit 0' >/dev/null 2>&1 || continue
    printf '%s' "$to"
    return 0
  done
  return 1
}

# Print "<kind> <tool-path>" for the mechanism to use, or fail with a reason.
cf_timeout_resolve() {
  local impl="${CF_TIMEOUT_IMPL:-auto}" to perl_bin
  case "$impl" in
    auto | gnu | fallback) ;;
    *)
      cf_timeout_err "unknown CF_TIMEOUT_IMPL: $impl (expected auto|gnu|fallback)"
      return 1
      ;;
  esac

  if [ "$impl" = auto ] || [ "$impl" = gnu ]; then
    if to="$(cf_timeout_find_gnu)"; then
      printf 'gnu %s' "$to"
      return 0
    fi
    if [ "$impl" = gnu ]; then
      cf_timeout_err "CF_TIMEOUT_IMPL=gnu but no timeout(1) supporting --kill-after was found"
      return 1
    fi
  fi

  perl_bin="$(command -v perl 2>/dev/null || true)"
  if [ -n "$perl_bin" ]; then
    printf 'fallback %s' "$perl_bin"
    return 0
  fi

  cf_timeout_err "no timeout(1) with --kill-after and no perl for the fallback — refusing to launch an unbounded process"
  return 1
}

# --- Mode: resolve the configured timeout ---------------------------------
# Kept here so every caller resolves AND validates the value the same way: the
# `review.<key>` field from the project config, field-merged over the user's
# global `~/.coding-friend/config.json` (local wins per field, siblings
# survive) — the same local-over-global rule the CLI applies. node does the
# parsing: it is already this repo's hook runtime, and a regex over JSON would
# misread nesting and string escapes.
#
# `key` defaults to `agentTimeout` (the external-runner deadline). cf-review's
# Step 6 passes `nativeTimeout` for the in-session reviewer budget, so both
# numbers come from one reader instead of two divergent ones.
if [ "${1:-}" = "--config-timeout" ]; then
  config_file="${2:-}"
  default_secs="${3:-300}"
  config_key="${4:-agentTimeout}"

  # The runner may be launched from anywhere inside the repo, so a relative
  # config path is anchored to the repo root, not to the current directory.
  repo_root="${MAIN_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
  [ -n "$repo_root" ] || repo_root="$PWD"
  [ -n "$config_file" ] || config_file=".coding-friend/config.json"
  case "$config_file" in
    /*) ;;
    *) config_file="$repo_root/$config_file" ;;
  esac
  global_file=""
  [ -n "${HOME:-}" ] && global_file="$HOME/.coding-friend/config.json"

  # Single-quoted so bash 3.2 (macOS /bin/bash) parses it verbatim: the script
  # below therefore uses double quotes only, and no apostrophes.
  read_js='const fs = require("fs");
const [, localFile, globalFile, key] = process.argv;
const warn = (msg) => process.stderr.write("CF_TIMEOUT=warn " + msg + "\n");

// A config that cannot be read is a warning, never a reason to run unbounded:
// the caller falls back to its finite default.
function review(file) {
  if (!file) return {};
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") warn("cannot read " + file + " (" + err.code + ")");
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    warn("ignoring malformed JSON in " + file);
    return {};
  }
  const block = parsed && parsed.review;
  const usable = block && typeof block === "object" && !Array.isArray(block);
  if (block && !usable) warn("ignoring non-object review block in " + file);
  return usable ? block : {};
}

// Field-level local-over-global, the same shape loadConfig() produces in the
// CLI: a local file that sets one review field keeps every global sibling.
const merged = Object.assign({}, review(globalFile), review(localFile));
// Key presence, not a truthy or ?? test: a present-but-unusable value (0, null,
// "abc") has to reach the shell to be reported, not silently defaulted.
if (key in merged) process.stdout.write(JSON.stringify(merged[key]));
'

  node_bin="$(command -v node 2>/dev/null || true)"
  raw=""
  if [ -z "$node_bin" ]; then
    # Without a JSON parser a configured value cannot be read at all — say so
    # and keep the finite default rather than guess with a regex.
    echo "CF_TIMEOUT=warn node not found — using the default ${default_secs}s deadline" >&2
  elif ! raw=$("$node_bin" -e "$read_js" -- "$config_file" "$global_file" "$config_key"); then
    echo "CF_TIMEOUT=warn could not read the config — using the default ${default_secs}s deadline" >&2
    raw=""
  fi

  if [ -z "$raw" ]; then
    printf '%s\n' "$default_secs"
    exit 0
  fi
  raw=${raw%\"}
  raw=${raw#\"}
  if cf_timeout_valid_secs "$raw"; then
    printf '%s\n' "$raw"
    exit 0
  fi
  # Present but unusable: defaulting silently would hide a misconfiguration
  # behind a deadline the user never asked for.
  cf_timeout_err "invalid review.$config_key: $raw (expected a positive integer number of seconds)"
  exit 2
fi

# --- Mode: preflight ------------------------------------------------------
# Callers run this BEFORE redirecting stderr, so the reason reaches the caller
# instead of a log file, and BEFORE launching anything.
if [ "${1:-}" = "--check" ]; then
  if ! cf_timeout_valid_secs "${2:-}"; then
    cf_timeout_err "invalid timeout seconds: '${2:-}'"
    exit 125
  fi
  cf_timeout_resolve >/dev/null || exit 125
  exit 0
fi

# --- Mode: run ------------------------------------------------------------
SECS="${1:-}"
if ! cf_timeout_valid_secs "$SECS"; then
  cf_timeout_err "invalid timeout seconds: '$SECS'"
  exit 125
fi
shift
if [ $# -eq 0 ]; then
  cf_timeout_err "missing command"
  exit 125
fi

MECHANISM="$(cf_timeout_resolve)" || exit 125
KIND="${MECHANISM%% *}"
TOOL="${MECHANISM#* }"

if [ "$KIND" = gnu ]; then
  # timeout(1) without --foreground puts ITSELF and the command in a process
  # group of its own and signals that group; -k guarantees the KILL after the
  # grace period. That group is out of reach of this run's group, so this shell
  # must stay alive instead of exec-ing: nothing else is left to forward a
  # cancel, and timeout(1) leaks two codes of its own — it re-raises the
  # command's signal on itself, and it dies with the group it KILLs once the
  # grace period expires. `<&0` is load-bearing: bash gives a background job
  # /dev/null for stdin unless stdin is redirected explicitly.
  "$TOOL" -k "$CF_TIMEOUT_GRACE" "$SECS" "$@" <&0 &
  gnu_pid=$!
  # Cancelling timeout(1) is enough: it re-signals its own group, so the
  # command and any grandchild go with it.
  trap 'kill -TERM "$gnu_pid" 2>/dev/null' TERM INT HUP
  wait "$gnu_pid"
  status=$?
  # A trapped signal returns wait() early, before the child is reaped.
  while kill -0 "$gnu_pid" 2>/dev/null; do
    wait "$gnu_pid"
    status=$?
  done
  # Past the deadline a 137 is timeout(1) dying with the group it KILLed, i.e.
  # the deadline; before it, the command's own death by KILL.
  if [ "$status" -eq 137 ] && [ "$SECONDS" -ge "$SECS" ]; then
    status=124
  fi
  exit "$status"
fi

# perl fallback: fork, put the child in its own process group, poll for exit
# and enforce the deadline ourselves. No alarm(): a signal arriving inside a
# blocking waitpid() is the classic way to lose the child's exit status.
CF_TIMEOUT_PERL=$(
  cat <<'CF_PERL'
use strict;
use warnings;
use POSIX qw(:sys_wait_h);
use Time::HiRes qw(time sleep);

my $secs  = shift @ARGV;
my $grace = shift @ARGV;
exit 125 unless @ARGV;

$| = 1;
my $pid = fork();
if (!defined $pid) { print STDERR "CF_TIMEOUT=error fork failed\n"; exit 125 }

if ($pid == 0) {
    # Own process group BEFORE exec: every kill below then targets exactly the
    # processes started by this run, and can never reach the parent's group.
    POSIX::setpgid(0, 0);
    no warnings 'exec';    # the lines below are the exec-failed path
    exec { $ARGV[0] } @ARGV;
    my $code = ($! == 2) ? 127 : 126;    # ENOENT -> not found
    POSIX::_exit($code);
}
# Same call in the parent closes the fork/exec race deterministically.
eval { POSIX::setpgid($pid, $pid) };

my $timed_out = 0;
my $forwarded = 0;
my $kill_at   = 0;

sub group_kill {
    my ($sig) = @_;
    return if $pid <= 1;
    kill($sig, -$pid) or kill($sig, $pid);
}

# A cancelled runner must cancel the run, not orphan it.
for my $name (qw(TERM INT HUP)) {
    $SIG{$name} = sub {
        return if $forwarded;
        my $s = shift;
        $forwarded = $s eq 'INT' ? 2 : $s eq 'HUP' ? 1 : 15;
        group_kill('TERM');
        $kill_at = time() + $grace;
    };
}

my $deadline = time() + $secs;
my $status   = 0;
while (1) {
    my $reaped = waitpid($pid, WNOHANG);
    if ($reaped == $pid) { $status = $?; last }
    last if $reaped == -1;
    sleep(0.05);
    my $now = time();
    if (!$timed_out && !$forwarded && $now >= $deadline) {
        $timed_out = 1;
        group_kill('TERM');
        $kill_at = $now + $grace;
    }
    if ($kill_at && $now >= $kill_at) {
        group_kill('KILL');
        $kill_at = 0;
    }
}
# Whatever is left of the group (grandchildren) goes with it.
group_kill('KILL') if $timed_out || $forwarded;

exit 124 if $timed_out;
exit 128 + $forwarded if $forwarded;
exit(($status & 127) ? 128 + ($status & 127) : ($status >> 8));
CF_PERL
)

exec "$TOOL" -e "$CF_TIMEOUT_PERL" -- "$SECS" "$CF_TIMEOUT_GRACE" "$@"
