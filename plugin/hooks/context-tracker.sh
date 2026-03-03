#!/usr/bin/env bash
# PostToolUse hook: Track files read in this session (async).
#
# Appends file paths from Read, Glob, Grep tool calls to a session-local
# tracker file at /tmp/coding-friend-context-$$. This log can be used by
# other hooks or scripts to understand what files the agent has seen.
#
# Runs asynchronously — does not block tool execution.
#
# Integration contract:
#   stdin  – JSON with tool_input containing file_path or path
#   stdout – JSON {} (no output needed)
#   Exit 0 = always (async, best-effort)
#
# Configuration:
#   None — always active when coding-friend plugin is loaded.

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
