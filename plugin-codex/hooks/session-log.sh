#!/usr/bin/env bash
# Stop hook: Append a JSON line to the session log after each Claude turn.
#
# Writes to /tmp/cf-session-$SESSION_ID.jsonl with turn number, timestamp,
# and stop reason. This log is consumed by memory-capture.sh at PreCompact
# to produce richer, more accurate memory capture.
#
# Runs asynchronously — does not block Claude.
#
# Integration contract:
#   stdin  – JSON with stop_reason, session_id, etc.
#   stdout – (none, async hook)
#   Exit 0 = always (best-effort)

set -euo pipefail

INPUT=$(cat)

# Parse session_id from stdin JSON (Claude Code provides it here, not as env var)
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

# No session ID → can't write a meaningful log
if [ -z "$SESSION_ID" ]; then
  exit 0
fi

LOG_FILE="/tmp/cf-session-${SESSION_ID}.jsonl"
COUNTER_FILE="/tmp/cf-session-turn-${SESSION_ID}"

# Increment turn counter
TURN=0
if [ -f "$COUNTER_FILE" ]; then
  TURN=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
fi
TURN=$((TURN + 1))
echo "$TURN" > "$COUNTER_FILE" 2>/dev/null

# Extract stop reason
STOP_REASON=$(printf '%s' "$INPUT" | grep -o '"stop_reason"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"stop_reason"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

# Timestamp
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Append JSON line (best-effort)
printf '{"turn":%d,"ts":"%s","stop_reason":"%s"}\n' "$TURN" "$TS" "$STOP_REASON" >> "$LOG_FILE" 2>/dev/null || true
