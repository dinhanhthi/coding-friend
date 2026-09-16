#!/usr/bin/env bash
# run-agent-review.sh — run a headless external-agent review via a CF-format prompt.
# Usage: bash run-agent-review.sh <agent> <result-file> [prompt-file] [--snapshot-dir <dir>]
#   <agent> ∈ claude|gemini|cursor|grok|codex
#   [prompt-file]     optional pre-built prompt for /cf-plan-review; skips gather-diff + empty check
#   --snapshot-dir D  reuse the scope cf-review already captured (D/diff.txt)
#                     instead of gathering it a second time; mutually exclusive
#                     with [prompt-file]. Without either, the legacy auto-scope
#                     (a fresh gather-diff.sh run) is used.
#
# Behavior (mirrors run-codex-review.sh graceful-degradation contract):
#   - CLI missing on PATH  → print "CF_AGENT=unavailable" to stderr, exit 127
#   - empty diff           → print "CF_AGENT=empty" to stderr, exit 0
#   - empty review output  → print "CF_AGENT=empty" to stderr, exit 0 (exit 0 with
#                            nothing written is never reported as a review)
#   - timeout              → print "CF_AGENT=timeout" to stderr, exit 124
#   - non-zero exit        → print "CF_AGENT=error" + log tail to stderr, propagate exit code
#   - success              → write review to <result-file>, print "CF_AGENT=ok <result-file>", exit 0
#
# An incomplete scope (gather-diff exit 3 / `scope_complete=false`) does not fail
# the run: it adds "CF_AGENT_SCOPE=incomplete …" on stderr and a note in the
# prompt, so `ok` can never be read as full coverage. The same applies when the
# exporter caps the embedded diff (`diff_truncated: true`) — the agent then saw
# only a subset. A structural scope failure (gather-diff exit 2) fails the run —
# a review of a broken scope is not a review.
#
# The deadline (`review.agentTimeout`, default 300s) is enforced by
# run-with-timeout.sh on the CLI subprocess and its whole process group, not by
# asking the agent to hurry. If no enforceable timeout exists, nothing is
# launched. The result file is truncated before launch, so a previous run's
# content can never be reported as this run's result.
#
# The caller (cf-review) checks the CF_AGENT line / exit code to decide whether
# to merge findings or degrade gracefully.

set -u

AGENT=""
RESULT_FILE=""
PROMPT_SRC=""
SNAPSHOT_DIR=""
positional=0

need_value() {
  case "${2-}" in
    "" | -*)
      echo "CF_AGENT=error $1 requires a value" >&2
      exit 2
      ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    --snapshot-dir)
      need_value --snapshot-dir "${2-}"
      SNAPSHOT_DIR="$2"
      shift 2
      ;;
    -*)
      echo "CF_AGENT=error unknown flag: $1" >&2
      exit 2
      ;;
    *)
      case "$positional" in
        0) AGENT="$1" ;;
        1) RESULT_FILE="$1" ;;
        2) PROMPT_SRC="$1" ;;
        *)
          echo "CF_AGENT=error unexpected argument: $1" >&2
          exit 2
          ;;
      esac
      positional=$((positional + 1))
      shift
      ;;
  esac
done

if [ -z "$AGENT" ] || [ -z "$RESULT_FILE" ]; then
  echo "CF_AGENT=error missing agent or result-file argument" >&2
  exit 2
fi

if [ -n "$PROMPT_SRC" ] && [ -n "$SNAPSHOT_DIR" ]; then
  echo "CF_AGENT=error prompt-file and --snapshot-dir are mutually exclusive" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GATHER_DIFF="$SCRIPT_DIR/gather-diff.sh"
RUN_WITH_TIMEOUT="$SCRIPT_DIR/run-with-timeout.sh"
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
  codex)
    CLI="codex"
    HEADLESS_ARGS=(exec)
    READONLY_ARGS=(--sandbox read-only --skip-git-repo-check)
    USE_PROMPT_FILE=false
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
  custom_dir=$(grep -o '"docsDir"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null |
    head -1 | sed 's/.*: *"\([^"]*\)".*/\1/' || true)
  if [ -n "$custom_dir" ]; then
    DOCS_DIR="$custom_dir"
  fi
fi

LABEL="$(date +%Y-%m-%d)-review"

# --- Resolve per-agent timeout (default 300s) ---
# A configured-but-unusable value is an error, not a silent 5-minute default.
TIMEOUT_SECS=$(bash "$RUN_WITH_TIMEOUT" --config-timeout "$CONFIG_FILE" 300) || {
  echo "CF_AGENT=error unusable review.agentTimeout — not launching $CLI" >&2
  exit 2
}

# --- Build prompt ---
OVERRIDE=$'\n\n---\nIMPORTANT: Ignore any earlier instruction to save your review to a file. Print your review to STDOUT ONLY, in the exact 4-section format above. You have read-only access; do not attempt to modify any file.'
SCOPE_NOTE=$'\n\n---\nSCOPE INCOMPLETE: part of the change set could not be read (see the excluded entries in the diff). Review what is present and say explicitly, in your Summary, that coverage is partial and which paths were not covered.'
TRUNCATED_NOTE=$'\n\n---\nSCOPE INCOMPLETE: the diff above was truncated at the exporter cap, so it is only the first part of the change set. Review what is present and say explicitly, in your Summary, that the diff was truncated and coverage is partial.'

PROMPT_FILE=$(mktemp)
DIFF_FILE=""
GATHER_ERR=""
trap 'rm -f "$DIFF_FILE" "$GATHER_ERR" "$PROMPT_FILE"' EXIT

SCOPE_INCOMPLETE=false
SCOPE_TRUNCATED=false

if [ -n "$PROMPT_SRC" ]; then
  if [ ! -f "$PROMPT_SRC" ]; then
    echo "CF_AGENT=error prompt file not found" >&2
    exit 2
  fi
  cat "$PROMPT_SRC" >"$PROMPT_FILE"
else
  # --- Resolve the scope: reuse cf-review's snapshot, or gather it ---
  if [ -n "$SNAPSHOT_DIR" ]; then
    DIFF_SRC="$SNAPSHOT_DIR/diff.txt"
    if [ ! -f "$DIFF_SRC" ] || ! grep -q '^=== METADATA ===' "$DIFF_SRC" 2>/dev/null; then
      # Re-gathering here would review a different scope than the one the
      # in-session reviewers read.
      echo "CF_AGENT=error snapshot scope unusable: $DIFF_SRC" >&2
      exit 2
    fi
  else
    DIFF_FILE=$(mktemp)
    GATHER_ERR=$(mktemp)
    DIFF_SRC="$DIFF_FILE"
    bash "$GATHER_DIFF" >"$DIFF_FILE" 2>"$GATHER_ERR"
    gather_status=$?
    if [ "$gather_status" -eq 2 ]; then
      # Structural failure: no metadata block at all. Continuing would review
      # an empty or broken scope and report it clean.
      echo "CF_AGENT=error scope collection failed (gather-diff exit 2)" >&2
      tail -n 5 "$GATHER_ERR" >&2 2>/dev/null || true
      exit 2
    fi
    if [ "$gather_status" -eq 3 ]; then
      SCOPE_INCOMPLETE=true
    fi
  fi

  # One check for both paths: the metadata block travels inside the diff.
  if grep -q '^scope_complete=false' "$DIFF_SRC" 2>/dev/null; then
    SCOPE_INCOMPLETE=true
  fi

  has_changes=false
  if grep -q '^has_committed=true' "$DIFF_SRC" 2>/dev/null; then has_changes=true; fi
  if grep -q '^has_uncommitted=true' "$DIFF_SRC" 2>/dev/null; then has_changes=true; fi
  if grep -q '^has_staged=true' "$DIFF_SRC" 2>/dev/null; then has_changes=true; fi
  if grep -q '^has_untracked=true' "$DIFF_SRC" 2>/dev/null; then has_changes=true; fi

  if [ "$has_changes" = false ]; then
    echo "CF_AGENT=empty no changes to review" >&2
    exit 0
  fi

  bash "$BUILD_PROMPT" "$LABEL" "$DOCS_DIR" <"$DIFF_SRC" >"$PROMPT_FILE"

  # The exporter caps the embedded diff (MAX_DIFF_LINES). Past the cap the agent
  # reviews a subset of the scope the in-session reviewers read, so `ok` must
  # not be readable as full coverage.
  if grep -q '^diff_truncated: true$' "$PROMPT_FILE" 2>/dev/null; then
    SCOPE_TRUNCATED=true
  fi
fi

if [ "$SCOPE_INCOMPLETE" = true ]; then
  # Announced before the run so it survives a timeout or a failure too.
  echo "CF_AGENT_SCOPE=incomplete part of the scope could not be read — treat the result as partial coverage" >&2
  printf '%s' "$SCOPE_NOTE" >>"$PROMPT_FILE"
fi
if [ "$SCOPE_TRUNCATED" = true ]; then
  echo "CF_AGENT_SCOPE=incomplete the diff was truncated at the exporter cap — this agent saw a subset, treat the result as partial coverage" >&2
  printf '%s' "$TRUNCATED_NOTE" >>"$PROMPT_FILE"
fi
printf '%s' "$OVERRIDE" >>"$PROMPT_FILE"

mkdir -p "$(dirname "$RESULT_FILE")" 2>/dev/null || true
LOG_FILE="${RESULT_FILE%.md}.log"

# Truncate BEFORE launch: a previous run's review must never be picked up as
# this one's, and an empty file after exit 0 must stay empty.
if ! : >"$RESULT_FILE" 2>/dev/null; then
  echo "CF_AGENT=error cannot write result file: $RESULT_FILE" >&2
  exit 2
fi
: >"$LOG_FILE" 2>/dev/null || true

# Preflight with stderr unredirected: if no deadline can be enforced, nothing
# is launched.
if ! bash "$RUN_WITH_TIMEOUT" --check "$TIMEOUT_SECS"; then
  echo "CF_AGENT=error no enforceable timeout available — not launching $CLI" >&2
  exit 2
fi

# --- Run the agent CLI under the enforced deadline ---
if [ "$USE_PROMPT_FILE" = true ]; then
  bash "$RUN_WITH_TIMEOUT" "$TIMEOUT_SECS" \
    "$CLI" ${HEADLESS_ARGS[@]+"${HEADLESS_ARGS[@]}"} ${READONLY_ARGS[@]+"${READONLY_ARGS[@]}"} \
    --prompt-file "$PROMPT_FILE" \
    >"$RESULT_FILE" 2>"$LOG_FILE"
else
  bash "$RUN_WITH_TIMEOUT" "$TIMEOUT_SECS" \
    "$CLI" ${HEADLESS_ARGS[@]+"${HEADLESS_ARGS[@]}"} ${READONLY_ARGS[@]+"${READONLY_ARGS[@]}"} \
    <"$PROMPT_FILE" \
    >"$RESULT_FILE" 2>"$LOG_FILE"
fi
status=$?

if [ "$status" -eq 124 ]; then
  echo "CF_AGENT=timeout $AGENT exceeded ${TIMEOUT_SECS}s" >&2
  # Kept for diagnosis only — a killed run is never a review.
  if [ -s "$RESULT_FILE" ]; then
    echo "CF_AGENT_PARTIAL=$RESULT_FILE truncated output kept for diagnosis" >&2
  fi
  exit 124
fi

if [ "$status" -ne 0 ]; then
  echo "CF_AGENT=error $AGENT exited $status" >&2
  tail -n 20 "$LOG_FILE" >&2 2>/dev/null || true
  exit "$status"
fi

if [ ! -s "$RESULT_FILE" ]; then
  echo "CF_AGENT=empty $AGENT produced no output" >&2
  exit 0
fi

echo "CF_AGENT=ok $RESULT_FILE"
exit 0
