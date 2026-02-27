#!/usr/bin/env bash
# PreToolUse hook: Block access to directories in .coding-friend/ignore
# Exit code 2 = block the tool execution

set -euo pipefail

# Check if hook is disabled via config
CONFIG_FILE=".coding-friend/config.json"
if [ -f "$CONFIG_FILE" ]; then
  if grep -q '"scoutBlock"[[:space:]]*:[[:space:]]*false' "$CONFIG_FILE" 2>/dev/null; then
    echo '{}'
    exit 0
  fi
fi

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Find ignore file (project first, then plugin root)
CFIGNORE=""
if [ -f ".coding-friend/ignore" ]; then
  CFIGNORE=".coding-friend/ignore"
elif [ -f "$PLUGIN_ROOT/.coding-friend/ignore" ]; then
  CFIGNORE="$PLUGIN_ROOT/.coding-friend/ignore"
fi

# No ignore file = allow everything
if [ -z "$CFIGNORE" ]; then
  echo '{}'
  exit 0
fi

# Load patterns (skip comments and empty lines)
PATTERNS=()
while IFS= read -r line; do
  line=$(echo "$line" | sed 's/#.*//' | xargs)
  [ -z "$line" ] && continue
  PATTERNS+=("$line")
done < "$CFIGNORE"

# No patterns = allow everything
if [ ${#PATTERNS[@]} -eq 0 ]; then
  echo '{}'
  exit 0
fi

# Read tool input from stdin
INPUT=$(cat)

# Extract paths from tool input
FILE_PATH=$(printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
PATH_ARG=$(printf '%s' "$INPUT" | grep -o '"path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"path"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
PATTERN_ARG=$(printf '%s' "$INPUT" | grep -o '"pattern"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"pattern"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

PATHS_TO_CHECK="$FILE_PATH $PATH_ARG $PATTERN_ARG"

for path in $PATHS_TO_CHECK; do
  [ -z "$path" ] && continue

  for pattern in "${PATTERNS[@]}"; do
    # Simple glob match: check if path contains the pattern directory
    clean_pattern=$(echo "$pattern" | sed 's|/$||; s|^\./||')
    if echo "$path" | grep -q "/$clean_pattern/" || echo "$path" | grep -q "^$clean_pattern/" || echo "$path" | grep -q "/$clean_pattern$"; then
      cat <<EOF
{
  "hookSpecificOutput": {
    "decision": "block",
    "reason": "Access to '$path' blocked by ignore pattern: $pattern"
  }
}
EOF
      exit 2
    fi
  done
done

# Allow
echo '{}'
