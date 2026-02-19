#!/usr/bin/env bash
# Statusline hook: Show context info in Claude Code status bar

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TRACKER_FILE="/tmp/coding-friend-context-$$"

# Read JSON input from stdin
INPUT=$(cat)

# Colors
BLUE=$'\033[0;34m'
GREEN=$'\033[0;32m'
GRAY=$'\033[0;90m'
CYAN=$'\033[0;36m'
RESET=$'\033[0m'

separator="${GRAY} │ ${RESET}"

# Active model
MODEL=$(echo "$INPUT" | jq -r '.session.model // empty' 2>/dev/null)
if [ -z "$MODEL" ]; then
  MODEL=$(echo "$INPUT" | jq -r '.model.display_name // empty' 2>/dev/null)
fi

# Git branch
BRANCH=""
if git rev-parse --git-dir > /dev/null 2>&1; then
  branch=$(git branch --show-current 2>/dev/null)
  [ -n "$branch" ] && BRANCH="${GREEN}⎇ ${branch}${RESET}"
fi

# Files tracked this session
FILE_COUNT=0
if [ -f "$TRACKER_FILE" ]; then
  FILE_COUNT=$(wc -l < "$TRACKER_FILE" | xargs)
fi

# Build output
output="${BLUE}cf${RESET}"

if [ -n "$MODEL" ]; then
  output="${output}${separator}${CYAN}${MODEL}${RESET}"
fi

if [ -n "$BRANCH" ]; then
  output="${output}${separator}${BRANCH}"
fi

output="${output}${separator}${GRAY}${FILE_COUNT} files read${RESET}"

# Escape for JSON
escaped_output=$(printf '%s' "$output" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat <<EOF
{
  "hookSpecificOutput": {
    "statusline": "$escaped_output"
  }
}
EOF
