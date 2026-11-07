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

ERR_LOG="${TMPDIR:-/tmp}/cf-hook-errors.log"

if [ "${CF_HOST:-claude}" = "codex" ]; then
  exit 0
fi

INPUT=$(cat)

# Parse session_id from stdin JSON (Claude Code provides it here, not as env var)
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
if [ -z "$SESSION_ID" ]; then
  # Payload did not contain a session_id — log so regressions in CC's event
  # shape are visible without blocking the hook.
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] task-tracker: missing session_id in payload; first 200 bytes: $(printf '%s' "$INPUT" | head -c 200)" >>"$ERR_LOG" 2>/dev/null || true
  exit 0
fi

TASKS_FILE="/tmp/cf-tasks-${SESSION_ID}.json"
LOCK_DIR="/tmp/cf-tasks-${SESSION_ID}.lock"
EVENT=$(printf '%s' "$INPUT" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
if [ -z "$EVENT" ]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] task-tracker: missing hook_event_name for session $SESSION_ID" >>"$ERR_LOG" 2>/dev/null || true
  exit 0
fi

# Acquire lock (mkdir is atomic on all Unix systems). The trap is set first so
# a hook killed right after mkdir still releases the lock; it only removes a
# lock this hook holds.
HAVE_LOCK=0
trap '[ "$HAVE_LOCK" = 1 ] && rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
while :; do
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    HAVE_LOCK=1
    break
  fi
  # Holders keep the lock for milliseconds, so one still held when this hook
  # has run ~2-3 s (SECONDS counts whole seconds since start) is stale or
  # stuck. Break it and do the update anyway: a dropped TaskCreated/
  # TaskCompleted leaves the statusline wrong for the rest of the session,
  # while a rare unlocked write risks at most the same miscount.
  if [ "$SECONDS" -ge 3 ]; then
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] task-tracker: lock $LOCK_DIR still held after ${SECONDS}s; breaking it for $EVENT" >>"$ERR_LOG" 2>/dev/null || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      HAVE_LOCK=1
    fi
    break
  fi
  sleep 0.05
done

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
