#!/usr/bin/env bash
# Stop hook (Antigravity): append a JSON line to the session log.
#
# Same log target as session-log.sh (/tmp/cf-session-${SESSION_ID}.jsonl)
# using conversationId as SESSION_ID. Always prints {"decision":""}.
#
# Speaks AGY's hook contract:
#   stdin  – JSON with conversationId, terminationReason
#   stdout – {"decision":""}

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../lib/agy-hook-io.sh
source "$PLUGIN_ROOT/lib/agy-hook-io.sh"

agy_read_payload

SESSION_ID="$(agy_field conversationId || true)"
SESSION_ID="${SESSION_ID//$'\n'/}"
SESSION_ID="${SESSION_ID//$'\r'/}"
STOP_REASON="$(agy_field terminationReason || true)"
STOP_REASON="${STOP_REASON//$'\n'/}"
STOP_REASON="${STOP_REASON//$'\r'/}"

if [ -n "$SESSION_ID" ]; then
  LOG_FILE="/tmp/cf-session-${SESSION_ID}.jsonl"
  COUNTER_FILE="/tmp/cf-session-turn-${SESSION_ID}"

  TURN=0
  if [ -f "$COUNTER_FILE" ]; then
    TURN=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
  fi
  TURN=$((TURN + 1))
  echo "$TURN" > "$COUNTER_FILE" 2>/dev/null || true

  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  printf '{"turn":%d,"ts":"%s","stop_reason":"%s","conversationId":"%s","terminationReason":"%s"}\n' \
    "$TURN" "$TS" "$STOP_REASON" "$SESSION_ID" "$STOP_REASON" >> "$LOG_FILE" 2>/dev/null || true
fi

printf '%s\n' '{"decision":""}'
