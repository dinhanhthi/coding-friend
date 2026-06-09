#!/usr/bin/env bash
# Detect the most recent non-agent Claude Code session for the current project.
# Outputs two lines: LATEST (full path to .jsonl) and SESSION_ID.
# Exit 1 with error message if no session found.

set -euo pipefail

CWD=$(pwd)
ENCODED=$(echo "$CWD" | sed 's|/|-|g')

# Resolve Claude global config dir (honors CLAUDE_CONFIG_DIR; default ~/.claude).
# Inlined here — this standalone skill script has no PLUGIN_ROOT to source
# plugin/lib/cf-paths.sh from. Mirrors cf_claude_dir(): tilde-expand leading ~, else verbatim.
CLAUDE_DIR="${CLAUDE_CONFIG_DIR-}"
CLAUDE_DIR="${CLAUDE_DIR#"${CLAUDE_DIR%%[![:space:]]*}"}"
CLAUDE_DIR="${CLAUDE_DIR%"${CLAUDE_DIR##*[![:space:]]}"}"
if [ -z "$CLAUDE_DIR" ]; then
  CLAUDE_DIR="$HOME/.claude"
else
  case "$CLAUDE_DIR" in
    "~") CLAUDE_DIR="$HOME" ;;
    "~/"*) CLAUDE_DIR="$HOME/${CLAUDE_DIR#\~/}" ;;
  esac
fi
SESSION_DIR="$CLAUDE_DIR/projects/$ENCODED"

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
