#!/usr/bin/env bash
# run-codex-review.sh — run a Codex review, auto-selecting the right scope so it
# covers committed work, not just the uncommitted working tree.
# Usage: bash run-codex-review.sh <result-file> [--uncommitted]
#
# With --uncommitted the caller (cf-review) states the scope it already captured
# and auto-selection is skipped; with no flag the legacy auto-scope below runs.
#
# Verified against Codex CLI v0.130.0 (`codex review`):
#   - flags: --uncommitted (staged+unstaged+untracked), --base <REF> (changes
#     vs a base branch/ref — agent resolves upstream + merge-base itself, so
#     non-local refs like origin/main and SHAs are accepted), --commit <SHA>
#   - prints its final review (summary + [P1]/[P2]/[P3] bullets) to stdout
#   - has no --json / -o flag; progress noise goes to stderr
#
# Scope selection (mirrors what Claude's own gather-diff.sh reviews — committed
# branch changes AND uncommitted — as closely as one Codex invocation allows):
#   1. Feature branch (current != base, base exists, commits ahead of base)
#        → codex review --base <base>            (committed branch work)
#   2. On the base branch with unpushed commits (HEAD ahead of @{upstream})
#        → codex review --base <upstream>        (local commits not yet pushed)
#   3. Uncommitted changes present (and no committed work selected above)
#        → codex review --uncommitted
#   4. On base, no upstream, but local commits exist (local-only repo)
#        → codex review --commit HEAD            (fallback: last commit)
#   5. Nothing to review
#        → print "CF_CODEX=empty" to stderr, exit 0 (caller treats as no-op)
# When committed work exists it is preferred over uncommitted (the chosen
# behavior): a `--base` review covers committed changes but NOT uncommitted /
# untracked files, so work-in-progress on top of a committed phase is left to
# Claude's own review. Cases 1/2 are mutually exclusive with Case 3.
#
# Behavior:
#   - codex missing on PATH  → print "CF_CODEX=unavailable" to stderr, exit 127
#   - timeout                → print "CF_CODEX=timeout" to stderr, exit 124
#   - codex non-zero exit    → print "CF_CODEX=error" + log tail to stderr, propagate exit code
#   - empty review output    → print "CF_CODEX=empty" to stderr, exit 0 (exit 0 with
#                              nothing written is never reported as a review)
#   - success                → write review to <result-file>, print "CF_CODEX=ok <result-file>", exit 0
#
# The deadline (`review.agentTimeout`, default 300s) is enforced by
# run-with-timeout.sh on the codex subprocess and its whole process group. If no
# enforceable timeout exists, codex is not launched at all. The result file is
# truncated before launch, so a previous run's review can never be reported as
# this run's result.
#
# The caller (cf-review) checks the CF_CODEX line / exit code to decide whether
# to merge Codex findings or fall back to a Claude-only review.

set -u

RESULT_FILE=""
FORCED_UNCOMMITTED=false
positional=0

while [ $# -gt 0 ]; do
  case "$1" in
    --uncommitted)
      FORCED_UNCOMMITTED=true
      shift
      ;;
    -*)
      echo "CF_CODEX=error unknown flag: $1" >&2
      exit 2
      ;;
    *)
      if [ "$positional" -ne 0 ]; then
        echo "CF_CODEX=error unexpected argument: $1" >&2
        exit 2
      fi
      RESULT_FILE="$1"
      positional=1
      shift
      ;;
  esac
done

if [ -z "$RESULT_FILE" ]; then
  echo "CF_CODEX=error missing result-file argument" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_WITH_TIMEOUT="$SCRIPT_DIR/run-with-timeout.sh"
CONFIG_FILE="${CF_CONFIG_FILE:-.coding-friend/config.json}"

if ! command -v codex >/dev/null 2>&1; then
  echo "CF_CODEX=unavailable codex not found on PATH" >&2
  exit 127
fi

# --- Resolve the deadline (default 300s) ---
# A configured-but-unusable value is an error, not a silent 5-minute default.
TIMEOUT_SECS=$(bash "$RUN_WITH_TIMEOUT" --config-timeout "$CONFIG_FILE" 300) || {
  echo "CF_CODEX=error unusable review.agentTimeout — not launching codex" >&2
  exit 2
}

# --- Detect git state to choose the review scope ---

if git rev-parse --verify main >/dev/null 2>&1; then
  BASE_BRANCH="main"
elif git rev-parse --verify master >/dev/null 2>&1; then
  BASE_BRANCH="master"
else
  BASE_BRANCH=""
fi

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)

# Uncommitted = tracked changes vs HEAD OR untracked files.
has_uncommitted=false
if [ -n "$(git diff HEAD 2>/dev/null)" ] || [ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]; then
  has_uncommitted=true
fi

SCOPE_ARGS=()
SCOPE_LABEL=""

# --uncommitted from the caller pins the scope: cf-review already captured it,
# so auto-selection (which could pick a committed range instead) is skipped and
# only Case 3 below can apply.
if [ "$FORCED_UNCOMMITTED" = false ] && [ -n "$BASE_BRANCH" ] && [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]; then
  # Case 1: feature branch — review committed work vs the base branch.
  merge_base=$(git merge-base "$BASE_BRANCH" HEAD 2>/dev/null || true)
  if [ -n "$merge_base" ] && [ -n "$(git diff "$merge_base"..HEAD 2>/dev/null)" ]; then
    SCOPE_ARGS=(--base "$BASE_BRANCH")
    SCOPE_LABEL="--base $BASE_BRANCH (committed branch changes)"
  fi
fi

if [ "$FORCED_UNCOMMITTED" = false ] && [ ${#SCOPE_ARGS[@]} -eq 0 ] && [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" = "$BASE_BRANCH" ]; then
  # Case 2: on the base branch (e.g. committing directly to main) — review
  # local commits not yet pushed, compared against the upstream tracking ref.
  if [ -n "$UPSTREAM" ] && [ -n "$(git rev-list "$UPSTREAM"..HEAD 2>/dev/null)" ]; then
    SCOPE_ARGS=(--base "$UPSTREAM")
    SCOPE_LABEL="--base $UPSTREAM (unpushed commits)"
  fi
fi

if [ ${#SCOPE_ARGS[@]} -eq 0 ] && [ "$has_uncommitted" = true ]; then
  # Case 3: only uncommitted changes to review (or the caller pinned it).
  SCOPE_ARGS=(--uncommitted)
  if [ "$FORCED_UNCOMMITTED" = true ]; then
    SCOPE_LABEL="--uncommitted (caller-selected working tree)"
  else
    SCOPE_LABEL="--uncommitted (working tree)"
  fi
fi

if [ "$FORCED_UNCOMMITTED" = false ] && [ ${#SCOPE_ARGS[@]} -eq 0 ] && [ -z "$UPSTREAM" ] \
   && { [ -z "$BASE_BRANCH" ] || [ "$CURRENT_BRANCH" = "$BASE_BRANCH" ]; } \
   && [ "$(git rev-list --count HEAD 2>/dev/null || echo 0)" -gt 0 ]; then
  # Case 4: local-only repo (no upstream) with no base diff and no uncommitted —
  # review the last commit as a best-effort default. Gated to repos with no base
  # branch at all, or where we are ON the base branch: on a feature branch that
  # has a base, "no committed diff vs base" means nothing new (Case 1 already
  # declined) → fall through to Case 5 (empty) instead of reviewing the shared
  # base tip. When an upstream exists we also fall through to Case 5.
  SCOPE_ARGS=(--commit HEAD)
  SCOPE_LABEL="--commit HEAD (last commit, no base/upstream to compare)"
fi

if [ ${#SCOPE_ARGS[@]} -eq 0 ]; then
  # Case 5: nothing to review.
  echo "CF_CODEX=empty no committed or uncommitted changes to review" >&2
  exit 0
fi

echo "CF_CODEX_SCOPE=${SCOPE_LABEL}" >&2

mkdir -p "$(dirname "$RESULT_FILE")" 2>/dev/null || true
LOG_FILE="${RESULT_FILE%.md}.log"

# Truncate BEFORE launch: a previous run's review must never be picked up as
# this one's, and an empty file after exit 0 must stay empty.
if ! : >"$RESULT_FILE" 2>/dev/null; then
  echo "CF_CODEX=error cannot write result file: $RESULT_FILE" >&2
  exit 2
fi
: >"$LOG_FILE" 2>/dev/null || true

# Preflight with stderr unredirected: if no deadline can be enforced, codex is
# not launched at all.
if ! bash "$RUN_WITH_TIMEOUT" --check "$TIMEOUT_SECS"; then
  echo "CF_CODEX=error no enforceable timeout available — not launching codex" >&2
  exit 2
fi

# stdout → result file (the review), stderr → sidecar log (progress noise)
bash "$RUN_WITH_TIMEOUT" "$TIMEOUT_SECS" \
  codex review "${SCOPE_ARGS[@]}" \
  >"$RESULT_FILE" 2>"$LOG_FILE"
status=$?

if [ "$status" -eq 124 ]; then
  echo "CF_CODEX=timeout codex exceeded ${TIMEOUT_SECS}s" >&2
  # Kept for diagnosis only — a killed run is never a review.
  if [ -s "$RESULT_FILE" ]; then
    echo "CF_CODEX_PARTIAL=$RESULT_FILE truncated output kept for diagnosis" >&2
  fi
  exit 124
fi

if [ "$status" -ne 0 ]; then
  echo "CF_CODEX=error codex exited $status" >&2
  tail -n 20 "$LOG_FILE" >&2 2>/dev/null || true
  exit "$status"
fi

if [ ! -s "$RESULT_FILE" ]; then
  echo "CF_CODEX=empty codex produced no output" >&2
  exit 0
fi

echo "CF_CODEX=ok $RESULT_FILE"
exit 0
