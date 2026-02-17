#!/usr/bin/env bash
# PostToolUse hook: Track files read in this session (async)
# Runs after Read, Glob, Grep tools

set -euo pipefail

TRACKER_FILE="/tmp/coding-friend-context-$$"

# Read tool input from stdin
INPUT=$(cat)

# Extract file path
FILE_PATH=$(printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
PATH_ARG=$(printf '%s' "$INPUT" | grep -o '"path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"path"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

# Track the file
TRACK_PATH="${FILE_PATH:-$PATH_ARG}"
if [ -n "$TRACK_PATH" ]; then
  echo "$TRACK_PATH" >> "$TRACKER_FILE" 2>/dev/null || true
fi

# No output needed for async hooks
echo '{}'
