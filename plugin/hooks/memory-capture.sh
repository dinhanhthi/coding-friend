#!/usr/bin/env bash
# PreCompact auto-capture: extract a brief episode memory before context compaction.
# Only active when memory.autoCapture is enabled.

set -euo pipefail

# Capture stdin (JSON with session_id etc.) before it gets consumed
INPUT=$(cat)

CONFIG_FILE="${PWD}/.coding-friend/config.json"
AUTO_CAPTURE="false"

if [[ -f "$CONFIG_FILE" ]]; then
  AUTO_CAPTURE=$(node -e "
    try {
      const c = JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));
      console.log(c.memory?.autoCapture ? 'true' : 'false');
    } catch { console.log('false'); }
  " 2>/dev/null || echo "false")
fi

if [[ "$AUTO_CAPTURE" != "true" ]]; then
  exit 0
fi

# Read session log if available (written by session-log.sh Stop hook)
SESSION_LOG=""
# Parse session_id from stdin JSON (Claude Code provides it here, not as env var)
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
if [[ -n "$SESSION_ID" ]]; then
  LOG_FILE="/tmp/cf-session-${SESSION_ID}.jsonl"
  if [[ -f "$LOG_FILE" ]]; then
    SESSION_LOG=$(cat "$LOG_FILE" 2>/dev/null || true)
  fi
fi

# Build session context block (if turn log is available)
SESSION_CONTEXT=""
if [[ -n "$SESSION_LOG" ]]; then
  SESSION_CONTEXT="
Session turn log (each line is a JSON object with turn number and timestamp):
$SESSION_LOG
"
fi

# Output instruction for the agent to capture a memory before compaction
cat <<PROMPT
Before context is compacted, save a brief episode memory of what was accomplished in this session.
${SESSION_CONTEXT}
Use the \`memory_store\` MCP tool with:
- type: "episode"
- importance: 2
- source: "auto-capture"
- title: a brief summary of the main task
- description: one-line summary under 100 chars
- tags: relevant keywords
- content: key decisions, findings, and outcomes from this session

If the \`memory_store\` tool is not available, skip this step silently.
PROMPT
