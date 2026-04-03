#!/usr/bin/env bash
# SubagentStart/SubagentStop hook: Track active agent for statusline.
#
# Writes the active agent name to /tmp/cf-agent-$SESSION_ID.
# Clears the file on SubagentStop.
# The statusline hook reads this file to display "Agent: <name>".
#
# Runs asynchronously — does not block Claude.
#
# Integration contract:
#   stdin  – JSON with hook_event_name, agent_type, session_id
#   stdout – (none, async hook)
#   Exit 0 = always (best-effort)

set -euo pipefail

INPUT=$(cat)

# Parse session_id from stdin JSON (Claude Code provides it here, not as env var)
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
[ -z "$SESSION_ID" ] && exit 0

AGENT_FILE="/tmp/cf-agent-${SESSION_ID}"
EVENT=$(printf '%s' "$INPUT" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

case "$EVENT" in
  SubagentStart)
    AGENT_TYPE=$(printf '%s' "$INPUT" | grep -o '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"agent_type"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
    [ -n "$AGENT_TYPE" ] && echo "$AGENT_TYPE" > "$AGENT_FILE" 2>/dev/null || true
    ;;
  SubagentStop)
    rm -f "$AGENT_FILE" 2>/dev/null || true
    ;;
esac
