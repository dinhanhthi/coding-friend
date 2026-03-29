#!/usr/bin/env bash
# Usage: load-custom-guide.sh <skill-name>
# Checks local (.coding-friend/skills/) then global (~/.coding-friend/skills/)
# for a custom guide. Outputs content if found, nothing otherwise.

SKILL_NAME="${1:?Usage: load-custom-guide.sh <skill-name>}"

# Defense-in-depth: reject path traversal (skill names are hardcoded, but be safe)
if [[ "$SKILL_NAME" == */* ]] || [[ "$SKILL_NAME" == *\\* ]] || [[ "$SKILL_NAME" == *..* ]]; then
  exit 0
fi

LOCAL=".coding-friend/skills/${SKILL_NAME}-custom/SKILL.md"
GLOBAL="$HOME/.coding-friend/skills/${SKILL_NAME}-custom/SKILL.md"

if [ -f "$LOCAL" ]; then
  cat "$LOCAL"
elif [ -f "$GLOBAL" ]; then
  cat "$GLOBAL"
fi
