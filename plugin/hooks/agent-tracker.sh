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

json_string() {
  local key="$1"
  printf '%s' "$INPUT" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"//;s/\"$//" || true
}

# Parse session_id from stdin JSON (Claude Code provides it here, not as env var)
SESSION_ID=$(json_string "session_id")
if [ -z "$SESSION_ID" ]; then
  # Payload did not contain a session_id — log so regressions in CC's event
  # shape are visible without blocking the hook.
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] agent-tracker: missing session_id in payload; first 200 bytes: $(printf '%s' "$INPUT" | head -c 200)" >>"$ERR_LOG" 2>/dev/null || true
  exit 0
fi

AGENT_FILE="/tmp/cf-agent-${SESSION_ID}"
COUNT_FILE="/tmp/cf-agent-count-${SESSION_ID}"
LOCK_DIR="/tmp/cf-agent-count-${SESSION_ID}.lock"
EVENT=$(json_string "hook_event_name")
if [ -z "$EVENT" ]; then
  EVENT=$(json_string "hookEventName")
fi
if [ -z "$EVENT" ]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] agent-tracker: missing hook_event_name for session $SESSION_ID" >>"$ERR_LOG" 2>/dev/null || true
  exit 0
fi

# Parse the agent name before taking the lock to keep the critical section short
AGENT_TYPE=""
if [ "$EVENT" = "SubagentStart" ]; then
  AGENT_TYPE=$(json_string "agent_type")
  if [ -z "$AGENT_TYPE" ]; then
    AGENT_TYPE=$(json_string "agent_name")
  fi
  if [ -z "$AGENT_TYPE" ]; then
    AGENT_TYPE=$(json_string "subagent_type")
  fi
fi

# Acquire lock (mkdir is atomic on all Unix systems). The trap is set first so
# a hook killed right after mkdir still releases the lock; it only removes a
# lock this hook holds.
HAVE_LOCK=0
WAIT_START=""
trap '[ "$HAVE_LOCK" = 1 ] && rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
while :; do
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    HAVE_LOCK=1
    break
  fi
  # Holders keep the lock for milliseconds, so a lock still held after this
  # hook has waited ~2-3 s for it is stale or stuck. The wait is counted from
  # the first failed mkdir (SECONDS has whole-second resolution), never from
  # the hook start: on a loaded machine the start alone can take seconds.
  # Break it and do the update anyway: a dropped start/stop
  # leaves the statusline wrong for the rest of the session, while a rare
  # unlocked write risks at most the same miscount.
  [ -n "$WAIT_START" ] || WAIT_START=$SECONDS
  if [ $((SECONDS - WAIT_START)) -ge 3 ]; then
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] agent-tracker: lock $LOCK_DIR still held after waiting $((SECONDS - WAIT_START))s; breaking it for $EVENT" >>"$ERR_LOG" 2>/dev/null || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      HAVE_LOCK=1
    fi
    break
  fi
  sleep 0.05
done

# Read current count
COUNT=0
if [ -f "$COUNT_FILE" ]; then
  COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
fi

case "$EVENT" in
  SubagentStart)
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
