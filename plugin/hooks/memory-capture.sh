#!/usr/bin/env bash
# PreCompact auto-capture: extract a brief episode memory before context compaction.
# Only active when memory.autoCapture is enabled.

set -euo pipefail

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

# Output instruction for the agent to capture a memory before compaction
cat <<'PROMPT'
Before context is compacted, save a brief episode memory of what was accomplished in this session.
Use the `memory_store` MCP tool with:
- type: "episode"
- importance: 2
- source: "auto-capture"
- title: a brief summary of the main task
- description: one-line summary under 100 chars
- tags: relevant keywords
- content: key decisions, findings, and outcomes from this session

If the `memory_store` tool is not available, skip this step silently.
PROMPT
