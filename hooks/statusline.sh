#!/usr/bin/env bash
# Statusline hook: Show context info in Claude Code status bar

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TRACKER_FILE="/tmp/coding-friend-context-$$"

# Git branch
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")

# Files tracked this session
FILE_COUNT=0
if [ -f "$TRACKER_FILE" ]; then
  FILE_COUNT=$(wc -l < "$TRACKER_FILE" | xargs)
fi

# Build status line
STATUS="cf | $BRANCH | ${FILE_COUNT} files read"

cat <<EOF
{
  "hookSpecificOutput": {
    "statusline": "$STATUS"
  }
}
EOF
