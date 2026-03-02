#!/usr/bin/env bash
# Stop hook: Remind user to review/commit before finishing.
#
# Fires when the agent is about to stop. Checks for uncommitted git
# changes and, if they exceed a configurable threshold (default: 50
# lines), reminds the user to run /cf-review or /cf-commit first.
# Detects sensitive files (auth, security, crypto) and suggests DEEP
# review mode when found.
#
# Soft gate — blocks the stop to show the reminder, but the user can
# dismiss it. Skips if already reviewed (marker file) or if the session
# is inside a stop hook (prevents infinite loops).
#
# Integration contract:
#   stdin  – JSON with stop_hook_active flag
#   stdout – JSON with hookSpecificOutput.decision = "block" + reason
#   Exit 0 = allow stop (no reminder needed)
#
# Configuration:
#   "reviewGate": false in .coding-friend/config.json disables the hook.
#   "reviewGateThreshold": <number> sets min lines changed (default: 50).

set -euo pipefail

LOG_FILE="${TMPDIR:-/tmp}/coding-friend-review-gate.log"
exec 2>>"$LOG_FILE"
trap 'echo "ERROR: review-gate.sh failed at line $LINENO (exit $?)" >>"$LOG_FILE"' ERR

INPUT=$(cat)

# --- Prevent infinite loops ---
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# --- Check config ---
CONFIG_FILE=".coding-friend/config.json"
if [ -f "$CONFIG_FILE" ]; then
  ENABLED=$(jq -r '.reviewGate // true' "$CONFIG_FILE" 2>/dev/null || echo "true")
  THRESHOLD=$(jq -r '.reviewGateThreshold // 50' "$CONFIG_FILE" 2>/dev/null || echo "50")
else
  ENABLED="true"
  THRESHOLD=50
fi

if [ "$ENABLED" = "false" ]; then
  exit 0
fi

# --- Check if already reviewed this session ---
MARKER_DIR="${TMPDIR:-/tmp}/coding-friend"
if [ -f "$MARKER_DIR/reviewed" ]; then
  exit 0
fi

# --- Check for uncommitted changes ---
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

DIFF_STAT=$(git diff --stat HEAD 2>/dev/null || echo "")
STAGED_STAT=$(git diff --cached --stat 2>/dev/null || echo "")

if [ -z "$DIFF_STAT" ] && [ -z "$STAGED_STAT" ]; then
  exit 0
fi

# --- Count lines changed ---
LINES_ADDED=$(git diff HEAD --numstat 2>/dev/null | awk '{s+=$1} END {print s+0}' || echo 0)
LINES_DELETED=$(git diff HEAD --numstat 2>/dev/null | awk '{s+=$2} END {print s+0}' || echo 0)
TOTAL_LINES=$((LINES_ADDED + LINES_DELETED))

if [ "$TOTAL_LINES" -lt "$THRESHOLD" ]; then
  exit 0
fi

# --- Check for sensitive files ---
SENSITIVE=$(git diff --name-only HEAD 2>/dev/null | grep -ciE "(auth|security|crypto|token|session|middleware|api/|login|password|secret|\.env)" || echo 0)

# --- Build reminder message ---
FILES_CHANGED=$(git diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ')
REMINDER="You have $FILES_CHANGED files with ~$TOTAL_LINES lines of uncommitted changes."

if [ "$SENSITIVE" -gt 0 ]; then
  REMINDER="$REMINDER Sensitive files detected (auth/security/crypto). Consider running /cf-review (DEEP mode) before committing."
else
  REMINDER="$REMINDER Consider running /cf-review or /cf-commit before finishing."
fi

# --- Output as Stop hook response ---
ESCAPED_REMINDER=$(printf '%s' "$REMINDER" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat <<EOF
{
  "hookSpecificOutput": {
    "decision": "block",
    "reason": "$ESCAPED_REMINDER"
  }
}
EOF
