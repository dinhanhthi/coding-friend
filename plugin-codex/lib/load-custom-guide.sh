#!/usr/bin/env bash
# Usage: load-custom-guide.sh <skill-name>
# Checks local (.coding-friend/skills/) then global (~/.coding-friend/skills/)
# for a custom guide. Outputs content if found, nothing otherwise.

SKILL_NAME="${1:?Usage: load-custom-guide.sh <skill-name>}"

# Defense-in-depth: reject path traversal (skill names are hardcoded, but be safe)
if [[ "$SKILL_NAME" == */* ]] || [[ "$SKILL_NAME" == *\\* ]] || [[ "$SKILL_NAME" == *..* ]]; then
  exit 0
fi

# Always resolve custom guide relative to the git project root, not CWD.
# This prevents misses when the shell is cd'd into a subdirectory (e.g. cli/).
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOCAL="${PROJECT_ROOT}/.coding-friend/skills/${SKILL_NAME}-custom/SKILL.md"
GLOBAL="$HOME/.coding-friend/skills/${SKILL_NAME}-custom/SKILL.md"

if [ -f "$LOCAL" ]; then
  cat "$LOCAL"
elif [ -f "$GLOBAL" ]; then
  cat "$GLOBAL"
fi
