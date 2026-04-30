#!/usr/bin/env bash
# Loads DESIGN_PATTERNS.md from the project's docs/memory directory.
# Output is consumed by SKILL.md for design context injection.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo ".")"

CONFIG_FILE="$PROJECT_ROOT/.coding-friend/config.json"
DOCS_DIR="docs"
if [[ -f "$CONFIG_FILE" ]]; then
  _parsed=$(grep -o '"docsDir"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null \
    | sed 's/.*"docsDir"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
  [[ -n "$_parsed" ]] && DOCS_DIR="$_parsed"
fi

PATTERNS_FILE="$PROJECT_ROOT/$DOCS_DIR/memory/DESIGN_PATTERNS.md"
if [[ -f "$PATTERNS_FILE" ]]; then
  echo "=== Existing Design Patterns (from $DOCS_DIR/memory/DESIGN_PATTERNS.md) ==="
  cat "$PATTERNS_FILE"
  echo "=== End Design Patterns ==="
else
  echo "No DESIGN_PATTERNS.md found at $DOCS_DIR/memory/DESIGN_PATTERNS.md."
  echo "Run '/cf-design scan' to extract and save your project's design patterns."
fi
