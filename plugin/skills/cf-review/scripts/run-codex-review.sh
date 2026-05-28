#!/usr/bin/env bash
# run-codex-review.sh — run a Codex review of the uncommitted working tree
# Usage: bash run-codex-review.sh <result-file>
#
# Verified against Codex CLI v0.130.0 (`codex review --uncommitted`):
#   - prints its final review (summary + [P1]/[P2]/[P3] bullets) to stdout
#   - has no --json / -o flag; progress noise goes to stderr
#
# Behavior:
#   - codex missing on PATH  → print "CF_CODEX=unavailable" to stderr, exit 127
#   - codex non-zero exit    → print "CF_CODEX=error" + log tail to stderr, propagate exit code
#   - success                → write review to <result-file>, print "CF_CODEX=ok <result-file>", exit 0
#
# The caller (cf-review) checks the CF_CODEX line / exit code to decide whether
# to merge Codex findings or fall back to a Claude-only review.

set -u

RESULT_FILE="${1:-}"
if [ -z "$RESULT_FILE" ]; then
  echo "CF_CODEX=error missing result-file argument" >&2
  exit 2
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "CF_CODEX=unavailable codex not found on PATH" >&2
  exit 127
fi

mkdir -p "$(dirname "$RESULT_FILE")"
LOG_FILE="${RESULT_FILE%.md}.log"

# stdout → result file (the review), stderr → sidecar log (progress noise)
codex review --uncommitted >"$RESULT_FILE" 2>"$LOG_FILE"
status=$?

if [ "$status" -ne 0 ]; then
  echo "CF_CODEX=error codex exited $status" >&2
  tail -n 20 "$LOG_FILE" >&2 2>/dev/null || true
  exit "$status"
fi

echo "CF_CODEX=ok $RESULT_FILE"
exit 0
