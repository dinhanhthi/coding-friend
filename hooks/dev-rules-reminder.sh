#!/usr/bin/env bash
# UserPromptSubmit hook: Inject lightweight development rules reminder
# Keeps agent on track with core rules (<200 tokens)

set -euo pipefail

# Check if hook is disabled via config
CONFIG_FILE=".coding-friend/config.json"
if [ -f "$CONFIG_FILE" ]; then
  if grep -q '"devRulesReminder"[[:space:]]*:[[:space:]]*false' "$CONFIG_FILE" 2>/dev/null; then
    echo '{}'
    exit 0
  fi
fi

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Lightweight reminder — injected on every user prompt
REMINDER="<reminder>
RULES: 1) Check skills first 2) Test before code 3) Verify before claiming 4) Respect .coding-friend/ignore 5) Conventional commits
SKILLS: /cf-plan /cf-review /cf-commit /cf-ship /cf-fix /cf-remember /cf-learn
AUTO: cf-tdd, cf-sys-debug, cf-verification, cf-code-review
</reminder>"

# JSON-escape
ESCAPED=$(printf '%s' "$REMINDER" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | awk '{printf "%s\\n", $0}' | sed 's/\\n$//')

cat <<EOF
{
  "hookSpecificOutput": {
    "additionalContext": "$ESCAPED"
  }
}
EOF
