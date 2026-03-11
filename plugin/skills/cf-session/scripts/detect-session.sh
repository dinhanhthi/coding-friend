#!/usr/bin/env bash
# Detect the most recent non-agent Claude Code session for the current project.
# Outputs two lines: LATEST (full path to .jsonl) and SESSION_ID.
# Exit 1 with error message if no session found.

set -euo pipefail

CWD=$(pwd)
ENCODED=$(echo "$CWD" | sed 's|/|-|g')
SESSION_DIR="$HOME/.claude/projects/$ENCODED"

if [ ! -d "$SESSION_DIR" ]; then
  echo "ERROR: No session directory found at $SESSION_DIR" >&2
  exit 1
fi

LATEST=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | grep -v '/agent-' | head -1)

if [ -z "$LATEST" ]; then
  echo "ERROR: No session files found in $SESSION_DIR" >&2
  exit 1
fi

SESSION_ID=$(basename "$LATEST" .jsonl)

echo "$LATEST"
echo "$SESSION_ID"
