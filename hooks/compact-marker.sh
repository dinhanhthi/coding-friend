#!/usr/bin/env bash
# PreCompact hook: Preserve critical context before compaction

set -euo pipefail

# Inject a marker so the agent remembers key context after compaction
MARKER="<compact-marker>
TOOLKIT: coding-friend loaded. Rules: test-first, verify-before-claim, conventional-commits.
SKILLS: /cf-plan /cf-review /cf-commit /cf-ship /cf-fix /cf-remember /cf-learn /cf-research /cf-statusline /cf-update
Check coding-friend:cf-help skill for full context.
</compact-marker>"

ESCAPED=$(printf '%s' "$MARKER" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | awk '{printf "%s\\n", $0}' | sed 's/\\n$//')

cat <<EOF
{
  "hookSpecificOutput": {
    "additionalContext": "$ESCAPED"
  }
}
EOF
