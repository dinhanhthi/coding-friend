#!/usr/bin/env bash
# Usage: load-custom-guide.sh <skill-name>
# Checks local (.coding-friend/skills/) then global (~/.coding-friend/skills/)
# for a custom guide. Outputs content if found, nothing otherwise.

SKILL_NAME="${1:?Usage: load-custom-guide.sh <skill-name>}"

LOCAL=".coding-friend/skills/${SKILL_NAME}-custom/SKILL.md"
GLOBAL="$HOME/.coding-friend/skills/${SKILL_NAME}-custom/SKILL.md"

if [ -f "$LOCAL" ]; then
  cat "$LOCAL"
elif [ -f "$GLOBAL" ]; then
  cat "$GLOBAL"
fi
