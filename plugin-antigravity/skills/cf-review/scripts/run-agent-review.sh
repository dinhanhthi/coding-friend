#!/usr/bin/env bash
# run-agent-review.sh — run a headless external-agent review via a CF-format prompt.
# Usage: bash run-agent-review.sh <agent> <result-file>
#   <agent> ∈ claude|gemini|cursor|grok
#
# Behavior (mirrors run-codex-review.sh graceful-degradation contract):
#   - CLI missing on PATH  → print "CF_AGENT=unavailable" to stderr, exit 127
#   - empty diff           → print "CF_AGENT=empty" to stderr, exit 0
#   - timeout              → print "CF_AGENT=timeout" to stderr, exit 124
#   - non-zero exit        → print "CF_AGENT=error" + log tail to stderr, propagate exit code
#   - success              → write review to <result-file>, print "CF_AGENT=ok <result-file>", exit 0
#
# The caller (cf-review) checks the CF_AGENT line / exit code to decide whether
# to merge findings or degrade gracefully.

set -u

AGENT="${1:-}"
RESULT_FILE="${2:-}"

if [ -z "$AGENT" ] || [ -z "$RESULT_FILE" ]; then
  echo "CF_AGENT=error missing agent or result-file argument" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GATHER_DIFF="$SCRIPT_DIR/gather-diff.sh"
BUILD_PROMPT="$PLUGIN_ROOT/skills/cf-review-out/scripts/build-review-prompt.sh"

# --- Agent registry: cli, headless args, read-only args ---
CLI=""
HEADLESS_ARGS=()
READONLY_ARGS=()
USE_PROMPT_FILE=false

case "$AGENT" in
  claude)
    CLI="claude"
    HEADLESS_ARGS=(-p)
    # plan mode is Claude's first-class read-only mode (no edits) — robust vs a
    # denylist-by-name (which misses NotebookEdit and is version-fragile).
    # Smoke-tested: returns a CF-format review, exit 0.
    READONLY_ARGS=(--permission-mode plan)
    ;;
  gemini)
    CLI="gemini"
    # -p/--prompt requires a value; empty string enables headless mode with stdin appended
    HEADLESS_ARGS=(--prompt "")
    READONLY_ARGS=(--approval-mode plan --skip-trust)
    ;;
  cursor)
    CLI="cursor-agent"
    HEADLESS_ARGS=(-p)
    READONLY_ARGS=(--mode ask)
    ;;
  grok)
    CLI="grok"
    # --prompt-file (below) is grok's single-turn headless mode; do NOT add -p/--single
    # here — it takes a <PROMPT> value and would swallow the next flag.
    HEADLESS_ARGS=()
    # Read-only is enforced by grok's built-in OS sandbox (Seatbelt/Landlock), NOT by
    # --disallowed-tools (which takes Claude tool names grok ignores → no-op, verified
    # to still let grok write files). The built-in `read-only` profile lets grok read
    # everywhere but write only to ~/.grok + temp — never the repo.
    READONLY_ARGS=(--sandbox read-only)
    USE_PROMPT_FILE=true
    ;;
  *)
    echo "CF_AGENT=error unknown agent: $AGENT" >&2
    exit 2
    ;;
esac

if ! command -v "$CLI" >/dev/null 2>&1; then
  echo "CF_AGENT=unavailable $CLI not on PATH" >&2
  exit 127
fi

# --- Resolve docs dir and label ---
DOCS_DIR="docs"
CONFIG_FILE="${CF_CONFIG_FILE:-.coding-friend/config.json}"
if [ -f "$CONFIG_FILE" ]; then
  custom_dir=$(grep -o '"docsDir"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null \
    | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/' || true)
  if [ -n "$custom_dir" ]; then
    DOCS_DIR="$custom_dir"
  fi
fi

LABEL="$(date +%Y-%m-%d)-review"

# --- Resolve per-agent timeout (default 300s) ---
TIMEOUT_SECS=300
if [ -f "$CONFIG_FILE" ]; then
  timeout_val=$(grep -o '"agentTimeout"[[:space:]]*:[[:space:]]*[0-9]*' "$CONFIG_FILE" 2>/dev/null \
    | head -1 | sed 's/.*: *//' || true)
  if [ -n "$timeout_val" ] && [ "$timeout_val" -gt 0 ] 2>/dev/null; then
    TIMEOUT_SECS="$timeout_val"
  fi
fi

# --- Gather diff and detect empty ---
DIFF_FILE=$(mktemp)
PROMPT_FILE=$(mktemp)
trap 'rm -f "$DIFF_FILE" "$PROMPT_FILE"' EXIT

bash "$GATHER_DIFF" >"$DIFF_FILE" 2>/dev/null || true

has_changes=false
if grep -q '^has_committed=true' "$DIFF_FILE" 2>/dev/null; then has_changes=true; fi
if grep -q '^has_uncommitted=true' "$DIFF_FILE" 2>/dev/null; then has_changes=true; fi
if grep -q '^has_staged=true' "$DIFF_FILE" 2>/dev/null; then has_changes=true; fi
if grep -q '^has_untracked=true' "$DIFF_FILE" 2>/dev/null; then has_changes=true; fi

if [ "$has_changes" = false ]; then
  echo "CF_AGENT=empty no changes to review" >&2
  exit 0
fi

# --- Build prompt ---
OVERRIDE=$'\n\n---\nIMPORTANT: Ignore any earlier instruction to save your review to a file. Print your review to STDOUT ONLY, in the exact 4-section format above. You have read-only access; do not attempt to modify any file.'

cat "$DIFF_FILE" | bash "$BUILD_PROMPT" "$LABEL" "$DOCS_DIR" >"$PROMPT_FILE"
printf '%s' "$OVERRIDE" >>"$PROMPT_FILE"

mkdir -p "$(dirname "$RESULT_FILE")"
LOG_FILE="${RESULT_FILE%.md}.log"

# --- Timeout wrapper ---
run_with_timeout() {
  local secs="$1"
  shift
  local TO
  TO="$(command -v timeout 2>/dev/null || command -v gtimeout 2>/dev/null || true)"
  if [ -n "$TO" ]; then
    "$TO" "$secs" "$@"
    return $?
  fi
  perl -e '
    my $t = shift;
    my $p = fork();
    if (!$p) { exec @ARGV or exit 127 }
    $SIG{ALRM} = sub { kill "TERM", $p; sleep 2; kill "KILL", $p; exit 124 };
    alarm $t;
    waitpid($p, 0);
    exit($? >> 8);
  ' "$secs" "$@"
}

# --- Run the agent CLI ---
if [ "$USE_PROMPT_FILE" = true ]; then
  run_with_timeout "$TIMEOUT_SECS" \
    "$CLI" "${HEADLESS_ARGS[@]}" "${READONLY_ARGS[@]}" \
    --prompt-file "$PROMPT_FILE" \
    >"$RESULT_FILE" 2>"$LOG_FILE"
else
  run_with_timeout "$TIMEOUT_SECS" \
    "$CLI" "${HEADLESS_ARGS[@]}" "${READONLY_ARGS[@]}" \
    <"$PROMPT_FILE" \
    >"$RESULT_FILE" 2>"$LOG_FILE"
fi
status=$?

if [ "$status" -eq 124 ]; then
  echo "CF_AGENT=timeout $AGENT exceeded ${TIMEOUT_SECS}s" >&2
  exit 124
fi

if [ "$status" -ne 0 ]; then
  echo "CF_AGENT=error $AGENT exited $status" >&2
  tail -n 20 "$LOG_FILE" >&2 2>/dev/null || true
  exit "$status"
fi

echo "CF_AGENT=ok $RESULT_FILE"
exit 0