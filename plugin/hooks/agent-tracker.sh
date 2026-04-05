#!/usr/bin/env bash
# SubagentStart/SubagentStop hook: Track active agent for statusline.
#
# Uses reference counting so parallel agents don't clear the indicator
# when only one of them stops. Writes to two files per session:
#   /tmp/cf-agent-$SESSION_ID       — last-started agent name (for display)
#   /tmp/cf-agent-count-$SESSION_ID — number of active agents
#
# The statusline hook reads cf-agent-$SESSION_ID to display "Agent: <name>".
# The file is only removed when the count drops to zero.
#
# Runs asynchronously — does not block Claude.
#
# Integration contract:
#   stdin  – JSON with hook_event_name, agent_type, session_id
#   stdout – (none, async hook)
#   Exit 0 = always (best-effort)

set -euo pipefail

ERR_LOG="${TMPDIR:-/tmp}/cf-hook-errors.log"

INPUT=$(cat)

# Parse session_id from stdin JSON (Claude Code provides it here, not as env var)
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
if [ -z "$SESSION_ID" ]; then
  # Payload did not contain a session_id — log so regressions in CC's event
  # shape are visible without blocking the hook.
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] agent-tracker: missing session_id in payload; first 200 bytes: $(printf '%s' "$INPUT" | head -c 200)" >>"$ERR_LOG" 2>/dev/null || true
  exit 0
fi

AGENT_FILE="/tmp/cf-agent-${SESSION_ID}"
COUNT_FILE="/tmp/cf-agent-count-${SESSION_ID}"
LOCK_DIR="/tmp/cf-agent-count-${SESSION_ID}.lock"
EVENT=$(printf '%s' "$INPUT" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
if [ -z "$EVENT" ]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] agent-tracker: missing hook_event_name for session $SESSION_ID" >>"$ERR_LOG" 2>/dev/null || true
  exit 0
fi

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

# Read current count
COUNT=0
if [ -f "$COUNT_FILE" ]; then
  COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
fi

case "$EVENT" in
  SubagentStart)
    AGENT_TYPE=$(printf '%s' "$INPUT" | grep -o '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"agent_type"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
    COUNT=$((COUNT + 1))
    echo "$COUNT" > "$COUNT_FILE" 2>/dev/null || true
    [ -n "$AGENT_TYPE" ] && echo "$AGENT_TYPE" > "$AGENT_FILE" 2>/dev/null || true
    ;;
  SubagentStop)
    COUNT=$((COUNT - 1))
    if [ "$COUNT" -le 0 ]; then
      rm -f "$AGENT_FILE" "$COUNT_FILE" 2>/dev/null || true
    else
      echo "$COUNT" > "$COUNT_FILE" 2>/dev/null || true
    fi
    ;;
esac
