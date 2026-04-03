#!/usr/bin/env bash
# TaskCreated/TaskCompleted hook: Track task progress for statusline.
#
# Writes current task counts to /tmp/cf-tasks-$SESSION_ID.json.
# The statusline hook reads this file to display "Tasks: X/Y".
# Uses mkdir-based locking to prevent race conditions from concurrent async hooks.
#
# Runs asynchronously — does not block Claude.
#
# Integration contract:
#   stdin  – JSON with hook_event_name, task_id, task_subject, session_id
#   stdout – (none, async hook)
#   Exit 0 = always (best-effort)

set -euo pipefail

INPUT=$(cat)

# Parse session_id from stdin JSON (Claude Code provides it here, not as env var)
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
[ -z "$SESSION_ID" ] && exit 0

TASKS_FILE="/tmp/cf-tasks-${SESSION_ID}.json"
LOCK_DIR="/tmp/cf-tasks-${SESSION_ID}.lock"
EVENT=$(printf '%s' "$INPUT" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

# Acquire lock (mkdir is atomic on all Unix systems)
RETRIES=0
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -gt 20 ]; then
    # Give up after ~1s — don't block indefinitely
    exit 0
  fi
  sleep 0.05
done
# Ensure lock is released on exit
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# Read current state
TOTAL=0
COMPLETED=0
if [ -f "$TASKS_FILE" ]; then
  TOTAL=$(grep -o '"total"[[:space:]]*:[[:space:]]*[0-9]*' "$TASKS_FILE" 2>/dev/null | grep -o '[0-9]*$' || echo 0)
  COMPLETED=$(grep -o '"completed"[[:space:]]*:[[:space:]]*[0-9]*' "$TASKS_FILE" 2>/dev/null | grep -o '[0-9]*$' || echo 0)
fi

case "$EVENT" in
  TaskCreated)
    TOTAL=$((TOTAL + 1))
    ;;
  TaskCompleted)
    COMPLETED=$((COMPLETED + 1))
    ;;
esac

printf '{"total":%d,"completed":%d}\n' "$TOTAL" "$COMPLETED" > "$TASKS_FILE" 2>/dev/null || true
