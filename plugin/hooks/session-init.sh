#!/usr/bin/env bash
# SessionStart hook: Bootstrap coding-friend context
# Fires on: startup, resume, clear, compact

set -euo pipefail

LOG_FILE="${TMPDIR:-/tmp}/coding-friend-session-init.log"
exec 2>>"$LOG_FILE"
echo "=== session-init.sh started at $(date) ===" >>"$LOG_FILE"
trap 'echo "ERROR: session-init.sh failed at line $LINENO (exit $?)" >>"$LOG_FILE"' ERR

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SKILL_FILE="$PLUGIN_ROOT/skills/cf-help/SKILL.md"

# Read the meta-skill content
if [ ! -f "$SKILL_FILE" ]; then
  echo '{}'
  exit 0
fi

CONTENT=$(cat "$SKILL_FILE")

# Load config
CONFIG_FILE=".coding-friend/config.json"
DOCS_DIR="docs"
if [ -f "$CONFIG_FILE" ]; then
  CUSTOM_DIR=$(grep -o '"docsDir"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | sed 's/.*"docsDir"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
  if [ -n "$CUSTOM_DIR" ]; then
    DOCS_DIR="$CUSTOM_DIR"
  fi
fi

# Detect project type
PROJECT_TYPE="unknown"
if [ -f "package.json" ]; then
  if [ -d "packages" ] || [ -f "pnpm-workspace.yaml" ] || [ -f "lerna.json" ]; then
    PROJECT_TYPE="monorepo"
  else
    PROJECT_TYPE="single-repo"
  fi
elif [ -f "Cargo.toml" ]; then
  PROJECT_TYPE="rust"
elif [ -f "go.mod" ]; then
  PROJECT_TYPE="go"
elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
  PROJECT_TYPE="python"
fi

# Detect package manager
PKG_MANAGER="unknown"
if [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then
  PKG_MANAGER="bun"
elif [ -f "pnpm-lock.yaml" ]; then
  PKG_MANAGER="pnpm"
elif [ -f "yarn.lock" ]; then
  PKG_MANAGER="yarn"
elif [ -f "package-lock.json" ]; then
  PKG_MANAGER="npm"
fi

# Load ignore patterns if present
CFIGNORE_PATTERNS=""
CFIGNORE_FILE="$PLUGIN_ROOT/.coding-friend/ignore"
if [ -f ".coding-friend/ignore" ]; then
  CFIGNORE_FILE=".coding-friend/ignore"
fi
if [ -f "$CFIGNORE_FILE" ]; then
  CFIGNORE_PATTERNS=$(grep -v '^#' "$CFIGNORE_FILE" | grep -v '^$' | tr '\n' '|' | sed 's/|$//')
fi

# Build context
CONTEXT="<IMPORTANT>
PROJECT_TYPE: $PROJECT_TYPE
PKG_MANAGER: $PKG_MANAGER
DOCS_DIR: $DOCS_DIR
CFIGNORE: $CFIGNORE_PATTERNS

$CONTENT
</IMPORTANT>"

# JSON-escape context
ESCAPED_CTX=$(printf '%s' "$CONTEXT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | awk '{printf "%s\\n", $0}' | sed 's/\\n$//')

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "$ESCAPED_CTX"
  }
}
EOF
